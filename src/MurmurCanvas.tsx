import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { themeFor, systemMode } from './colors'

// ── Constants ─────────────────────────────────────────────────────────────────
const N         = 500
const MAX_SPEED = 3.5    // world units / frame
const MIN_SPEED = 1.0
const MAX_FORCE = 0.18
const SEP_R     = 28
const ALI_R     = 72
const COH_R     = 95
const PRED_R    = 220
const W_SEP     = 1.8
const W_ALI     = 1.0
const W_COH     = 0.9
const W_ATT     = 0.28
const W_PRED    = 6.0
const AT_SPEED  = 1.4
const DEPTH     = 280    // flock half-depth on Z axis
const PLANE_S   = 16     // plane size in world units (≈ screen pixels at z=0)
const FOV       = 50

const SEP_R2    = SEP_R  * SEP_R
const ALI_R2    = ALI_R  * ALI_R
const COH_R2    = COH_R  * COH_R
const PRED_R2   = PRED_R * PRED_R

// Unique chars from 'MATIAS JANSEN, DESIGNER'
const CHARS = Array.from(new Set('MATIASJNDESIGR'.split(''))) // 11 unique

const ATLAS_CELL = 64
const ATLAS_COLS = 4
const ATLAS_ROWS = Math.ceil(CHARS.length / ATLAS_COLS)       // 3

// ── Types ─────────────────────────────────────────────────────────────────────
interface Boid {
  x: number; y: number; z: number
  vx: number; vy: number; vz: number
  ci: number   // char index into CHARS
}

// ── Component ─────────────────────────────────────────────────────────────────
export function MurmurCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
    let W = window.innerWidth
    let H = window.innerHeight

    const theme = themeFor(systemMode())

    // ── Renderer ──────────────────────────────────────────────────────────────
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(new THREE.Color(theme.surface))

    const scene = new THREE.Scene()

    const dist = (H / 2) / Math.tan((FOV / 2) * Math.PI / 180)
    const camera = new THREE.PerspectiveCamera(FOV, W / H, 0.1, dist * 10)
    camera.position.set(0, 0, dist)
    camera.lookAt(0, 0, 0)

    // ── Atlas texture ─────────────────────────────────────────────────────────
    // Render each unique char into a 64px cell on a transparent canvas
    const atlasCanvas = document.createElement('canvas')
    atlasCanvas.width  = ATLAS_CELL * ATLAS_COLS
    atlasCanvas.height = ATLAS_CELL * ATLAS_ROWS
    const ac = atlasCanvas.getContext('2d')!
    ac.clearRect(0, 0, atlasCanvas.width, atlasCanvas.height)
    ac.fillStyle    = '#ffffff'
    ac.textAlign    = 'center'
    ac.textBaseline = 'middle'
    ac.font = `${Math.round(ATLAS_CELL * 0.68)}px 'SF Pro Display', -apple-system, sans-serif`
    CHARS.forEach((ch, i) => {
      const col = i % ATLAS_COLS
      const row = Math.floor(i / ATLAS_COLS)
      ac.fillText(ch, col * ATLAS_CELL + ATLAS_CELL * 0.5, row * ATLAS_CELL + ATLAS_CELL * 0.5)
    })

    const atlas = new THREE.CanvasTexture(atlasCanvas)
    atlas.colorSpace = THREE.SRGBColorSpace
    // flipY = true (Three.js default): canvas top-row → UV y=1
    // uvOffset.y = 1 − (row+1)/ATLAS_ROWS so bottom-left plane vertex hits cell bottom-left

    // ── Boids ─────────────────────────────────────────────────────────────────
    const boids: Boid[] = Array.from({ length: N }, () => {
      const a = Math.random() * Math.PI * 2
      const p = (Math.random() - 0.5) * 0.4
      const s = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
      return {
        x:  (Math.random() - 0.5) * W * 0.45,
        y:  (Math.random() - 0.5) * H * 0.45,
        z:  (Math.random() - 0.5) * DEPTH * 2,
        vx: Math.cos(p) * Math.cos(a) * s,
        vy: Math.sin(p) * s,
        vz: Math.cos(p) * Math.sin(a) * s,
        ci: Math.floor(Math.random() * CHARS.length),
      }
    })

    // ── InstancedMesh ─────────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(1, 1)

    // Per-instance UV offset — set ONCE (chars don't change)
    const uvOffsets = new Float32Array(N * 2)
    boids.forEach((b, i) => {
      const col = b.ci % ATLAS_COLS
      const row = Math.floor(b.ci / ATLAS_COLS)
      uvOffsets[i * 2]     = col / ATLAS_COLS
      uvOffsets[i * 2 + 1] = 1 - (row + 1) / ATLAS_ROWS   // flipY correction
    })
    geo.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2))

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas:   { value: atlas },
        uColor:   { value: new THREE.Color(theme.onSurface) },
        uUVScale: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) },
      },
      vertexShader: `
        attribute vec2 uvOffset;
        uniform vec2 uUVScale;
        varying vec2 vUv;
        void main() {
          vUv = uv * uUVScale + uvOffset;
          gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0);
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        uniform vec3 uColor;
        varying vec2 vUv;
        void main() {
          float a = texture2D(uAtlas, vUv).a;
          if (a < 0.04) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })

    const mesh = new THREE.InstancedMesh(geo, mat, N)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    scene.add(mesh)

    // ── Attractor ─────────────────────────────────────────────────────────────
    let atX = 0, atY = 0, atZ = 0
    let atAngle = Math.random() * Math.PI * 2
    let atPitch  = 0

    // ── Predator (mouse/touch → world XY at z=0) ──────────────────────────────
    let pwX = -99999, pwY = -99999   // predator world position

    const toWorld = (cx: number, cy: number) => ({
      x:  cx - W / 2,
      y: -(cy - H / 2),
    })
    const onMouseMove  = (e: MouseEvent)  => { const p = toWorld(e.clientX, e.clientY); pwX = p.x; pwY = p.y }
    const onMouseLeave = ()               => { pwX = -99999; pwY = -99999 }
    const onTouchMove  = (e: TouchEvent)  => { const p = toWorld(e.touches[0].clientX, e.touches[0].clientY); pwX = p.x; pwY = p.y }
    const onTouchEnd   = ()               => { pwX = -99999; pwY = -99999 }
    canvas.addEventListener('mousemove',  onMouseMove)
    canvas.addEventListener('mouseleave', onMouseLeave)
    canvas.addEventListener('touchmove',  onTouchMove,  { passive: true })
    canvas.addEventListener('touchend',   onTouchEnd)

    const onResize = () => {
      W = window.innerWidth; H = window.innerHeight
      renderer.setSize(W, H)
      camera.aspect = W / H
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', onResize)

    // ── Per-frame temporaries ─────────────────────────────────────────────────
    const tmpMat   = new THREE.Matrix4()
    const tmpFwd   = new THREE.Vector3()
    const tmpRight = new THREE.Vector3()
    const tmpUp    = new THREE.Vector3()
    const WORLD_UP = new THREE.Vector3(0, 1, 0)
    let fx = 0, fy = 0, fz = 0

    const addSteer = (
      dx: number, dy: number, dz: number,
      bvx: number, bvy: number, bvz: number,
      weight: number,
    ) => {
      const dm = Math.sqrt(dx*dx + dy*dy + dz*dz)
      if (!dm) return
      let sx = dx / dm * MAX_SPEED - bvx
      let sy = dy / dm * MAX_SPEED - bvy
      let sz = dz / dm * MAX_SPEED - bvz
      const sm = Math.sqrt(sx*sx + sy*sy + sz*sz)
      if (sm > MAX_FORCE) { const inv = MAX_FORCE / sm; sx *= inv; sy *= inv; sz *= inv }
      fx += sx * weight; fy += sy * weight; fz += sz * weight
    }

    let frame = 0
    let raf: number

    const tick = () => {
      frame++
      const t = frame / 60

      // ── Camera slow drift to reveal 3D volume ─────────────────────────────
      camera.position.x = Math.sin(t * 0.07) * dist * 0.10
      camera.position.y = Math.sin(t * 0.05 + 1.2) * dist * 0.05
      camera.lookAt(0, 0, 0)

      // ── Attractor wander ──────────────────────────────────────────────────
      atAngle += Math.sin(t * 0.19) * 0.024 + Math.cos(t * 0.11) * 0.016
      atPitch  =  Math.sin(t * 0.13) * 0.25
      atX += Math.cos(atPitch) * Math.cos(atAngle) * AT_SPEED
      atY += Math.sin(atPitch) * AT_SPEED * 0.6
      atZ += Math.cos(atPitch) * Math.sin(atAngle) * AT_SPEED * 0.35
      // Soft pull toward origin when attractor wanders too far
      const aLen = Math.sqrt(atX*atX + atY*atY + atZ*atZ)
      const maxDrift = Math.min(W, H) * 0.38
      if (aLen > maxDrift) { const f = 0.6 / aLen; atX -= atX * f; atY -= atY * f; atZ -= atZ * f }

      // ── Boids simulation (3D) ─────────────────────────────────────────────
      for (let i = 0; i < N; i++) {
        const b = boids[i]

        let sepX = 0, sepY = 0, sepZ = 0, sepN = 0
        let aliVx = 0, aliVy = 0, aliVz = 0, aliN = 0
        let cohX  = 0, cohY  = 0, cohZ  = 0, cohN = 0

        for (let j = 0; j < N; j++) {
          if (i === j) continue
          const o  = boids[j]
          const dx = b.x - o.x
          const dy = b.y - o.y
          const dz = b.z - o.z
          const d2 = dx*dx + dy*dy + dz*dz

          if (d2 < SEP_R2 && d2 > 0) {
            const inv = 1 / Math.sqrt(d2)
            sepX += dx * inv; sepY += dy * inv; sepZ += dz * inv; sepN++
          }
          if (d2 < ALI_R2) { aliVx += o.vx; aliVy += o.vy; aliVz += o.vz; aliN++ }
          if (d2 < COH_R2) { cohX  += o.x;  cohY  += o.y;  cohZ  += o.z;  cohN++ }
        }

        fx = 0; fy = 0; fz = 0

        if (sepN > 0) addSteer(sepX/sepN, sepY/sepN, sepZ/sepN, b.vx, b.vy, b.vz, W_SEP)
        if (aliN > 0) addSteer(aliVx/aliN, aliVy/aliN, aliVz/aliN, b.vx, b.vy, b.vz, W_ALI)
        if (cohN > 0) addSteer(cohX/cohN - b.x, cohY/cohN - b.y, cohZ/cohN - b.z, b.vx, b.vy, b.vz, W_COH)

        // Attractor pull
        addSteer(atX - b.x, atY - b.y, atZ - b.z, b.vx, b.vy, b.vz, W_ATT)

        // Predator scatter (2D screen-space, column of influence through Z)
        const pdx = b.x - pwX
        const pdy = b.y - pwY
        const pd2 = pdx*pdx + pdy*pdy
        if (pd2 < PRED_R2 && pd2 > 0) {
          const pd = Math.sqrt(pd2)
          addSteer(pdx/pd, pdy/pd, 0, b.vx, b.vy, b.vz, W_PRED * (1 - pd / PRED_R))
        }

        // Soft boundary push (XY = screen edges, Z = depth limits)
        const bm = 80
        if (b.x < -W/2 + bm) fx += (-W/2 + bm - b.x) * 0.05
        if (b.x >  W/2 - bm) fx -= (b.x - ( W/2 - bm)) * 0.05
        if (b.y < -H/2 + bm) fy += (-H/2 + bm - b.y) * 0.05
        if (b.y >  H/2 - bm) fy -= (b.y - ( H/2 - bm)) * 0.05
        const zm = DEPTH + bm
        if (b.z < -zm) fz += (-zm - b.z) * 0.05
        if (b.z >  zm) fz -= ( b.z - zm) * 0.05

        b.vx += fx; b.vy += fy; b.vz += fz

        const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy + b.vz*b.vz)
        if (spd > MAX_SPEED) {
          const inv = MAX_SPEED / spd; b.vx *= inv; b.vy *= inv; b.vz *= inv
        } else if (spd < MIN_SPEED && spd > 0) {
          const inv = MIN_SPEED / spd; b.vx *= inv; b.vy *= inv; b.vz *= inv
        }

        b.x += b.vx; b.y += b.vy; b.z += b.vz
      }

      // ── Update instance matrices ───────────────────────────────────────────
      const e = tmpMat.elements
      for (let i = 0; i < N; i++) {
        const b   = boids[i]
        const spd = Math.sqrt(b.vx*b.vx + b.vy*b.vy + b.vz*b.vz) || 1
        tmpFwd.set(b.vx / spd, b.vy / spd, b.vz / spd)

        // Build orthonormal basis from velocity direction
        if (Math.abs(tmpFwd.y) > 0.999) {
          tmpRight.set(1, 0, 0)
        } else {
          tmpRight.crossVectors(tmpFwd, WORLD_UP).normalize()
        }
        tmpUp.crossVectors(tmpRight, tmpFwd).normalize()

        // Column-major Matrix4: [right*S | up*S | fwd | pos]
        // Scaling right+up by PLANE_S makes the 1×1 plane appear PLANE_S units wide/tall
        const S = PLANE_S
        e[0]  = tmpRight.x * S;  e[1]  = tmpRight.y * S;  e[2]  = tmpRight.z * S;  e[3]  = 0
        e[4]  = tmpUp.x    * S;  e[5]  = tmpUp.y    * S;  e[6]  = tmpUp.z    * S;  e[7]  = 0
        e[8]  = tmpFwd.x;        e[9]  = tmpFwd.y;        e[10] = tmpFwd.z;         e[11] = 0
        e[12] = b.x;             e[13] = b.y;             e[14] = b.z;              e[15] = 1

        mesh.setMatrixAt(i, tmpMat)
      }
      mesh.instanceMatrix.needsUpdate = true

      renderer.render(scene, camera)
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      geo.dispose()
      mat.dispose()
      atlas.dispose()
      renderer.dispose()
      canvas.removeEventListener('mousemove',  onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('touchmove',  onTouchMove)
      canvas.removeEventListener('touchend',   onTouchEnd)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block' }}
    />
  )
}
