import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { themeFor, systemMode } from './colors'

// ── Constants ─────────────────────────────────────────────────────────────────
const MAX_N     = 3500   // hard cap — all per-boid arrays + the InstancedMesh are sized to this
const MAX_SPEED = 3.5    // world units / frame @60fps
const MIN_SPEED = 2.2    // starlings fly near-constant speed; tight band reads organic
const MAX_FORCE = 0.18
const SEP_R     = 22   // radii shrunk for 2000-boid density (were 28/72/95 at N=500)
const ALI_R     = 48
const COH_R     = 62
const PRED_R    = 220
const W_SEP     = 1.8
const W_PRED    = 6.0
const AT_SPEED  = 1.4
const STARTLE_R      = 180   // impulse falls off to 0 at this radius
const STARTLE_DUR    = 0.6   // seconds the impulse decays over
const STARTLE_GAP_MIN = 8    // seconds between startle events (randomized)
const STARTLE_GAP_MAX = 15
const SPEED_TURN_FLOOR = 0.65 // fraction of sMax allowed at max turn sharpness
const SPEED_TURN_SLOW  = 0.25 // lerp rate slowing into a hard turn
const SPEED_TURN_SURGE = 0.07 // lerp rate recovering ("surging") back to full speed
const COURSE_GAP_MIN  = 6     // seconds between attractor course changes (randomized)
const COURSE_GAP_MAX  = 12
const COURSE_TURN_MIN = 0.8   // radians, magnitude of a scheduled course turn
const COURSE_TURN_MAX = 2.2
const COURSE_PITCH_MAX = 0.35 // radians, new pitch target range
const COURSE_EASE     = 1.5   // seconds to ease into a new heading
const FORCE_CAP_OSC_AMP = 0.6 // ± swing of the slow global force-cap breathing
const FORCE_CAP_STARTLE_MULT = 2 // cap multiplier at full startle decay
const DEPTH     = 280    // flock half-depth on Z axis
const PLANE_S   = 16     // plane size in world units (≈ screen pixels at z=0)
const FOV       = 50

const SEP_R2    = SEP_R  * SEP_R
const ALI_R2    = ALI_R  * ALI_R
const COH_R2    = COH_R  * COH_R
const PRED_R2   = PRED_R * PRED_R
const STARTLE_R2 = STARTLE_R * STARTLE_R
const MAX_NEIGHBORS = 7 // real starlings track ~7 nearest neighbors (topological, not metric, interaction)
const SEP_SAT       = 4 // separation saturation: keep scanning past the ali/coh cap until this many close neighbors seen

// Unique chars from 'MATIAS JANSEN, DESIGNER'
const CHARS = Array.from(new Set('MATIASJNDESIGR'.split(''))) // 11 unique

const ATLAS_CELL = 64
const ATLAS_COLS = 4
const ATLAS_ROWS = Math.ceil(CHARS.length / ATLAS_COLS)       // 3

// ── Component ─────────────────────────────────────────────────────────────────
export function MurmurCanvas({ style, paused = false }: { style?: React.CSSProperties; paused?: boolean } = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const pausedRef = useRef(paused)
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])

  useEffect(() => {
    const canvas = canvasRef.current!
    let W = window.innerWidth
    let H = window.innerHeight

    const theme = themeFor(systemMode())

    // ── Tunable params (live-editable via triple-U debug panel) ────────────────
    const params = {
      speed: 2.5,             // global multiplier on MAX_SPEED / MIN_SPEED / sMax
      trail: 0.05,             // scales effective duration; 0 = off (zero-cost path)
      trailDuration: 0.5,      // seconds for a trail to fade to half-strength (frame-rate independent)
      trailSubsteps: 4,        // 0 = single stamp/frame
      count: 2600,             // live boid count; arrays are pre-allocated to MAX_N
      alignment: 2.4,
      cohesion: 0,             // global regroup + attraction do the gathering; 0 local cohesion = streaming ribbons
      separation: W_SEP,
      startleStrength: 6,
      startleRate: 1.5,        // multiplier on startle frequency (higher = more frequent)
      courseTurniness: 0.2,    // multiplier on attractor course-change turn magnitude
      attraction: 1,
      regroup: 0.9,            // centroid pull so split subgroups re-merge over time
      depthNear: 600,          // max boid z toward camera; capped to dist*0.65 per frame (see nearEff)
      depthFar: 1200,          // max boid |z| away from camera; uncapped
      depthFade: 0.7,          // 0 = no far fade, 1 = fade far letters to fully transparent
      depthBlur: 0,            // mip bias applied to far letters (0 = off)
    }

    // Debug tweak panel (triple-U to toggle) — same pattern as PhysicsCanvas
    const panel = document.createElement('div')
    panel.style.cssText = 'position:fixed;bottom:24px;right:24px;background:rgba(0,0,0,0.75);color:#fff;font-family:monospace;font-size:12px;padding:16px;border-radius:8px;display:none;flex-direction:column;gap:10px;z-index:9999;min-width:240px'
    document.body.appendChild(panel)

    function makeSlider(label: string, min: number, max: number, step: number, getValue: () => number, setValue: (v: number) => void) {
      const row = document.createElement('div')
      row.style.cssText = 'display:flex;flex-direction:column;gap:4px'
      const top = document.createElement('div')
      top.style.cssText = 'display:flex;justify-content:space-between'
      const labelEl = document.createElement('span')
      labelEl.textContent = label
      const valueEl = document.createElement('span')
      valueEl.textContent = String(getValue())
      top.appendChild(labelEl); top.appendChild(valueEl)
      const slider = document.createElement('input')
      slider.type = 'range'; slider.min = String(min); slider.max = String(max); slider.step = String(step)
      slider.value = String(getValue())
      slider.style.cssText = 'width:100%'
      slider.addEventListener('input', () => {
        const v = parseFloat(slider.value)
        setValue(v)
        valueEl.textContent = String(v)
      })
      row.appendChild(top); row.appendChild(slider)
      return row
    }

    panel.appendChild(makeSlider('Speed', 0.2, 5, 0.05, () => params.speed, v => { params.speed = v }))
    panel.appendChild(makeSlider('Trail', 0, 1, 0.01, () => params.trail, v => { params.trail = v }))
    panel.appendChild(makeSlider('Trail duration (s)', 0.2, 6, 0.1, () => params.trailDuration, v => { params.trailDuration = v }))
    panel.appendChild(makeSlider('Trail substeps', 0, 4, 1, () => params.trailSubsteps, v => { params.trailSubsteps = v }))
    panel.appendChild(makeSlider('Count', 200, 3500, 100, () => params.count, v => { params.count = Math.round(v) }))
    panel.appendChild(makeSlider('Alignment', 0, 4, 0.05, () => params.alignment, v => { params.alignment = v }))
    panel.appendChild(makeSlider('Cohesion', 0, 4, 0.05, () => params.cohesion, v => { params.cohesion = v }))
    panel.appendChild(makeSlider('Separation', 0, 4, 0.05, () => params.separation, v => { params.separation = v }))
    panel.appendChild(makeSlider('Startle strength', 0, 12, 0.1, () => params.startleStrength, v => { params.startleStrength = v }))
    panel.appendChild(makeSlider('Startle rate', 0.3, 3, 0.05, () => params.startleRate, v => { params.startleRate = v }))
    panel.appendChild(makeSlider('Course turniness', 0, 3, 0.05, () => params.courseTurniness, v => { params.courseTurniness = v }))
    panel.appendChild(makeSlider('Attraction', 0, 2, 0.02, () => params.attraction, v => { params.attraction = v }))
    panel.appendChild(makeSlider('Regroup', 0, 1, 0.01, () => params.regroup, v => { params.regroup = v }))
    panel.appendChild(makeSlider('Depth near', 0, 600, 10, () => params.depthNear, v => { params.depthNear = v }))
    panel.appendChild(makeSlider('Depth far', 0, 1200, 10, () => params.depthFar, v => { params.depthFar = v }))
    panel.appendChild(makeSlider('Depth fade', 0, 1, 0.01, () => params.depthFade, v => { params.depthFade = v }))
    panel.appendChild(makeSlider('Depth blur', 0, 4, 0.1, () => params.depthBlur, v => { params.depthBlur = v }))

    let panelVisible = false
    let uCount = 0
    let uTimer = 0
    const onKeyDown = (e: KeyboardEvent) => {
      if (pausedRef.current) return   // don't fight the other world's panel for triple-U
      if (e.key === 'u' || e.key === 'U') {
        uCount++
        clearTimeout(uTimer)
        uTimer = window.setTimeout(() => { uCount = 0 }, 500)
        if (uCount >= 3) {
          uCount = 0
          panelVisible = !panelVisible
          panel.style.display = panelVisible ? 'flex' : 'none'
        }
      }
    }
    document.addEventListener('keydown', onKeyDown)

    // ── Renderer ──────────────────────────────────────────────────────────────
    // No preserveDrawingBuffer: trails accumulate off the drawing buffer (see
    // below), so the browser is free to discard it after compositing as usual.
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(W, H)
    renderer.setClearColor(new THREE.Color(theme.surface))

    // ── Trail accumulation (ping-pong render targets) ──────────────────────────
    // trail=0 (default): renderer draws straight to screen, autoClear stays on,
    // targets untouched — zero extra cost. trail>0: fade + flock accumulate
    // into an offscreen, non-multisampled target, then blit to screen. Doing
    // this off the (antialiased) drawing buffer avoids MSAA-resolve mangling
    // the fade blend/dither, which previously left permanent faint streaks.
    const rtOpts = { depthBuffer: false, type: THREE.UnsignedByteType }
    const rtSize0 = renderer.getDrawingBufferSize(new THREE.Vector2())
    let trailA = new THREE.WebGLRenderTarget(rtSize0.x, rtSize0.y, rtOpts)
    let trailB = new THREE.WebGLRenderTarget(rtSize0.x, rtSize0.y, rtOpts)
    let trailRead = trailA, trailWrite = trailB
    let prevTrailOn = false

    const trailCamera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const trailGeo = new THREE.PlaneGeometry(2, 2)

    // Mixes the previous accumulation texture toward the surface color by
    // uAlpha — the fade pass. Dithered: without per-pixel noise, fadeOpacity *
    // |surface - pixel| can round below half an LSB at 8-bit and the blend
    // stops converging, leaving permanent faint streaks. Noise decorrelated
    // per-stamp (via uTime) fixes it.
    // copyMat/blitMat are raw ShaderMaterials rendered into 8-bit offscreen
    // targets — they never get three.js's automatic linear→output colorspace
    // conversion (that's only auto-injected into built-in ShaderLib materials).
    // So uColor must already hold the same display-ready sRGB bytes that
    // renderer.setClearColor() produces on screen, not the linear working-space
    // value `new THREE.Color(hex)` normally stores.
    const surfaceDisplay = new THREE.Color(theme.surface).convertLinearToSRGB()
    const copyMat = new THREE.ShaderMaterial({
      uniforms: {
        tPrev:  { value: null },
        uColor: { value: surfaceDisplay },
        uAlpha: { value: 0 },
        uTime:  { value: 0 },
      },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tPrev;
        uniform vec3 uColor;
        uniform float uAlpha;
        uniform float uTime;
        varying vec2 vUv;
        void main() {
          float n = fract(sin(dot(gl_FragCoord.xy + uTime, vec2(12.9898, 78.233))) * 43758.5453);
          float dither = (n - 0.5) * (2.0 / 255.0);
          vec3 prev = texture2D(tPrev, vUv).rgb;
          // Dither the FINAL mixed value, not the surface input — pre-mix dither
          // gets scaled by uAlpha (often tiny) and can't unstick anything.
          gl_FragColor = vec4(mix(prev, uColor, uAlpha) + dither, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    const copyScene = new THREE.Scene()
    copyScene.add(new THREE.Mesh(trailGeo, copyMat))

    // Blits the current accumulation texture to the screen.
    const blitMat = new THREE.ShaderMaterial({
      uniforms: { tMap: { value: null } },
      vertexShader: /* glsl */ `
        varying vec2 vUv;
        void main() {
          vUv = uv;
          gl_Position = vec4(position, 1.0);
        }
      `,
      fragmentShader: /* glsl */ `
        uniform sampler2D tMap;
        varying vec2 vUv;
        void main() {
          gl_FragColor = vec4(texture2D(tMap, vUv).rgb, 1.0);
        }
      `,
      depthTest: false,
      depthWrite: false,
    })
    const blitScene = new THREE.Scene()
    blitScene.add(new THREE.Mesh(trailGeo, blitMat))

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
    // Mipmaps + trilinear filtering enable the depth-blur mip bias below (WebGL2
    // handles the 256×192 NPOT atlas fine)
    atlas.generateMipmaps = true
    atlas.minFilter = THREE.LinearMipmapLinearFilter
    // flipY = true (Three.js default): canvas top-row → UV y=1
    // uvOffset.y = 1 − (row+1)/ATLAS_ROWS so bottom-left plane vertex hits cell bottom-left

    // ── Boids (structure-of-arrays for cache locality) ─────────────────────────
    const bpx = new Float32Array(MAX_N), bpy = new Float32Array(MAX_N), bpz = new Float32Array(MAX_N)
    const bvx = new Float32Array(MAX_N), bvy = new Float32Array(MAX_N), bvz = new Float32Array(MAX_N)
    const bsMax = new Float32Array(MAX_N), bsCur = new Float32Array(MAX_N), bang = new Float32Array(MAX_N)
    const bci = new Uint8Array(MAX_N)
    // Previous-frame positions (copied before integration each frame) — used to
    // interpolate instance transforms across trail substeps.
    const ppx = new Float32Array(MAX_N), ppy = new Float32Array(MAX_N), ppz = new Float32Array(MAX_N)
    for (let i = 0; i < MAX_N; i++) {
      const a = Math.random() * Math.PI * 2
      const p = (Math.random() - 0.5) * 0.4
      const s = MIN_SPEED + Math.random() * (MAX_SPEED - MIN_SPEED)
      const sMax = MAX_SPEED * (0.85 + Math.random() * 0.3)
      bpx[i] = (Math.random() - 0.5) * W * 0.45
      bpy[i] = (Math.random() - 0.5) * H * 0.45
      bpz[i] = (Math.random() - 0.5) * DEPTH * 2
      bvx[i] = Math.cos(p) * Math.cos(a) * s
      bvy[i] = Math.sin(p) * s
      bvz[i] = Math.cos(p) * Math.sin(a) * s
      bci[i] = Math.floor(Math.random() * CHARS.length)
      bsMax[i] = sMax
      bsCur[i] = sMax
      bang[i] = 0
      ppx[i] = bpx[i]; ppy[i] = bpy[i]; ppz[i] = bpz[i]
    }

    // ── InstancedMesh ─────────────────────────────────────────────────────────
    const geo = new THREE.PlaneGeometry(1, 1)

    // Per-instance UV offset — set ONCE (chars don't change)
    const uvOffsets = new Float32Array(MAX_N * 2)
    for (let i = 0; i < MAX_N; i++) {
      const col = bci[i] % ATLAS_COLS
      const row = Math.floor(bci[i] / ATLAS_COLS)
      uvOffsets[i * 2]     = col / ATLAS_COLS
      uvOffsets[i * 2 + 1] = 1 - (row + 1) / ATLAS_ROWS   // flipY correction
    }
    geo.setAttribute('uvOffset', new THREE.InstancedBufferAttribute(uvOffsets, 2))

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        uAtlas:   { value: atlas },
        uColor:   { value: new THREE.Color(theme.onSurface) },
        uUVScale: { value: new THREE.Vector2(1 / ATLAS_COLS, 1 / ATLAS_ROWS) },
        uFadeNear: { value: dist - DEPTH },
        uFadeFar:  { value: dist + DEPTH },
        uFadeFloor: { value: 0.3 },
        uBlur: { value: 0 },
      },
      vertexShader: `
        attribute vec2 uvOffset;
        uniform vec2 uUVScale;
        uniform float uFadeNear;
        uniform float uFadeFar;
        uniform float uFadeFloor;
        varying vec2 vUv;
        varying float vFade;
        varying float vDepthN;
        void main() {
          vUv = uv * uUVScale + uvOffset;
          vec4 mv = modelViewMatrix * instanceMatrix * vec4(position, 1.0);
          float fn = clamp((uFadeFar - (-mv.z)) / (uFadeFar - uFadeNear), 0.0, 1.0);
          vFade = mix(uFadeFloor, 1.0, fn);
          vDepthN = fn;
          gl_Position = projectionMatrix * mv;
        }
      `,
      fragmentShader: `
        uniform sampler2D uAtlas;
        uniform vec3 uColor;
        uniform float uBlur;
        varying vec2 vUv;
        varying float vFade;
        varying float vDepthN;
        void main() {
          float a = texture2D(uAtlas, vUv, (1.0 - vDepthN) * uBlur).a * vFade;
          if (a < 0.01) discard;
          gl_FragColor = vec4(uColor, a);
        }
      `,
      side: THREE.DoubleSide,
      transparent: true,
      depthWrite: false,
    })

    const mesh = new THREE.InstancedMesh(geo, mat, MAX_N)
    mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage)
    // Bounding sphere is never updated as instances move — a stale sphere could
    // wrongly cull the whole flock during camera drift
    mesh.frustumCulled = false
    scene.add(mesh)

    // ── Attractor ─────────────────────────────────────────────────────────────
    let atX = 0, atY = 0, atZ = 0
    // Attractor velocity — heading changes ease through this instead of stepping
    // atX/Y/Z directly, so course changes read as smooth arcs rather than kinks.
    let atVX = 0, atVY = 0, atVZ = 0
    let atAngle = Math.random() * Math.PI * 2
    let atPitch  = 0
    let atAngleTarget = atAngle
    let atPitchTarget = 0
    let nextCourseT: number | null = null // set relative to first tick's clock below

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
      const s = renderer.getDrawingBufferSize(new THREE.Vector2())
      trailA.setSize(s.x, s.y)
      trailB.setSize(s.x, s.y)
    }
    window.addEventListener('resize', onResize)

    // ── Spatial hash grid ─────────────────────────────────────────────────────
    // Cell size = COH_R (largest radius): the 3×3×3 block around a boid's cell
    // is guaranteed to contain every neighbor within any of the three radii.
    // Hash collisions only add candidates (filtered by d2 below), never drop them.
    const CELL = COH_R
    const grid = new Map<number, number[]>()
    const cellKey = (ix: number, iy: number, iz: number) =>
      (ix * 73856093 + iy * 19349663 + iz * 83492791) | 0

    // ── Per-frame temporaries ─────────────────────────────────────────────────
    const tmpMat = new THREE.Matrix4()
    let fx = 0, fy = 0, fz = 0
    let forceCap = MAX_FORCE // recomputed once per frame below; addSteer reads this, not the raw constant
    const tanHalfFov = Math.tan((FOV / 2) * Math.PI / 180) // frustum half-angle, for depth-aware XY bounds
    const BOUND_START = 0.82 // fraction of visible extent where the boundary turn begins
    const BOUND_FORCE = 6    // peak boundary acceleration at the true edge (quadratic ramp from BOUND_START)

    const addSteer = (
      dx: number, dy: number, dz: number,
      bvx: number, bvy: number, bvz: number,
      weight: number,
    ) => {
      const dm = Math.sqrt(dx*dx + dy*dy + dz*dz)
      if (!dm) return
      const sMaxEff = MAX_SPEED * params.speed
      let sx = dx / dm * sMaxEff - bvx
      let sy = dy / dm * sMaxEff - bvy
      let sz = dz / dm * sMaxEff - bvz
      const sm = Math.sqrt(sx*sx + sy*sy + sz*sz)
      if (sm > forceCap) { const inv = forceCap / sm; sx *= inv; sy *= inv; sz *= inv }
      fx += sx * weight; fy += sy * weight; fz += sz * weight
    }

    // ── Startle waves ─────────────────────────────────────────────────────────
    // A random boid is jolted with a strong impulse; alignment propagates the
    // turn outward as an emergent wave (no manual propagation here).
    let startle: { x: number; y: number; z: number; dirX: number; dirY: number; dirZ: number; t0: number } | null = null
    let nextStartleT: number | null = null // set relative to first tick's clock below

    let raf: number
    let last = performance.now()

    const tick = () => {
      // Paused (another world active): keep the rAF chain alive but do no work,
      // so switching back is instant — no context/shader/buffer rebuild
      if (pausedRef.current) {
        last = performance.now()
        if (panelVisible) { panelVisible = false; panel.style.display = 'none' }
        raf = requestAnimationFrame(tick)
        return
      }

      const now = performance.now()
      // Sim constants are tuned per-frame @60fps; dt60 normalizes to that regardless
      // of refresh rate (120Hz ProMotion would otherwise run the flock at 2×)
      const dt60 = Math.min((now - last) / 16.667, 2)
      last = now
      const t = now / 1000

      // ── Live depth/fade/blur uniforms ──────────────────────────────────────
      // Cap depth so short/narrow windows can't let letters reach the camera plane.
      const nearEff = Math.min(params.depthNear, dist * 0.65)
      mat.uniforms.uFadeNear.value = dist - nearEff
      mat.uniforms.uFadeFar.value  = dist + params.depthFar
      mat.uniforms.uFadeFloor.value = 1 - params.depthFade
      mat.uniforms.uBlur.value = params.depthBlur

      const n = Math.min(MAX_N, Math.round(params.count))

      // ── Startle wave scheduling ────────────────────────────────────────────
      if (nextStartleT === null) nextStartleT = t + (STARTLE_GAP_MIN + Math.random() * (STARTLE_GAP_MAX - STARTLE_GAP_MIN)) / params.startleRate
      if (t >= nextStartleT) {
        const epi = Math.floor(Math.random() * n)
        const da = Math.random() * Math.PI * 2
        const dp = (Math.random() - 0.5) * Math.PI
        startle = {
          x: bpx[epi], y: bpy[epi], z: bpz[epi],
          dirX: Math.cos(dp) * Math.cos(da),
          dirY: Math.sin(dp),
          dirZ: Math.cos(dp) * Math.sin(da),
          t0: t,
        }
        nextStartleT = t + (STARTLE_GAP_MIN + Math.random() * (STARTLE_GAP_MAX - STARTLE_GAP_MIN)) / params.startleRate
      }

      // ── Camera slow drift to reveal 3D volume ─────────────────────────────
      camera.position.x = Math.sin(t * 0.07) * dist * 0.10
      camera.position.y = Math.sin(t * 0.05 + 1.2) * dist * 0.05
      camera.lookAt(0, 0, 0)
      camera.updateMatrixWorld()

      // ── Attractor course changes ───────────────────────────────────────────
      // Scheduled sharp turns keep travel from reading as a straight line; the
      // slow sine wander below rides on top as a small additive wobble.
      if (nextCourseT === null) nextCourseT = t + COURSE_GAP_MIN + Math.random() * (COURSE_GAP_MAX - COURSE_GAP_MIN)
      if (t >= nextCourseT) {
        const turn = (COURSE_TURN_MIN + Math.random() * (COURSE_TURN_MAX - COURSE_TURN_MIN)) * params.courseTurniness * (Math.random() < 0.5 ? -1 : 1)
        const candAngle = atAngle + turn
        // Bias the new heading homeward as the attractor nears the drift ring —
        // random at center, mostly homeward near maxDrift — so it can't camp on the ring.
        const aLenNow = Math.sqrt(atX*atX + atY*atY + atZ*atZ)
        const maxDriftNow = Math.min(W, H) * 0.38
        const w = Math.min(1, aLenNow / maxDriftNow)
        const homeAngle = Math.atan2(-atZ, -atX)
        let dA = homeAngle - candAngle
        dA -= Math.floor((dA + Math.PI) / (Math.PI * 2)) * Math.PI * 2 // wrap to [-π, π]
        atAngleTarget = candAngle + dA * (w * 0.8)
        const candPitch = (Math.random() - 0.5) * 2 * COURSE_PITCH_MAX
        let homePitch = candPitch * (1 - w * 0.6)
        if (Math.abs(atY) > maxDriftNow * 0.5) homePitch = Math.abs(homePitch) * (atY > 0 ? -1 : 1)
        atPitchTarget = homePitch
        nextCourseT = t + COURSE_GAP_MIN + Math.random() * (COURSE_GAP_MAX - COURSE_GAP_MIN)
      }
      const courseLerp = 1 - Math.pow(1 - 1 / (COURSE_EASE * 60), dt60) // exponential ease, ~COURSE_EASE sec time constant
      atAngle += (atAngleTarget - atAngle) * courseLerp
      atPitch += (atPitchTarget - atPitch) * courseLerp

      // Small sine wobble riding on top of the eased course heading (not accumulated into atAngle/atPitch)
      const wobA = Math.sin(t * 0.19) * 0.12 + Math.cos(t * 0.11) * 0.08
      const wobP = Math.sin(t * 0.13) * 0.12
      const drAngle = atAngle + wobA
      const drPitch = atPitch + wobP
      // Attractor velocity eases toward the heading direction (~0.8s time constant)
      // instead of stepping position directly — course changes carry through as arcs.
      const attrVelLerp = 1 - Math.pow(1 - 1 / (0.8 * 60), dt60)
      const tvx = Math.cos(drPitch) * Math.cos(drAngle) * AT_SPEED
      const tvy = Math.sin(drPitch) * AT_SPEED * 0.6
      const tvz = Math.cos(drPitch) * Math.sin(drAngle) * AT_SPEED * 0.35
      atVX += (tvx - atVX) * attrVelLerp
      atVY += (tvy - atVY) * attrVelLerp
      atVZ += (tvz - atVZ) * attrVelLerp
      atX += atVX * dt60
      atY += atVY * dt60
      atZ += atVZ * dt60
      // Soft pull toward origin when attractor wanders too far
      const aLen = Math.sqrt(atX*atX + atY*atY + atZ*atZ)
      const maxDrift = Math.min(W, H) * 0.38
      if (aLen > maxDrift) {
        // Proportional spring pull: soft at first touch, impossible to outrun as overshoot grows.
        const f = ((aLen - maxDrift) * 0.02 * dt60) / aLen
        atX -= atX * f; atY -= atY * f; atZ -= atZ * f
      }

      mesh.count = n

      // Capture previous-frame positions before this frame's integration —
      // interpolated against below for trail substeps.
      for (let i = 0; i < n; i++) { ppx[i] = bpx[i]; ppy[i] = bpy[i]; ppz[i] = bpz[i] }

      // ── Rebuild spatial grid (reuse bucket arrays to avoid allocation churn) ──
      // Also accumulate the flock centroid for the regroup force below.
      let cenX = 0, cenY = 0, cenZ = 0
      for (const bucket of grid.values()) bucket.length = 0
      for (let i = 0; i < n; i++) {
        const key = cellKey(Math.floor(bpx[i] / CELL), Math.floor(bpy[i] / CELL), Math.floor(bpz[i] / CELL))
        let bucket = grid.get(key)
        if (!bucket) { bucket = []; grid.set(key, bucket) }
        bucket.push(i)
        cenX += bpx[i]; cenY += bpy[i]; cenZ += bpz[i]
      }
      cenX /= n; cenY /= n; cenZ /= n

      // ── Force-cap breathing ────────────────────────────────────────────────
      // Slow global oscillation (~0.7×–1.3×) keeps turns from all snapping at
      // an identical angular rate; a live startle event raises the cap further
      // so escape turns can snap sharply, decaying back as the impulse fades.
      forceCap = MAX_FORCE * (0.7 + FORCE_CAP_OSC_AMP * (0.5 + 0.5 * Math.sin(t * 0.23 + 4.1)))
      if (startle !== null) {
        const dtStartle = t - startle.t0
        if (dtStartle < STARTLE_DUR) {
          const decay = 1 - dtStartle / STARTLE_DUR
          forceCap = Math.max(forceCap, MAX_FORCE * (1 + (FORCE_CAP_STARTLE_MULT - 1) * decay))
        }
      }

      // ── Boids simulation (3D) ─────────────────────────────────────────────
      for (let i = 0; i < n; i++) {
        const bx = bpx[i], by = bpy[i], bz = bpz[i]
        const bvxI = bvx[i], bvyI = bvy[i], bvzI = bvz[i]

        let sepX = 0, sepY = 0, sepZ = 0, sepN = 0
        let aliVx = 0, aliVy = 0, aliVz = 0, aliN = 0
        let cohX  = 0, cohY  = 0, cohZ  = 0, cohN = 0

        const cix = Math.floor(bx / CELL)
        const ciy = Math.floor(by / CELL)
        const ciz = Math.floor(bz / CELL)
        let topoN = 0
        outer:
        for (let gz = ciz - 1; gz <= ciz + 1; gz++)
        for (let gy = ciy - 1; gy <= ciy + 1; gy++)
        for (let gx = cix - 1; gx <= cix + 1; gx++) {
          const bucket = grid.get(cellKey(gx, gy, gz))
          if (!bucket) continue
          for (let k = 0; k < bucket.length; k++) {
            const j = bucket[k]
            if (i === j) continue
            const dx = bx - bpx[j]
            const dy = by - bpy[j]
            const dz = bz - bpz[j]
            const d2 = dx*dx + dy*dy + dz*dz

            if (d2 < SEP_R2 && d2 > 0) {
              const inv = 1 / Math.sqrt(d2)
              sepX += dx * inv; sepY += dy * inv; sepZ += dz * inv; sepN++
            }
            // Cap ali/coh at MAX_NEIGHBORS, but keep scanning until separation
            // has seen a few close boids too — grid-scan order isn't nearest-first,
            // and starving separation makes clumps self-reinforce
            if (topoN < MAX_NEIGHBORS) {
              if (d2 < ALI_R2) { aliVx += bvx[j]; aliVy += bvy[j]; aliVz += bvz[j]; aliN++ }
              if (d2 < COH_R2) {
                cohX += bpx[j]; cohY += bpy[j]; cohZ += bpz[j]; cohN++
                topoN++
              }
            } else if (sepN >= SEP_SAT) break outer
          }
        }

        fx = 0; fy = 0; fz = 0

        if (sepN > 0) addSteer(sepX/sepN, sepY/sepN, sepZ/sepN, bvxI, bvyI, bvzI, params.separation)
        if (aliN > 0) addSteer(aliVx/aliN, aliVy/aliN, aliVz/aliN, bvxI, bvyI, bvzI, params.alignment)
        if (cohN > 0) addSteer(cohX/cohN - bx, cohY/cohN - by, cohZ/cohN - bz, bvxI, bvyI, bvzI, params.cohesion)

        // Attractor pull — taper weight near the attractor so the flock orbits/
        // drifts around it instead of bunching on it; full weight beyond ~300u.
        const adx = atX - bx, ady = atY - by, adz = atZ - bz
        const adist = Math.sqrt(adx*adx + ady*ady + adz*adz)
        const ATTR_NEAR = 120, ATTR_FAR = 300, ATTR_NEAR_W = 0.3
        let attrTaper = 1
        if (adist < ATTR_FAR) {
          const tt = Math.max(0, Math.min(1, (adist - ATTR_NEAR) / (ATTR_FAR - ATTR_NEAR)))
          const sm = tt * tt * (3 - 2 * tt) // smoothstep
          attrTaper = ATTR_NEAR_W + (1 - ATTR_NEAR_W) * sm
        }
        addSteer(adx, ady, adz, bvxI, bvyI, bvzI, params.attraction * attrTaper)

        // Regroup: weak pull toward the flock centroid so detached subgroups
        // drift back together over time. Cohesion is purely local (7 topological
        // neighbors), so without this, split groups never re-merge. Boids with
        // few neighbors feel it hardest; saturated ones only a trickle.
        const lonely = 1 - cohN / MAX_NEIGHBORS
        addSteer(cenX - bx, cenY - by, cenZ - bz, bvxI, bvyI, bvzI, params.regroup * (0.25 + 0.75 * lonely))

        // Predator scatter (2D screen-space, column of influence through Z)
        const pdx = bx - pwX
        const pdy = by - pwY
        const pd2 = pdx*pdx + pdy*pdy
        if (pd2 < PRED_R2 && pd2 > 0) {
          const pd = Math.sqrt(pd2)
          addSteer(pdx/pd, pdy/pd, 0, bvxI, bvyI, bvzI, W_PRED * (1 - pd / PRED_R))
        }

        // Startle impulse: cheap squared-distance early-out before the sqrt
        if (startle !== null) {
          const dtStartle = t - startle.t0
          if (dtStartle < STARTLE_DUR) {
            const sdx = bx - startle.x, sdy = by - startle.y, sdz = bz - startle.z
            const sd2 = sdx*sdx + sdy*sdy + sdz*sdz
            if (sd2 < STARTLE_R2) {
              const falloff = 1 - Math.sqrt(sd2) / STARTLE_R
              const decay   = 1 - dtStartle / STARTLE_DUR
              const strength = params.startleStrength * falloff * decay
              fx += startle.dirX * strength
              fy += startle.dirY * strength
              fz += startle.dirZ * strength
            }
          }
        }

        // Soft boundary push — XY bounds are frustum-aware (visible extent shrinks
        // as a boid nears the camera), so near boids no longer overflow the screen.
        // Turn starts at 82% of the visible extent and ramps quadratically to the edge.
        const camDist = dist - bz
        const halfH = camDist * tanHalfFov
        const halfW = halfH * camera.aspect
        const startH = halfH * BOUND_START
        const startW = halfW * BOUND_START
        if (halfW > startW) {
          if (bx < -startW) { const o = Math.min(1, (-startW - bx) / (halfW - startW)); fx += o * o * BOUND_FORCE }
          else if (bx > startW) { const o = Math.min(1, (bx - startW) / (halfW - startW)); fx -= o * o * BOUND_FORCE }
        }
        if (halfH > startH) {
          if (by < -startH) { const o = Math.min(1, (-startH - by) / (halfH - startH)); fy += o * o * BOUND_FORCE }
          else if (by > startH) { const o = Math.min(1, (by - startH) / (halfH - startH)); fy -= o * o * BOUND_FORCE }
        }
        // Z boundary — asymmetric: near side capped+margined, far side uncapped
        const bm = 80
        const zmNear = nearEff + bm
        if (bz >  zmNear) fz -= ( bz - zmNear) * 0.05
        if (bz < -params.depthFar) fz += (-params.depthFar - bz) * 0.05

        // Tiny per-bird wander breaks lockstep uniformity
        fx += (Math.random() - 0.5) * 0.05
        fy += (Math.random() - 0.5) * 0.05
        fz += (Math.random() - 0.5) * 0.05

        const ovx = bvxI, ovy = bvyI, ovz = bvzI
        let nvx = ovx + fx * dt60, nvy = ovy + fy * dt60, nvz = ovz + fz * dt60

        const spd = Math.sqrt(nvx*nvx + nvy*nvy + nvz*nvz)

        // Speed–turn coupling: slow into hard turns, surge back out of them
        const oSpd = Math.sqrt(ovx*ovx + ovy*ovy + ovz*ovz)
        if (oSpd > 0 && spd > 0) {
          const turn = 1 - (ovx*nvx + ovy*nvy + ovz*nvz) / (oSpd * spd) // 0 = straight, ~2 = reversal
          const target = bsMax[i] * params.speed * (1 - Math.min(turn, 1) * (1 - SPEED_TURN_FLOOR))
          const rate = target < bsCur[i] ? SPEED_TURN_SLOW : SPEED_TURN_SURGE
          bsCur[i] += (target - bsCur[i]) * Math.min(1, rate * dt60)
        }

        const minSpeedEff = MIN_SPEED * params.speed
        if (spd > bsCur[i]) {
          const inv = bsCur[i] / spd; nvx *= inv; nvy *= inv; nvz *= inv
        } else if (spd < minSpeedEff && spd > 0) {
          const inv = minSpeedEff / spd; nvx *= inv; nvy *= inv; nvz *= inv
        }

        bvx[i] = nvx; bvy[i] = nvy; bvz[i] = nvz
        bpx[i] = bx + nvx * dt60; bpy[i] = by + nvy * dt60; bpz[i] = bz + nvz * dt60
      }

      // ── Update per-bird heading angle (camera-billboarded) ────────────────
      // Glyphs always face the camera (no edge-on vanishing/flipping); they
      // rotate only in the screen plane toward their heading, smoothed per-bird.
      // Depends only on velocity (unchanged across trail substeps), so it's
      // computed once per frame — substeps below only re-lerp position.
      const cm  = camera.matrixWorld.elements
      const cRx = cm[0], cRy = cm[1], cRz = cm[2]   // camera right
      const cUx = cm[4], cUy = cm[5], cUz = cm[6]   // camera up
      const cFx = cm[8], cFy = cm[9], cFz = cm[10]  // camera forward (toward viewer)
      const turnLerp = Math.min(1, 0.12 * dt60)
      for (let i = 0; i < n; i++) {
        const hx = bvx[i]*cRx + bvy[i]*cRy + bvz[i]*cRz
        const hy = bvx[i]*cUx + bvy[i]*cUy + bvz[i]*cUz
        let da = Math.atan2(hy, hx) - bang[i]
        da = Math.atan2(Math.sin(da), Math.cos(da))
        bang[i] += da * turnLerp
      }

      // Builds instance matrices at interpolation fraction f (0 = previous frame's
      // position, 1 = this frame's final position) and uploads them to the mesh.
      const e = tmpMat.elements
      const S = PLANE_S
      const buildMatricesAt = (f: number) => {
        for (let i = 0; i < n; i++) {
          const c = Math.cos(bang[i]), s = Math.sin(bang[i])
          const px = ppx[i] + (bpx[i] - ppx[i]) * f
          const py = ppy[i] + (bpy[i] - ppy[i]) * f
          const pz = ppz[i] + (bpz[i] - ppz[i]) * f

          // Column-major Matrix4: [right*S | up*S | fwd | pos], basis spun by ang
          e[0]  = (cRx*c + cUx*s) * S;  e[1]  = (cRy*c + cUy*s) * S;  e[2]  = (cRz*c + cUz*s) * S;  e[3]  = 0
          e[4]  = (cUx*c - cRx*s) * S;  e[5]  = (cUy*c - cRy*s) * S;  e[6]  = (cUz*c - cRz*s) * S;  e[7]  = 0
          e[8]  = cFx;                  e[9]  = cFy;                  e[10] = cFz;                  e[11] = 0
          e[12] = px;                   e[13] = py;                   e[14] = pz;                   e[15] = 1

          mesh.setMatrixAt(i, tmpMat)
        }
        mesh.instanceMatrix.needsUpdate = true
      }

      const substeps = params.trailSubsteps
      const trailOn = params.trail > 0

      // Transition 0→>0: clear both accumulation targets to the surface color
      // so stale content from a previous trail session never ghosts back in.
      // This also guarantees a full clear when the slider goes back to 0 —
      // the screen path below no longer touches the targets at all.
      if (trailOn && !prevTrailOn) {
        renderer.setRenderTarget(trailA); renderer.clear(true, false, false)
        renderer.setRenderTarget(trailB); renderer.clear(true, false, false)
        renderer.setRenderTarget(null)
      }
      prevTrailOn = trailOn

      if (trailOn) {
        // trail is a gradual multiplier on trailDuration, not just a gate:
        // trail=1 uses the full configured duration, trail=0.1 fades in a
        // tenth of it, trail=0 (handled above) is fully off.
        const effDuration = params.trailDuration * params.trail
        const dtSec = dt60 / 60 // dt60 already normalizes (now-last) to 60fps units
        renderer.autoClearColor = false

        // One stamp: fade previous accumulation (trailRead) into trailWrite,
        // then draw the flock on top at interpolation fraction f, then swap.
        const stamp = (f: number, alpha: number, timeOffset: number) => {
          renderer.setRenderTarget(trailWrite)
          copyMat.uniforms.tPrev.value = trailRead.texture
          copyMat.uniforms.uAlpha.value = alpha
          copyMat.uniforms.uTime.value = t + timeOffset
          renderer.render(copyScene, trailCamera)
          buildMatricesAt(f)
          renderer.render(scene, camera)
          const tmp = trailRead; trailRead = trailWrite; trailWrite = tmp
        }

        if (substeps > 0) {
          // Split the frame's fade into (substeps+1) equal-retention stamps so a
          // fast boid draws a continuous ribbon instead of one dot per frame,
          // with the same total fade as a single-substep frame.
          const subAlpha = Math.min(1, Math.max(0.008, 1 - Math.pow(0.5, dtSec / effDuration / (substeps + 1))))
          for (let step = 1; step <= substeps; step++) stamp(step / (substeps + 1), subAlpha, step * 0.017)
          stamp(1, subAlpha, 1)
        } else {
          const alpha = Math.min(1, Math.max(0.008, 1 - Math.pow(0.5, dtSec / effDuration)))
          stamp(1, alpha, 0)
        }

        renderer.setRenderTarget(null)
        blitMat.uniforms.tMap.value = trailRead.texture
        renderer.autoClear = true
        renderer.render(blitScene, trailCamera)
      } else {
        renderer.autoClearColor = true
        buildMatricesAt(1)
        renderer.render(scene, camera)
      }
      raf = requestAnimationFrame(tick)
    }

    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      geo.dispose()
      mat.dispose()
      atlas.dispose()
      trailGeo.dispose()
      copyMat.dispose()
      blitMat.dispose()
      trailA.dispose()
      trailB.dispose()
      renderer.dispose()
      canvas.removeEventListener('mousemove',  onMouseMove)
      canvas.removeEventListener('mouseleave', onMouseLeave)
      canvas.removeEventListener('touchmove',  onTouchMove)
      canvas.removeEventListener('touchend',   onTouchEnd)
      window.removeEventListener('resize', onResize)
      document.removeEventListener('keydown', onKeyDown)
      document.body.removeChild(panel)
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'fixed', inset: 0, width: '100%', height: '100%', display: 'block', ...style }}
    />
  )
}
