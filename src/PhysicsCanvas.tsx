import { useEffect, useRef } from 'react'
import RAPIER from '@dimforge/rapier2d-compat'
import opentype from 'opentype.js'
import { type Theme, systemMode, themeFor } from './colors'
import { getLetterSize } from './responsiveTokens'

const fontUrl = '/fonts/SF-Pro-Display-Regular.otf'

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

interface Entry {
  body: RAPIER.RigidBody
  svgPath: string
  renderOffset: Pt
}

export function PhysicsCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current!
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

          entries.push({ body, svgPath: path.toPathData(4), renderOffset })
        }
      }

      spawnLetters(currentLetterSize, W, H)

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

        ctx.fillStyle = theme.trail
        ctx.fillRect(0, 0, cW, cH)

        for (const { body, svgPath, renderOffset } of entries) {
          const pos = body.translation()
          const angle = body.rotation()
          ctx.save()
          ctx.translate(pos.x, pos.y)
          ctx.rotate(angle)
          ctx.translate(-renderOffset.x, -renderOffset.y)
          ctx.fillStyle = theme.onSurface
          ctx.fill(new Path2D(svgPath), 'evenodd')
          ctx.restore()
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
    const onSchemeChange = () => { theme = themeFor(systemMode()) }
    mq.addEventListener('change', onSchemeChange)

    // Triple-0 secret toggle (dark/light)
    let zeroCount = 0
    let zeroTimer = 0
    // Triple-9 secret toggle (rotate gravity)
    let nineCount = 0
    let nineTimer = 0
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === '0') {
        zeroCount++
        clearTimeout(zeroTimer)
        zeroTimer = window.setTimeout(() => { zeroCount = 0 }, 500)
        if (zeroCount >= 3) {
          zeroCount = 0
          const newMode = theme === themeFor('dark') ? 'light' : 'dark'
          theme = themeFor(newMode)
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
      }
    }
    document.addEventListener('keydown', onKeyDown)

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
    }
  }, [])

  return <canvas ref={canvasRef} style={{ display: 'block', cursor: 'default' }} />
}
