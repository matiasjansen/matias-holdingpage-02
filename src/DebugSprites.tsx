import { useEffect, useRef, useState } from 'react'
import opentype from 'opentype.js'

const fontUrl = '/fonts/display-regular.otf'
const CHARS = Array.from(new Set('MatiaJsen,Dsgr'))
const SIZE = 200
const PAD = 4  // padding around each glyph in the atlas

type Pt = { x: number; y: number }

// ---- geometry helpers (same as PhysicsCanvas) --------------------------------

function cubicPts(p0: Pt, p1: Pt, p2: Pt, p3: Pt, n = 12): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return { x: u*u*u*p0.x+3*u*u*t*p1.x+3*u*t*t*p2.x+t*t*t*p3.x, y: u*u*u*p0.y+3*u*u*t*p1.y+3*u*t*t*p2.y+t*t*t*p3.y }
  })
}
function quadPts(p0: Pt, p1: Pt, p2: Pt, n = 8): Pt[] {
  return Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n, u = 1 - t
    return { x: u*u*p0.x+2*u*t*p1.x+t*t*p2.x, y: u*u*p0.y+2*u*t*p1.y+t*t*p2.y }
  })
}
function pathToContours(cmds: opentype.PathCommand[]): Pt[][] {
  const contours: Pt[][] = []; let cur: Pt[] = []; let pos: Pt = { x: 0, y: 0 }
  for (const cmd of cmds) {
    if (cmd.type === 'M') { if (cur.length) contours.push(cur); pos = { x: cmd.x, y: cmd.y }; cur = [{ ...pos }] }
    else if (cmd.type === 'L') { pos = { x: cmd.x, y: cmd.y }; cur.push({ ...pos }) }
    else if (cmd.type === 'C') { cur.push(...cubicPts(pos,{x:cmd.x1,y:cmd.y1},{x:cmd.x2,y:cmd.y2},{x:cmd.x,y:cmd.y}).slice(1)); pos={x:cmd.x,y:cmd.y} }
    else if (cmd.type === 'Q') { cur.push(...quadPts(pos,{x:cmd.x1,y:cmd.y1},{x:cmd.x,y:cmd.y}).slice(1)); pos={x:cmd.x,y:cmd.y} }
    else if (cmd.type === 'Z') { if (cur.length) { contours.push(cur); cur = [] } }
  }
  if (cur.length) contours.push(cur)
  return contours
}
function contourArea(c: Pt[]) { const xs=c.map(p=>p.x),ys=c.map(p=>p.y); return (Math.max(...xs)-Math.min(...xs))*(Math.max(...ys)-Math.min(...ys)) }
function simplify(pts: Pt[], minDist = 2): Pt[] {
  if (!pts.length) return pts; const out: Pt[] = [pts[0]]
  for (let i=1;i<pts.length;i++) { const p=out[out.length-1],dx=pts[i].x-p.x,dy=pts[i].y-p.y; if(Math.sqrt(dx*dx+dy*dy)>=minDist) out.push(pts[i]) }
  return out
}

// ---- atlas builder -----------------------------------------------------------

export type GlyphAtlasEntry = {
  char: string
  // source rect within the atlas canvas
  sx: number; sy: number; sw: number; sh: number
  // anchor offsets: where the body origin sits within this source rect
  ox: number; oy: number
}

export type GlyphAtlas = {
  canvas: HTMLCanvasElement
  entries: Map<string, GlyphAtlasEntry>
}

export function buildAtlas(font: opentype.Font): GlyphAtlas {
  // Measure every glyph first so we can size the atlas
  const measures = CHARS.map(char => {
    const otPath = font.charToGlyph(char).getPath(0, 0, SIZE)
    const pb = otPath.getBoundingBox()
    const w = Math.ceil(pb.x2 - pb.x1) + PAD * 2
    const h = Math.ceil(pb.y2 - pb.y1) + PAD * 2
    const bb = font.charToGlyph(char).getBoundingBox()
    const scale = SIZE / font.unitsPerEm
    const renderOffsetX = (bb.x1 + bb.x2) / 2 * scale
    const renderOffsetY = -(bb.y1 + bb.y2) / 2 * scale
    // tx/ty: translate path (which starts at pb.x1,pb.y1) into sprite-local coords
    const tx = -pb.x1 + PAD
    const ty = -pb.y1 + PAD
    // ox/oy: where the body anchor sits within the sprite
    const ox = renderOffsetX + tx
    const oy = renderOffsetY + ty
    return { char, w, h, tx, ty, ox, oy, path2d: new Path2D(otPath.toPathData(4)) }
  })

  // Simple row layout: pack glyphs left-to-right
  const atlasW = measures.reduce((sum, m) => sum + m.w, 0)
  const atlasH = Math.max(...measures.map(m => m.h))

  const atlas = document.createElement('canvas')
  atlas.width = atlasW
  atlas.height = atlasH
  const ctx = atlas.getContext('2d')!
  ctx.fillStyle = '#111'

  const entries = new Map<string, GlyphAtlasEntry>()
  let cursorX = 0

  for (const m of measures) {
    ctx.save()
    ctx.translate(cursorX + m.tx, m.ty)
    ctx.fill(m.path2d, 'evenodd')
    ctx.restore()

    entries.set(m.char, {
      char: m.char,
      sx: cursorX, sy: 0, sw: m.w, sh: m.h,
      ox: m.ox, oy: m.oy,
    })
    cursorX += m.w
  }

  return { canvas: atlas, entries }
}

// ---- pixel diff check -------------------------------------------------------

// Returns the fraction of pixels that differ between two same-sized canvases.
// Renders both at 1× (no DPR scaling) for a direct pixel comparison.
function pixelDiffRatio(a: HTMLCanvasElement, b: HTMLCanvasElement): number {
  const w = a.width, h = a.height
  const da = a.getContext('2d')!.getImageData(0, 0, w, h).data
  const db = b.getContext('2d')!.getImageData(0, 0, w, h).data
  let diffs = 0
  for (let i = 0; i < da.length; i += 4) {
    // Compare alpha channel only — shape match, not colour
    if (Math.abs(da[i + 3] - db[i + 3]) > 8) diffs++
  }
  return diffs / (w * h)
}

// ---- CharCard ----------------------------------------------------------------

type CharCardProps = {
  char: string
  font: opentype.Font
  atlas: GlyphAtlas
}

function CharCard({ char, font, atlas }: CharCardProps) {
  const spriteRef = useRef<HTMLCanvasElement>(null)
  const pathRef   = useRef<HTMLCanvasElement>(null)
  const atlasRef  = useRef<HTMLCanvasElement>(null)
  const [diffResult, setDiffResult] = useState<string | null>(null)

  useEffect(() => {
    const scale = SIZE / font.unitsPerEm
    const glyph = font.charToGlyph(char)
    const bb = glyph.getBoundingBox()
    const path = glyph.getPath(0, 0, SIZE)
    const path2d = new Path2D(path.toPathData(4))

    const renderOffsetX = (bb.x1 + bb.x2) / 2 * scale
    const renderOffsetY = -(bb.y1 + bb.y2) / 2 * scale

    const pb = path.getBoundingBox()
    const spriteW = Math.ceil(pb.x2 - pb.x1) + PAD * 2
    const spriteH = Math.ceil(pb.y2 - pb.y1) + PAD * 2
    const tx = -pb.x1 + PAD
    const ty = -pb.y1 + PAD
    const ox = renderOffsetX + tx
    const oy = renderOffsetY + ty

    // Hull verts (same as PhysicsCanvas)
    const contours = pathToContours(path.commands)
    const outer = contours.sort((a, b) => contourArea(b) - contourArea(a))[0] ?? []
    const simplified = simplify(outer, 2)
    const hullVerts = simplified.map(p => ({ x: p.x - renderOffsetX, y: p.y - renderOffsetY }))

    const dpr = window.devicePixelRatio ?? 1
    const MARGIN = 60
    const cW = Math.max(spriteW, SIZE) + MARGIN
    const cH = Math.max(spriteH, SIZE) + MARGIN
    const anchorX = cW / 2
    const anchorY = cH / 2

    function drawHullAndAnchor(ctx: CanvasRenderingContext2D) {
      if (hullVerts.length >= 3) {
        ctx.save()
        ctx.translate(anchorX, anchorY)
        ctx.beginPath()
        ctx.moveTo(hullVerts[0].x, hullVerts[0].y)
        for (let i = 1; i < hullVerts.length; i++) ctx.lineTo(hullVerts[i].x, hullVerts[i].y)
        ctx.closePath()
        ctx.strokeStyle = 'rgba(255,100,0,0.7)'
        ctx.lineWidth = 1.5
        ctx.stroke()
        ctx.restore()
      }
      ctx.fillStyle = 'red'
      ctx.beginPath(); ctx.arc(anchorX, anchorY, 4, 0, Math.PI * 2); ctx.fill()
    }

    // --- BITMAP panel (unchanged from before) ---
    const sc = document.createElement('canvas')
    sc.width = spriteW
    sc.height = spriteH
    const sctx = sc.getContext('2d')!
    sctx.fillStyle = '#111'
    sctx.save()
    sctx.translate(tx, ty)
    sctx.fill(path2d, 'evenodd')
    sctx.restore()

    const bc = spriteRef.current!
    bc.width = cW * dpr; bc.height = cH * dpr
    bc.style.width = `${cW}px`; bc.style.height = `${cH}px`
    const ctx1 = bc.getContext('2d')!
    ctx1.scale(dpr, dpr)
    ctx1.fillStyle = '#fafafa'; ctx1.fillRect(0, 0, cW, cH)
    ctx1.strokeStyle = 'rgba(0,100,255,0.4)'
    ctx1.strokeRect(anchorX - ox, anchorY - oy, spriteW, spriteH)
    ctx1.drawImage(sc, anchorX - ox, anchorY - oy)
    drawHullAndAnchor(ctx1)

    // --- PATH2D panel (unchanged from before) ---
    const pc = pathRef.current!
    pc.width = cW * dpr; pc.height = cH * dpr
    pc.style.width = `${cW}px`; pc.style.height = `${cH}px`
    const ctx2 = pc.getContext('2d')!
    ctx2.scale(dpr, dpr)
    ctx2.fillStyle = '#fafafa'; ctx2.fillRect(0, 0, cW, cH)
    ctx2.save()
    ctx2.translate(anchorX - renderOffsetX, anchorY - renderOffsetY)
    ctx2.fillStyle = '#111'
    ctx2.fill(path2d, 'evenodd')
    ctx2.restore()
    drawHullAndAnchor(ctx2)

    // --- ATLAS panel: draw from the shared atlas using this glyph's source rect ---
    const ae = atlas.entries.get(char)!
    const ac = atlasRef.current!
    ac.width = cW * dpr; ac.height = cH * dpr
    ac.style.width = `${cW}px`; ac.style.height = `${cH}px`
    const ctx3 = ac.getContext('2d')!
    ctx3.scale(dpr, dpr)
    ctx3.fillStyle = '#fafafa'; ctx3.fillRect(0, 0, cW, cH)
    ctx3.strokeStyle = 'rgba(0,100,255,0.4)'
    ctx3.strokeRect(anchorX - ae.ox, anchorY - ae.oy, ae.sw, ae.sh)
    ctx3.drawImage(atlas.canvas, ae.sx, ae.sy, ae.sw, ae.sh, anchorX - ae.ox, anchorY - ae.oy, ae.sw, ae.sh)
    drawHullAndAnchor(ctx3)

    // --- Pixel diff: compare PATH2D vs ATLAS at 1× to verify they match ---
    const refCanvas = document.createElement('canvas')
    refCanvas.width = cW; refCanvas.height = cH
    const refCtx = refCanvas.getContext('2d')!
    refCtx.fillStyle = '#fafafa'; refCtx.fillRect(0, 0, cW, cH)
    refCtx.save()
    refCtx.translate(anchorX - renderOffsetX, anchorY - renderOffsetY)
    refCtx.fillStyle = '#111'
    refCtx.fill(path2d, 'evenodd')
    refCtx.restore()

    const atlasCanvas1x = document.createElement('canvas')
    atlasCanvas1x.width = cW; atlasCanvas1x.height = cH
    const atlasCtx1x = atlasCanvas1x.getContext('2d')!
    atlasCtx1x.fillStyle = '#fafafa'; atlasCtx1x.fillRect(0, 0, cW, cH)
    atlasCtx1x.drawImage(atlas.canvas, ae.sx, ae.sy, ae.sw, ae.sh, anchorX - ae.ox, anchorY - ae.oy, ae.sw, ae.sh)

    const ratio = pixelDiffRatio(refCanvas, atlasCanvas1x)
    const pct = (ratio * 100).toFixed(2)
    setDiffResult(ratio < 0.01 ? `✓ match (${pct}% diff)` : `✗ mismatch (${pct}% diff)`)
  }, [char, font, atlas])

  const tag: React.CSSProperties = { fontFamily: 'monospace', fontSize: 11, fontWeight: 'bold', padding: '2px 6px', borderRadius: 4 }

  return (
    <div style={{ border: '1px solid #ddd', borderRadius: 8, padding: 12, background: '#fff', display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ fontFamily: 'monospace', fontWeight: 'bold', fontSize: 16 }}>"{char}"</div>
        {diffResult && (
          <div style={{ fontFamily: 'monospace', fontSize: 11, color: diffResult.startsWith('✓') ? 'green' : 'red' }}>
            {diffResult}
          </div>
        )}
      </div>
      <div style={{ display: 'flex', gap: 16 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...tag, background: '#dceeff', color: '#005' }}>BITMAP (drawImage)</div>
          <canvas ref={spriteRef} style={{ border: '1px solid #e0e8ff', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...tag, background: '#ffeedd', color: '#500' }}>PATH2D (ctx.fill)</div>
          <canvas ref={pathRef} style={{ border: '1px solid #ffe0cc', borderRadius: 4 }} />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div style={{ ...tag, background: '#e8ffe8', color: '#050' }}>ATLAS (drawImage subregion)</div>
          <canvas ref={atlasRef} style={{ border: '1px solid #c0e8c0', borderRadius: 4 }} />
        </div>
      </div>
    </div>
  )
}

// ---- Atlas inspector --------------------------------------------------------
// Shows the raw atlas canvas so you can verify the full layout at a glance.

function AtlasInspector({ atlas }: { atlas: GlyphAtlas }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const c = ref.current!
    const scale = 2
    c.width = atlas.canvas.width * scale
    c.height = atlas.canvas.height * scale
    c.style.width = `${atlas.canvas.width * scale}px`
    c.style.height = `${atlas.canvas.height * scale}px`
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#fafafa'
    ctx.fillRect(0, 0, c.width, c.height)
    ctx.drawImage(atlas.canvas, 0, 0, c.width, c.height)

    // Draw dividing lines between glyphs
    ctx.strokeStyle = 'rgba(0,100,255,0.3)'
    ctx.lineWidth = 1
    for (const e of atlas.entries.values()) {
      ctx.strokeRect(e.sx * scale, e.sy * scale, e.sw * scale, e.sh * scale)
    }
  }, [atlas])

  return (
    <div style={{ marginBottom: 24 }}>
      <h3 style={{ fontFamily: 'monospace', fontSize: 13, marginBottom: 8 }}>Raw atlas (2× view)</h3>
      <canvas ref={ref} style={{ border: '1px solid #ddd', borderRadius: 4, display: 'block' }} />
    </div>
  )
}

// ---- Page -------------------------------------------------------------------

export function DebugSprites() {
  const [font, setFont] = useState<opentype.Font | null>(null)
  const [atlas, setAtlas] = useState<GlyphAtlas | null>(null)

  useEffect(() => {
    fetch(fontUrl)
      .then(r => r.arrayBuffer())
      .then(buf => {
        const f = opentype.parse(buf)
        setFont(f)
        setAtlas(buildAtlas(f))
      })
  }, [])

  useEffect(() => {
    document.documentElement.style.overflow = 'auto'
    document.body.style.overflow = 'auto'
    document.body.style.height = 'auto'
    const root = document.getElementById('root')
    if (root) { root.style.overflow = 'auto'; root.style.height = 'auto' }
    return () => {
      document.documentElement.style.overflow = ''
      document.body.style.overflow = ''
      document.body.style.height = ''
      if (root) { root.style.overflow = ''; root.style.height = '' }
    }
  }, [])

  return (
    <div style={{ padding: 20, background: '#f0f0f0', minHeight: '100vh' }}>
      <h2 style={{ fontFamily: 'monospace', marginBottom: 8 }}>Sprite debug</h2>
      <p style={{ fontFamily: 'monospace', fontSize: 12, marginBottom: 20, color: '#666' }}>
        Red dot = physics anchor. Blue outline = sprite/atlas bounds. Orange = convex hull. ATLAS panel should look identical to PATH2D.
      </p>
      {!font && <p style={{ fontFamily: 'monospace' }}>Loading font…</p>}
      {atlas && <AtlasInspector atlas={atlas} />}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 16 }}>
        {font && atlas && CHARS.map(char => (
          <CharCard key={char} char={char} font={font} atlas={atlas} />
        ))}
      </div>
    </div>
  )
}
