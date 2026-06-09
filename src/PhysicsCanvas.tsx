import { useEffect, useRef } from 'react'
import RAPIER from '@dimforge/rapier2d-compat'
import opentype from 'opentype.js'
import { type Theme, systemMode, themeFor } from './colors'

const fontUrl = '/fonts/SF-Pro-Display-Regular.otf'

interface LetterDef {
  char: string
  size: number
}

function buildLetters(): LetterDef[] {
  const rows: [string, number][] = [
    ['Matias',    256],
    ['Jansen,',   256],
    ['Designer',  256],
  ]
  return rows.flatMap(([word, size]) =>
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

    async function init() {
      await RAPIER.init()
      const buf = await fetch(fontUrl).then(r => r.arrayBuffer())
      const otFont = opentype.parse(buf)

      if (!alive) return

      const world = new RAPIER.World({ x: 0, y: 800 })

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
      }

      resizeObserver = new ResizeObserver(() => onResize())
      resizeObserver.observe(document.documentElement)

      const letters = buildLetters()
      const entries: Entry[] = []

      for (const [i, letter] of letters.entries()) {
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

        const spawnX = 60 + Math.random() * (W - 120)
        const spawnY = 60 + Math.random() * (H * 0.5)

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

      let draggedBody: RAPIER.RigidBody | null = null
      let dragOffsetX = 0, dragOffsetY = 0

      const onMouseDown = (e: MouseEvent) => {
        const x = e.clientX, y = e.clientY
        for (const { body, renderOffset } of entries) {
          const pos = body.translation()
          const angle = body.rotation()
          // transform mouse into body-local space to account for rotation
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
            break
          }
        }
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

      canvas.addEventListener('mousedown', onMouseDown)
      document.addEventListener('mousemove', onMouseMove)
      document.addEventListener('mouseup', onMouseUp)
      cleanupDrag = () => {
        canvas.removeEventListener('mousedown', onMouseDown)
        document.removeEventListener('mousemove', onMouseMove)
        document.removeEventListener('mouseup', onMouseUp)
      }

      let lastTime = performance.now()
      let stillFrames = 0
      const STILL_THRESHOLD = 0.5
      const FULL_CLEAR_AFTER = 120 // frames

      const draw = (now: number) => {
        if (!alive) return

        const dt = Math.min((now - lastTime) / 1000, 0.05)
        lastTime = now
        world.timestep = dt
        world.step()

        const anyMoving = entries.some(({ body }) => {
          const v = body.linvel()
          return Math.hypot(v.x, v.y) > STILL_THRESHOLD || Math.abs(body.angvel()) > STILL_THRESHOLD
        })

        if (anyMoving) {
          stillFrames = 0
          ctx.fillStyle = theme.trail
        } else {
          stillFrames++
          ctx.fillStyle = stillFrames >= FULL_CLEAR_AFTER ? theme.background : theme.trail
        }
        ctx.fillRect(0, 0, cW, cH)

        for (const { body, svgPath, renderOffset } of entries) {
          const pos = body.translation()
          const angle = body.rotation()
          ctx.save()
          ctx.translate(pos.x, pos.y)
          ctx.rotate(angle)
          ctx.translate(-renderOffset.x, -renderOffset.y)
          ctx.fillStyle = theme.letter
          ctx.fill(new Path2D(svgPath), 'evenodd')
          ctx.restore()
        }

        rafId = requestAnimationFrame(draw)
      }
      rafId = requestAnimationFrame(draw)
    }

    // Sync with system color scheme
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onSchemeChange = () => { theme = themeFor(systemMode()) }
    mq.addEventListener('change', onSchemeChange)

    // Triple-0 secret toggle
    let zeroCount = 0
    let zeroTimer = 0
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== '0') return
      zeroCount++
      clearTimeout(zeroTimer)
      zeroTimer = window.setTimeout(() => { zeroCount = 0 }, 500)
      if (zeroCount >= 3) {
        zeroCount = 0
        theme = theme === themeFor('dark') ? themeFor('light') : themeFor('dark')
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
