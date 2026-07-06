# 11 — Skip 2D redraw entirely when the letters scene is static

**File:** `src/PhysicsCanvas.tsx` · **Risk:** medium (easy to get a stale frame) ·
**Visible change:** none allowed.

## Problem

In letters mode, once every body is asleep and all trails have faded out, the
scene is pixel-identical frame to frame — but `draw` still clears the canvas and
re-draws all 21 letters (plus trail bookkeeping) every vsync. On battery this is
the page's steady-state cost, since letters mode is the default and gravity only
rotates every 5 s.

## Fix

In the letters-mode branch of `draw` (~line 844), before `ctx.clearRect`:

1. Compute `let sceneStatic = true` by looping entries: static iff **every**
   `body.isSleeping()` **and** every `entry.trail.length === 0` (after the cull —
   so do a cheap pre-pass that runs `trail.shiftWhile(...)` first, or fold the
   check into the existing per-entry loop and skip only from the *next* frame via
   a `wasStatic` flag — the flag approach is simpler and one extra drawn frame is
   invisible).
2. Keep a module-level `let staticFrameDrawn = false`. If the scene is static and
   `staticFrameDrawn`, skip straight to `rafId = requestAnimationFrame(draw)` —
   no clear, no draws. If static but not yet drawn, draw once and set the flag.
3. **Invalidate** (`staticFrameDrawn = false`) on anything that changes pixels or
   wakes bodies:
   - gravity rotation (the `currentSecond % 5` block ~line 770 — note stepping the
     world with new gravity wakes bodies anyway, but invalidate explicitly),
   - drag start (`tryDrag` success), drag move, drag end,
   - theme change / triple-0 (`toggleTheme`, `onSchemeChange`),
   - resize (`onResize`),
   - returning from flag mode or unpausing (`setFlagMode(false)`, pause→resume),
   - the async `createImageBitmap` upgrade landing (~line 403) — it swaps the
     atlas reference; invalidate in its `.then`.

   Rather than hunting every call site, the robust version: recompute
   `sceneStatic` fresh each frame (bodies wake on any physics disturbance, so
   `isSleeping()` already covers gravity/drag), and additionally invalidate
   explicitly for the non-physics cases (theme, resize, bitmap upgrade, mode
   return). Physics stepping must still run every frame — only the *drawing* is
   skipped — so sleeping/waking state stays truthful. `world.step()` on an
   all-sleeping world is cheap.
4. Trail note: trails only exist for awake-or-recently-awake letters; the
   `trail.length === 0` condition guarantees no mid-fade freeze.

## Verify

`npm run build`. Let letters settle: confirm draws stop (temporary
`console.count('draw')` inside the draw section) until the next gravity flip,
then resume seamlessly. Drag a letter the moment it settles — no stale frame, no
frozen trail. Toggle theme while settled — colors update immediately. Resize —
letters re-render sharp.
