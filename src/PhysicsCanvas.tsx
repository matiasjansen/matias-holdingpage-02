import { useEffect, useRef } from 'react'
import RAPIER from '@dimforge/rapier2d-compat'
import opentype from 'opentype.js'

const fontUrl = '/fonts/SF-Pro-Display-Regular.otf'

interface LetterDef {
  char: string
  size: number
}

function buildLetters(): LetterDef[] {
  const rows: [string, number][] = [
    ['Matias',    192],
    ['Jansen,',   192],
    ['Designer',  192],
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
      const floor = makeStatic(W / 2, H + 40, W * 2, 40)
      const wallL  = makeStatic(-40, H / 2, 40, H * 2)
      const wallR  = makeStatic(W + 40, H / 2, 40, H * 2)

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
        const spawnY = -(i * 60 + letter.size)

        const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
          .setTranslation(spawnX, spawnY)
          .setRotation((Math.random() - 0.5) * 0.4)
        const body = world.createRigidBody(bodyDesc)

        const hull = RAPIER.ColliderDesc.convexHull(flatVerts)
        if (!hull) continue
        hull.setRestitution(0.3).setFriction(0.6)
        world.createCollider(hull, body)

        entries.push({ body, svgPath: path.toPathData(4), renderOffset })
      }

      const draw = () => {
        if (!alive) return

        world.step()

        ctx.fillStyle = '#0a0a0a'
        ctx.fillRect(0, 0, cW, cH)

        for (const { body, svgPath, renderOffset } of entries) {
          const pos = body.translation()
          const angle = body.rotation()
          ctx.save()
          ctx.translate(pos.x, pos.y)
          ctx.rotate(angle)
          ctx.translate(-renderOffset.x, -renderOffset.y)
          ctx.shadowColor = 'rgba(0,0,0,0.6)'
          ctx.shadowBlur = 8
          ctx.shadowOffsetX = 3
          ctx.shadowOffsetY = 3
          ctx.fillStyle = '#ffffff'
          ctx.fill(new Path2D(svgPath), 'evenodd')
          ctx.restore()
        }

        rafId = requestAnimationFrame(draw)
      }
      draw()
    }

    let resizeObserver: ResizeObserver | undefined
    init().catch(err => console.error('PhysicsCanvas init error:', err))
    return () => {
      alive = false
      cancelAnimationFrame(rafId)
      resizeObserver?.disconnect()
    }
  }, [])

  return <canvas ref={canvasRef} style={{ display: 'block', cursor: 'default' }} />
}
