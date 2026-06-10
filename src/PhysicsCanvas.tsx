import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import RAPIER from '@dimforge/rapier2d-compat'
import opentype from 'opentype.js'
import { type Theme, systemMode, themeFor } from './colors'
import { getLetterSize } from './responsiveTokens'

const fontUrl = '/fonts/OtherSans-Regular.woff'

interface LetterDef {
  char: string
  size: number
}

function buildLetters(size: number): LetterDef[] {
  const rows: string[] = ['Matias', 'Jansen,', 'Designer']
  return rows.flatMap(word =>
    Array.from(word).map(char => ({ char, size }))
  )
}

// --- Bezier flattening ---

type Pt = { x: number; y: number }

function cubicPts(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return {
      x: u*u*u*p0.x + 3*u*u*t*p1.x + 3*u*t*t*p2.x + t*t*t*p3.x,
      y: u*u*u*p0.y + 3*u*u*t*p1.y + 3*u*t*t*p2.y + t*t*t*p3.y,
    }
  })
}

function quadPts(p0: Pt, p1: Pt, p2: Pt, n = 8): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return {
      x: u*u*p0.x + 2*u*t*p1.x + t*t*p2.x,
      y: u*u*p0.y + 2*u*t*p1.y + t*t*p2.y,
    }
  })
}

function pathToContours(cmds: opentype.PathCommand[]): Pt[][] {
  const contours: Pt[][] = []
  let cur: Pt[] = []
  let pos: Pt = { x: 0, y: 0 }

  for (const cmd of cmds) {
    if (cmd.type === 'M') {
      if (cur.length) contours.push(cur)
      pos = { x: cmd.x, y: cmd.y }
      cur = [{ ...pos }]
    } else if (cmd.type === 'L') {
      pos = { x: cmd.x, y: cmd.y }
      cur.push({ ...pos })
    } else if (cmd.type === 'C') {
      const pts = cubicPts(pos, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x2, y: cmd.y2 }, { x: cmd.x, y: cmd.y })
      cur.push(...pts.slice(1))
      pos = { x: cmd.x, y: cmd.y }
    } else if (cmd.type === 'Q') {
      const pts = quadPts(pos, { x: cmd.x1, y: cmd.y1 }, { x: cmd.x, y: cmd.y })
      cur.push(...pts.slice(1))
      pos = { x: cmd.x, y: cmd.y }
    } else if (cmd.type === 'Z') {
      if (cur.length) { contours.push(cur); cur = [] }
    }
  }
  if (cur.length) contours.push(cur)
  return contours
}

function contourArea(c: Pt[]): number {
  const xs = c.map(p => p.x), ys = c.map(p => p.y)
  return (Math.max(...xs) - Math.min(...xs)) * (Math.max(...ys) - Math.min(...ys))
}

function simplify(pts: Pt[], minDist = 2): Pt[] {
  if (!pts.length) return pts
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const prev = out[out.length - 1]
    const dx = pts[i].x - prev.x, dy = pts[i].y - prev.y
    if (Math.sqrt(dx*dx + dy*dy) >= minDist) out.push(pts[i])
  }
  return out
}

interface TrailSample {
  x: number
  y: number
  angle: number
  timestamp: number
}

interface Entry {
  body: RAPIER.RigidBody
  path2d: Path2D
  upperPath2d: Path2D
  renderOffset: Pt
  trail: TrailSample[]
  advance: number
  flagX: number
  flagY: number
}

export function PhysicsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const webglCanvasRef = useRef<HTMLCanvasElement>(null)
  const windBallRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    const webglCanvas = webglCanvasRef.current!
    const windBall = windBallRef.current!
    const ctx = canvas.getContext('2d')!
    const dpr = window.devicePixelRatio ?? 1
    const W = window.innerWidth
    const H = window.innerHeight
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    ctx.scale(dpr, dpr)

    let rafId = 0
    let alive = true
    let theme: Theme = themeFor(systemMode())
    let flagModeActive = Math.random() < 0.5
    // Continuous rotation: π/2 every 5s = π/10 rad/s — no stepping, no phase shock
    const WIND_RATE = Math.PI / 10
    let mouseNDC: { x: number; y: number } | null = null
    let smoothedNDC: { x: number; y: number } | null = null

    let threeSetup: {
      renderer: THREE.WebGLRenderer
      scene: THREE.Scene
      camera: THREE.PerspectiveCamera
      geometry: THREE.PlaneGeometry
      texture: THREE.CanvasTexture
      origPositions: Float32Array
      wireLines: THREE.Mesh
      dots: THREE.Points
      dotMat: THREE.ShaderMaterial
    } | null = null
    canvas.style.backgroundColor = theme.surface
    canvas.style.display = flagModeActive ? 'none' : 'block'
    webglCanvas.style.display = flagModeActive ? 'block' : 'none'
    let gravityDirection = 0 // 0=down, 1=right, 2=up, 3=left
    let setGravity: ((dir: number) => void) | undefined

    async function init() {
      await RAPIER.init()
      const buf = await fetch(fontUrl).then(r => r.arrayBuffer())
      const otFont = opentype.parse(buf)

      if (!alive) return

      const world = new RAPIER.World({ x: 0, y: 800 })

      const gravityVectors = [
        { x: 0, y: 800 },    // down
        { x: 800, y: 0 },    // right
        { x: 0, y: -800 },   // up
        { x: -800, y: 0 },   // left
      ]

      setGravity = (dir: number) => {
        world.gravity = gravityVectors[dir % 4]
      }

      let cW = W, cH = H

      const makeStatic = (x: number, y: number, hw: number, hh: number) => {
        const body = world.createRigidBody(RAPIER.RigidBodyDesc.fixed().setTranslation(x, y))
        world.createCollider(RAPIER.ColliderDesc.cuboid(hw, hh), body)
        return body
      }
      const floor  = makeStatic(W / 2, H + 40,  W * 2, 40)
      const ceiling = makeStatic(W / 2, -40,    W * 2, 40)
      const wallL  = makeStatic(-40,   H / 2,   40, H * 2)
      const wallR  = makeStatic(W + 40, H / 2,  40, H * 2)

      const onResize = () => {
        const dpr = window.devicePixelRatio ?? 1
        cW = window.innerWidth
        cH = window.innerHeight
        canvas.width = cW * dpr
        canvas.height = cH * dpr
        canvas.style.width = `${cW}px`
        canvas.style.height = `${cH}px`
        ctx.scale(dpr, dpr)
        floor.setTranslation({ x: cW / 2, y: cH + 40 }, true)
        ceiling.setTranslation({ x: cW / 2, y: -40 }, true)
        wallL.setTranslation({ x: -40, y: cH / 2 }, true)
        wallR.setTranslation({ x: cW + 40, y: cH / 2 }, true)

        const newSize = parseInt(getLetterSize(cW))
        if (newSize !== currentLetterSize) {
          currentLetterSize = newSize
          spawnLetters(currentLetterSize, cW, cH)
        }
        computeFlagLayout(cW, cH, currentLetterSize)
      }

      let resizeTimer = 0
      resizeObserver = new ResizeObserver(() => {
        clearTimeout(resizeTimer)
        resizeTimer = window.setTimeout(() => onResize(), 150)
      })
      resizeObserver.observe(document.documentElement)

      const entries: Entry[] = []
      let currentLetterSize = parseInt(getLetterSize(W))

      function spawnLetters(size: number, width: number, height: number) {
        // Remove existing letter bodies
        for (const { body } of entries) world.removeRigidBody(body)
        entries.length = 0

        const letters = buildLetters(size)
        for (const letter of letters) {
          const glyph = otFont.charToGlyph(letter.char)
          const path = glyph.getPath(0, 0, letter.size)
          const bb = glyph.getBoundingBox()
          const scale = letter.size / otFont.unitsPerEm

          const renderOffset: Pt = {
            x: (bb.x1 + bb.x2) / 2 * scale,
            y: -(bb.y1 + bb.y2) / 2 * scale,
          }

          const contours = pathToContours(path.commands)
          if (!contours.length) continue
          const outer = contours.sort((a, b) => contourArea(b) - contourArea(a))[0]
          const simplified = simplify(outer, 2)
          if (simplified.length < 4) continue

          const verts = simplified.map(p => ({ x: p.x - renderOffset.x, y: p.y - renderOffset.y }))
          const flatVerts = new Float32Array(verts.flatMap(p => [p.x, p.y]))

          const spawnX = 60 + Math.random() * (width - 120)
          const spawnY = 60 + Math.random() * (height * 0.5)

          const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
            .setTranslation(spawnX, spawnY)
            .setRotation((Math.random() - 0.5) * 0.4)
          const body = world.createRigidBody(bodyDesc)

          const hull = RAPIER.ColliderDesc.convexHull(flatVerts)
          if (!hull) continue
          hull.setRestitution(0.8).setFriction(0.6)
          world.createCollider(hull, body)

          const advance = (glyph.advanceWidth ?? 0) * scale
          const upperGlyph = otFont.charToGlyph(letter.char.toUpperCase())
          const upperPath = upperGlyph.getPath(0, 0, letter.size)
          entries.push({ body, path2d: new Path2D(path.toPathData(4)), upperPath2d: new Path2D(upperPath.toPathData(4)), renderOffset, trail: [], advance, flagX: 0, flagY: 0 })
        }
      }

      // Row lengths matching buildLetters: 'Matias'=6, 'Jansen,'=7, 'Designer'=8
      const rowLengths = [6, 7, 8]

      function computeFlagLayout(width: number, height: number, size: number) {
        const lineHeight = size * 1.2
        let idx = 0
        rowLengths.forEach((rowLen, ri) => {
          let rowWidth = 0
          for (let i = 0; i < rowLen; i++) rowWidth += entries[idx + i].advance
          let x = (width - rowWidth) / 2
          const y = height / 2 + (ri - 1) * lineHeight
          for (let i = 0; i < rowLen; i++) {
            entries[idx + i].flagX = x
            entries[idx + i].flagY = y
            x += entries[idx + i].advance
          }
          idx += rowLen
        })
      }

      const COLS = 40


      function buildFlagTexture(): HTMLCanvasElement {
        const dpr = window.devicePixelRatio ?? 1
        const tileW = cW / COLS
        const tileH = tileW
        const ROWS = Math.ceil(cH / tileH)
        const scale = (tileH * 0.3) / currentLetterSize

        const tc = document.createElement('canvas')
        tc.width = Math.ceil(cW * dpr)
        tc.height = Math.ceil(ROWS * tileH * dpr)
        const tctx = tc.getContext('2d')!
        tctx.scale(dpr, dpr)
        // Transparent background — only letters and gridlines are drawn
        tctx.fillStyle = theme.onSurface
        for (let row = 0; row < ROWS; row++) {
          for (let col = 0; col < COLS; col++) {
            const idx = ((row * COLS + col) % entries.length + entries.length) % entries.length
            const { upperPath2d, renderOffset } = entries[idx]
            tctx.save()
            tctx.translate(col * tileW + tileW / 2, row * tileH + tileH / 2)
            tctx.scale(scale, scale)
            tctx.translate(-renderOffset.x, -renderOffset.y)
            tctx.fill(upperPath2d, 'evenodd')
            tctx.restore()
          }
        }
        // gridlines hidden for now
        return tc
      }

      function initThreeFlag() {
        threeSetup?.renderer.dispose()

        const tileW = cW / COLS
        const ROWS = Math.ceil(cH / tileW)

        const renderer = new THREE.WebGLRenderer({ canvas: webglCanvas, antialias: true })
        renderer.setSize(cW, cH)
        renderer.setPixelRatio(window.devicePixelRatio ?? 1)
        renderer.setClearColor(new THREE.Color(theme.surface))

        const scene = new THREE.Scene()

        const fov = 45
        const dist = (cH / 2) / Math.tan((fov / 2) * Math.PI / 180)
        const camera = new THREE.PerspectiveCamera(fov, cW / cH, 1, dist * 10)
        camera.position.set(0, 0, dist)
        camera.lookAt(0, 0, 0)

        const texCanvas = buildFlagTexture()
        const texture = new THREE.CanvasTexture(texCanvas)
        texture.colorSpace = THREE.SRGBColorSpace
        texture.minFilter = THREE.LinearMipmapLinearFilter
        texture.magFilter = THREE.LinearFilter
        texture.generateMipmaps = true

        const geometry = new THREE.PlaneGeometry(cW, cH, COLS * 8, ROWS * 8)
        const origPositions = new Float32Array(0) // unused — displacement is in GLSL

        const material = new THREE.ShaderMaterial({
          uniforms: {
            uMap:      { value: texture },
            uTime:     { value: 0 },
            uGust:     { value: 1 },
            uWindAngle:{ value: 0 },
            uMaxZ:     { value: cW * 0.14 },
            uMaxY:     { value: cH * 0.07 },
            uWidth:    { value: cW },
            uHeight:   { value: cH },
            uMouseX:   { value: 0 },
            uMouseY:   { value: 0 },
            uMouseActive: { value: 0 },
            uMouseSigma:  { value: Math.min(cW, cH) * 0.12 },
            uWindStr:  { value: 1 },
          },
          vertexShader: `
            uniform float uTime;
            uniform float uGust;
            uniform float uWindAngle;
            uniform float uMaxZ;
            uniform float uMaxY;
            uniform float uWidth;
            uniform float uHeight;
            uniform float uMouseX;
            uniform float uMouseY;
            uniform float uMouseActive;
            uniform float uMouseSigma;
            uniform float uWindStr;
            varying vec2 vUv;

            void main() {
              vUv = uv;
              vec3 pos = position;

              float nx = (pos.x + uWidth  * 0.5) / uWidth;
              float ny = (pos.y + uHeight * 0.5) / uHeight;

              float cosW = cos(uWindAngle);
              float sinW = sin(uWindAngle);
              float along  =  nx * cosW + ny * sinW;
              float across = -nx * sinW + ny * cosW;

              float pin = 1.0;

              // Z ripples — 8 octaves from large waves to fine grain
              float dz = 0.0;
              dz += sin(along *  3.8 - uTime * 2.6)                        * 1.00;
              dz += sin(along *  8.3 - uTime * 5.1 + across *  2.4)        * 0.30;
              dz += sin(across * 4.1 - uTime * 3.2 + along  *  1.7)        * 0.20;
              dz += sin(along * 13.1 - uTime * 7.7 + across *  4.9)        * 0.15;
              dz += sin(along * 22.0 - uTime *11.0 + across *  7.3)        * 0.09;
              dz += sin(across*17.5  - uTime * 9.3 + along  *  5.8)        * 0.07;
              dz += sin(along * 37.0 - uTime *19.1 + across * 13.2)        * 0.05;
              dz += sin(across*29.0  - uTime *15.4 + along  *  9.7)        * 0.04;
              dz += sin(along * 58.0 - uTime *27.3 + across * 21.0)        * 0.03;
              dz += sin(across*47.0  - uTime *23.1 + along  * 16.4)        * 0.025;
              dz += sin(along * 82.0 - uTime *38.7 + across * 31.5)        * 0.018;
              dz += sin(across*71.0  - uTime *34.2 + along  * 24.8)        * 0.014;
              dz *= uMaxZ * pin;

              // Y flutter — 4 octaves
              float dy = 0.0;
              dy += sin(across * 2.9 - uTime * 1.9 + along * 3.14159)      * 1.00;
              dy += sin(along  * 3.7 - uTime * 2.3 + across * 1.8)         * 0.40;
              dy += sin(along  * 6.7 - uTime * 3.8 + across * 2.1)         * 0.25;
              dy += sin(across * 9.1 - uTime * 5.2 + along  * 3.4)         * 0.12;
              dy *= uMaxY * pin;

              // Mouse wind jet
              float mdz = 0.0;
              if (uMouseActive > 0.5) {
                float ddx = pos.x - uMouseX;
                float ddy = pos.y - uMouseY;
                float g = exp(-(ddx*ddx + ddy*ddy) / (2.0 * uMouseSigma * uMouseSigma));
                mdz -= uMaxZ * 6.4 * uWindStr * g;
              }

              pos.z += dz * uGust + mdz;
              pos.y += dy * uGust;

              gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
            }
          `,
          fragmentShader: `
            uniform sampler2D uMap;
            varying vec2 vUv;
            void main() {
              gl_FragColor = texture2D(uMap, vUv);
            }
          `,
          side: THREE.DoubleSide,
          transparent: true,
        })

        const mesh = new THREE.Mesh(geometry, material)
        scene.add(mesh)

        const dotMat = new THREE.ShaderMaterial({
          uniforms: Object.assign(material.uniforms, { uColor: { value: new THREE.Color(theme.onSurfaceVariant) } }),
          vertexShader: material.vertexShader.replace(
            'gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);',
            'gl_PointSize = 2.0; gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);'
          ),
          fragmentShader: `
            uniform vec3 uColor;
            void main() { gl_FragColor = vec4(uColor, 0.6); }
          `,
          transparent: true,

        })
        const dots = new THREE.Points(geometry, dotMat)
        dots.visible = true
        scene.add(dots)

        const wireMat = new THREE.ShaderMaterial({
          uniforms: material.uniforms,
          vertexShader: material.vertexShader,
          fragmentShader: `void main() { gl_FragColor = vec4(0.0, 0.0, 0.0, 0.35); }`,
          wireframe: true,
          transparent: true,
        })
        const wireLines = new THREE.Mesh(geometry, wireMat)
        wireLines.visible = false
        scene.add(wireLines)

        threeSetup = { renderer, scene, camera, geometry, texture, origPositions, wireLines, dots, dotMat }
      }

      spawnLetters(currentLetterSize, W, H)
      computeFlagLayout(W, H, currentLetterSize)

      let draggedBody: RAPIER.RigidBody | null = null
      let dragOffsetX = 0, dragOffsetY = 0

      const tryDrag = (x: number, y: number) => {
        for (const { body, renderOffset } of entries) {
          const pos = body.translation()
          const angle = body.rotation()
          const cos = Math.cos(-angle), sin = Math.sin(-angle)
          const lx = cos * (x - pos.x) - sin * (y - pos.y)
          const ly = sin * (x - pos.x) + cos * (y - pos.y)
          const hw = Math.abs(renderOffset.x)
          const hh = Math.abs(renderOffset.y)
          if (Math.abs(lx) < hw && Math.abs(ly) < hh) {
            draggedBody = body
            dragOffsetX = x - pos.x
            dragOffsetY = y - pos.y
            body.setBodyType(RAPIER.RigidBodyType.KinematicPositionBased, true)
            return true
          }
        }
        return false
      }

      const onMouseDown = (e: MouseEvent) => {
        tryDrag(e.clientX, e.clientY)
      }

      const onMouseMove = (e: MouseEvent) => {
        if (!draggedBody) return
        draggedBody.setNextKinematicTranslation({
          x: e.clientX - dragOffsetX,
          y: e.clientY - dragOffsetY,
        })
      }

      const onMouseUp = () => {
        if (!draggedBody) return
        draggedBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
        draggedBody = null
      }

      const onTouchStart = (e: TouchEvent) => {
        if (e.touches.length === 0) return
        tryDrag(e.touches[0].clientX, e.touches[0].clientY)
      }

      const onTouchMove = (e: TouchEvent) => {
        if (!draggedBody || e.touches.length === 0) return
        draggedBody.setNextKinematicTranslation({
          x: e.touches[0].clientX - dragOffsetX,
          y: e.touches[0].clientY - dragOffsetY,
        })
      }

      const onTouchEnd = () => {
        if (!draggedBody) return
        draggedBody.setBodyType(RAPIER.RigidBodyType.Dynamic, true)
        draggedBody = null
      }

      canvas.addEventListener('mousedown', onMouseDown)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      canvas.addEventListener('touchstart', onTouchStart)
      document.addEventListener('touchmove', onTouchMove)
      document.addEventListener('touchend', onTouchEnd)
      cleanupDrag = () => {
        canvas.removeEventListener('mousedown', onMouseDown)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
        canvas.removeEventListener('touchstart', onTouchStart)
        document.removeEventListener('touchmove', onTouchMove)
        document.removeEventListener('touchend', onTouchEnd)
      }

      let lastTime = performance.now()
      let lastSecond = -1
      const draw = (now: number) => {
        if (!alive) return

        const dt = Math.min((now - lastTime) / 1000, 0.05)
        lastTime = now
        world.timestep = dt
        world.step()

        const currentSecond = Math.floor((now / 1000) % 60)
        if (currentSecond !== lastSecond && currentSecond % 5 === 0) {
          gravityDirection = (gravityDirection + 1) % 4
          setGravity?.(gravityDirection)
        }
        lastSecond = currentSecond

        const isMobile = navigator.maxTouchPoints > 0 && Math.min(window.innerWidth, window.innerHeight) < 768
        const trailDuration = isMobile ? 200 : 400
        const trailSubsteps = isMobile ? 1 : 3

        if (flagModeActive) {
          // Three.js renders to its own canvas — just update wave vertices each frame
          if (!threeSetup) initThreeFlag()
          if (threeSetup) {
            const { renderer, scene, camera } = threeSetup
            const t = now / 1000

            const windAngle = -t * WIND_RATE

            // Ease smoothedNDC toward mouseNDC each frame (dt-independent lerp)
            const ease = 1 - Math.pow(0.04, dt)
            if (mouseNDC) {
              if (!smoothedNDC) smoothedNDC = { ...mouseNDC }
              else {
                smoothedNDC.x += (mouseNDC.x - smoothedNDC.x) * ease
                smoothedNDC.y += (mouseNDC.y - smoothedNDC.y) * ease
              }
            } else {
              smoothedNDC = null
            }

            // Slow gust envelope
            const gust = 0.6 + 0.25 * Math.sin(t * 0.31) + 0.15 * Math.cos(t * 0.19 + 1.1)
            // Rough gusty mouse wind stream: layered sines at mismatched frequencies
            const windStr = 0.85 + 0.07 * Math.sin(t * 4.3) + 0.04 * Math.cos(t * 9.1 + 1.7) + 0.04 * Math.sin(t * 17.3 - 0.9)

            const mat = (scene.children[0] as THREE.Mesh).material as THREE.ShaderMaterial
            mat.uniforms.uTime.value      = t
            mat.uniforms.uGust.value      = gust
            mat.uniforms.uWindAngle.value = windAngle
            mat.uniforms.uWindStr.value   = windStr
            threeSetup.dotMat.uniforms.uColor.value.set(theme.onSurfaceVariant)

            if (smoothedNDC) {
              mat.uniforms.uMouseActive.value = 1
              mat.uniforms.uMouseX.value = smoothedNDC.x * cW / 2
              mat.uniforms.uMouseY.value = smoothedNDC.y * cH / 2
            } else {
              mat.uniforms.uMouseActive.value = 0
            }

            renderer.render(scene, camera)

            if (windBallVisible && smoothedNDC) {
              const sigma = Math.min(cW, cH) * 0.12
              const ballR = sigma * (1.5 + 0.5 * windStr)
              const cx = (smoothedNDC.x + 1) / 2 * cW
              const cy = (1 - smoothedNDC.y) / 2 * cH
              windBall.style.display = 'block'
              windBall.style.width = `${ballR * 2}px`
              windBall.style.height = `${ballR * 2}px`
              windBall.style.left = `${cx - ballR}px`
              windBall.style.top = `${cy - ballR}px`
              windBall.style.opacity = String(0.4 + 0.6 * windStr)
            } else if (!windBallVisible) {
              windBall.style.display = 'none'
            }
          }
          rafId = requestAnimationFrame(draw)
          return
        }

        ctx.clearRect(0, 0, cW, cH)

        {
          for (const entry of entries) {
            const { body, path2d, renderOffset, trail } = entry
            const pos = body.translation()
            const angle = body.rotation()

            const prev = trail[trail.length - 1]
            if (prev) {
              let da = angle - prev.angle
              if (da > Math.PI) da -= 2 * Math.PI
              if (da < -Math.PI) da += 2 * Math.PI
              for (let s = 1; s <= trailSubsteps; s++) {
                const t = s / (trailSubsteps + 1)
                trail.push({
                  x: prev.x + (pos.x - prev.x) * t,
                  y: prev.y + (pos.y - prev.y) * t,
                  angle: prev.angle + da * t,
                  timestamp: prev.timestamp + (now - prev.timestamp) * t,
                })
              }
            }
            trail.push({ x: pos.x, y: pos.y, angle, timestamp: now })
            while (trail.length > 0 && now - trail[0].timestamp > trailDuration) trail.shift()

            for (let i = 0; i < trail.length - 1; i++) {
              const age = now - trail[i].timestamp
              const alpha = (1 - age / trailDuration) * 0.35
              ctx.save()
              ctx.globalAlpha = alpha
              ctx.translate(trail[i].x, trail[i].y)
              ctx.rotate(trail[i].angle)
              ctx.translate(-renderOffset.x, -renderOffset.y)
              ctx.fillStyle = theme.onSurface
              ctx.fill(path2d, 'evenodd')
              ctx.restore()
            }

            ctx.save()
            ctx.translate(pos.x, pos.y)
            ctx.rotate(angle)
            ctx.translate(-renderOffset.x, -renderOffset.y)
            ctx.fillStyle = theme.onSurface
            ctx.fill(path2d, 'evenodd')
            ctx.restore()
          }
        }

        // Analog clock (hidden for now)
        /*
        const currentTime = new Date()
        const hours = currentTime.getHours() % 12
        const minutes = currentTime.getMinutes()
        const seconds = currentTime.getSeconds()
        const ms = currentTime.getMilliseconds()

        const totalMs = seconds * 1000 + ms
        const secondsAngle = (totalMs / 60000) * 2 * Math.PI - Math.PI / 2
        const minuteAngle = (minutes * 60000 + totalMs) / 3600000 * 2 * Math.PI - Math.PI / 2
        const hourAngle = (hours * 3600000 + minutes * 60000 + totalMs) / 43200000 * 2 * Math.PI - Math.PI / 2

        const cx = cW / 2, cy = cH / 2
        ctx.lineCap = 'round'

        // Seconds hand (orange-red)
        ctx.strokeStyle = '#ff5722'
        ctx.lineWidth = 1.5
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(secondsAngle) * 70, cy + Math.sin(secondsAngle) * 70)
        ctx.stroke()

        // Minute hand
        ctx.strokeStyle = theme.letter
        ctx.lineWidth = 2
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(minuteAngle) * 60, cy + Math.sin(minuteAngle) * 60)
        ctx.stroke()

        // Hour hand
        ctx.lineWidth = 3
        ctx.beginPath()
        ctx.moveTo(cx, cy)
        ctx.lineTo(cx + Math.cos(hourAngle) * 40, cy + Math.sin(hourAngle) * 40)
        ctx.stroke()
        */

        rafId = requestAnimationFrame(draw)
      }
      rafId = requestAnimationFrame(draw)
    }

    // Sync with system color scheme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onSchemeChange = () => {
      theme = themeFor(systemMode())
      canvas.style.backgroundColor = theme.surface
      threeSetup?.renderer.dispose()
      threeSetup = null
    }
    mq.addEventListener('change', onSchemeChange)

    // Triple-0 secret toggle (dark/light)
    let zeroCount = 0
    let zeroTimer = 0
    // Triple-9 secret toggle (rotate gravity)
    let nineCount = 0
    let nineTimer = 0
    // Triple-M toggle (flag mode)
    let mCount = 0
    let mTimer = 0
    // Triple-G toggle (wind ball visibility)
    let gCount = 0
    let gTimer = 0
    let windBallVisible = false
    // Triple-W toggle (wireframe)
    let wCount = 0
    let wTimer = 0
    let wireframeActive = false
    // Triple-D toggle (dots)
    let dCount = 0
    let dTimer = 0
    let dotsActive = true
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '0') {
        zeroCount++
        clearTimeout(zeroTimer)
        zeroTimer = window.setTimeout(() => { zeroCount = 0 }, 500)
        if (zeroCount >= 3) {
          zeroCount = 0
          const newMode = theme === themeFor('dark') ? 'light' : 'dark'
          theme = themeFor(newMode)
          canvas.style.backgroundColor = theme.surface
          threeSetup?.renderer.dispose()
          threeSetup = null
          window.dispatchEvent(new CustomEvent('theme-toggle', { detail: { mode: newMode } }))
        }
      } else if (e.key === '9') {
        nineCount++
        clearTimeout(nineTimer)
        nineTimer = window.setTimeout(() => { nineCount = 0 }, 500)
        if (nineCount >= 3) {
          nineCount = 0
          gravityDirection = (gravityDirection + 1) % 4
          setGravity?.(gravityDirection)
        }
      } else if (e.key === 'g' || e.key === 'G') {
        gCount++
        clearTimeout(gTimer)
        gTimer = window.setTimeout(() => { gCount = 0 }, 500)
        if (gCount >= 3) {
          gCount = 0
          windBallVisible = !windBallVisible
          if (!windBallVisible) windBall.style.display = 'none'
        }
      } else if (e.key === 'w' || e.key === 'W') {
        wCount++
        clearTimeout(wTimer)
        wTimer = window.setTimeout(() => { wCount = 0 }, 500)
        if (wCount >= 3) {
          wCount = 0
          wireframeActive = !wireframeActive
          if (threeSetup) {
            threeSetup.wireLines.visible = wireframeActive
          }
        }
      } else if (e.key === 'd' || e.key === 'D') {
        dCount++
        clearTimeout(dTimer)
        dTimer = window.setTimeout(() => { dCount = 0 }, 500)
        if (dCount >= 3) {
          dCount = 0
          dotsActive = !dotsActive
          if (threeSetup) threeSetup.dots.visible = dotsActive
        }
      } else if (e.key === 'm' || e.key === 'M') {
        mCount++
        clearTimeout(mTimer)
        mTimer = window.setTimeout(() => { mCount = 0 }, 500)
        if (mCount >= 3) {
          mCount = 0
          flagModeActive = !flagModeActive
          canvas.style.display = flagModeActive ? 'none' : 'block'
          if (flagModeActive) {
            webglCanvas.style.display = 'block'
            webglCanvas.classList.remove('flag-enter')
            void webglCanvas.offsetWidth // force reflow so animation re-triggers
            webglCanvas.classList.add('flag-enter')
          } else {
            webglCanvas.style.display = 'none'
            webglCanvas.classList.remove('flag-enter')
          }
          windBall.style.display = 'none'
          if (!flagModeActive) {
            threeSetup?.renderer.dispose()
            threeSetup = null
          }
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    const toNDC = (clientX: number, clientY: number) => {
      const r = webglCanvas.getBoundingClientRect()
      return { x: ((clientX - r.left) / r.width) * 2 - 1, y: -((clientY - r.top) / r.height) * 2 + 1 }
    }
    const onFlagMouseMove  = (e: MouseEvent) => { mouseNDC = toNDC(e.clientX, e.clientY) }
    const onFlagMouseLeave = () => { mouseNDC = null }
    const onFlagMouseDown  = (e: MouseEvent) => { mouseNDC = toNDC(e.clientX, e.clientY) }
    const onFlagMouseUp    = () => { }
    const onFlagTouchMove  = (e: TouchEvent) => {
      if (e.touches.length) mouseNDC = toNDC(e.touches[0].clientX, e.touches[0].clientY)
    }
    const onFlagTouchEnd   = () => { mouseNDC = null }
    const onFlagTouchStart = (e: TouchEvent) => {
      if (!e.touches.length) return
      mouseNDC = toNDC(e.touches[0].clientX, e.touches[0].clientY)
    }
    webglCanvas.addEventListener('mousemove',  onFlagMouseMove)
    webglCanvas.addEventListener('mouseleave', onFlagMouseLeave)
    webglCanvas.addEventListener('mousedown',  onFlagMouseDown)
    document.addEventListener('mouseup',       onFlagMouseUp)
    webglCanvas.addEventListener('touchmove',  onFlagTouchMove)
    webglCanvas.addEventListener('touchend',   onFlagTouchEnd)
    webglCanvas.addEventListener('touchstart', onFlagTouchStart)

    let resizeObserver: ResizeObserver | undefined
    let cleanupDrag: (() => void) | undefined
    init().catch(err => console.error('PhysicsCanvas init error:', err))
    return () => {
      alive = false
      cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
      cleanupDrag?.()
      mq.removeEventListener('change', onSchemeChange)
      document.removeEventListener('keydown', onKeyDown)
      threeSetup?.renderer.dispose()
      webglCanvas.removeEventListener('mousemove',  onFlagMouseMove)
      webglCanvas.removeEventListener('mouseleave', onFlagMouseLeave)
      webglCanvas.removeEventListener('mousedown',  onFlagMouseDown)
      document.removeEventListener('mouseup',       onFlagMouseUp)
      webglCanvas.removeEventListener('touchmove',  onFlagTouchMove)
      webglCanvas.removeEventListener('touchend',   onFlagTouchEnd)
      webglCanvas.removeEventListener('touchstart', onFlagTouchStart)
    }
  }, [])

  return (
    <>
      <canvas ref={canvasRef} style={{ display: 'block', cursor: 'default', animation: 'blurInHeavy 0.8s ease-out both' }} />
      <canvas ref={webglCanvasRef} style={{ position: 'fixed', inset: 0, display: 'none' }} />
      <div ref={windBallRef} style={{
        display: 'none',
        position: 'fixed',
        borderRadius: '50%',
        pointerEvents: 'none',
        background: 'radial-gradient(circle, rgba(57,255,20,0.22) 0%, rgba(57,255,20,0.08) 45%, rgba(57,255,20,0) 100%)',
        boxShadow: '0 0 32px 8px rgba(57,255,20,0.15)',
      }} />
    </>
  )
}
