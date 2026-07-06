# 10 — Actually stop the rAF chain when a canvas is paused

**Files:** `src/MurmurCanvas.tsx`, `src/PhysicsCanvas.tsx` · **Risk:** low ·
**Visible change:** none allowed (switching worlds must stay instant).

## Problem

Both canvases keep their `requestAnimationFrame` chain alive while paused and
just early-return (`MurmurCanvas.tsx` ~line 453, `PhysicsCanvas.tsx` ~line 755).
Both are always mounted, so at any moment one of them is a pure no-op rAF firing
every vsync — on a 120 Hz ProMotion display that's 120 wasted wakeups/s that keep
the compositor scheduling both. The GPU state stays resident either way (that was
the point of spec 01); the rAF churn is just leftover cost.

## Fix

Stop scheduling when paused; reschedule on unpause. Pattern for each file:

1. In the `useEffect(..., [])` body, keep a `let raf` / `rafId` as now, plus
   `let running = true` (Murmur) — Physics already has `alive`.
2. In the tick/draw function, replace the paused early-return block with nothing —
   instead guard scheduling at the pause boundary (see 3). The `last`/`lastTime`
   reset currently done in the paused branch moves to the resume path.
3. Expose a resume hook: store the tick function in a ref-visible variable, e.g.
   assign `resumeRef.current = () => { last = performance.now(); raf = requestAnimationFrame(tick) }`
   where `resumeRef` is a `useRef<() => void>()` declared next to `pausedRef`.
   At the top of tick: `if (pausedRef.current) return` **without** re-requesting —
   the chain simply dies.
4. In the small `useEffect` that syncs `pausedRef` (both files, near the top of the
   component), when `paused` flips false → call `resumeRef.current?.()`.
   Guard against double-scheduling: only resume if the chain is actually stopped
   (e.g. a `let scheduled` boolean flipped in tick and in resume).
5. MurmurCanvas's paused branch also hides the triple-U panel
   (`if (panelVisible) …`) — move that into the pause transition: do it in the
   `pausedRef`-sync effect when `paused` becomes true (via another small ref hook,
   same pattern), or leave a one-shot check at the top of tick before the return.
6. PhysicsCanvas: `lastTime = now` on resume (step 3 equivalent) so the first
   unpaused physics step doesn't get a giant dt (it's already clamped to 0.05 s,
   keep the clamp).

Careful with init ordering in PhysicsCanvas: `draw` is defined inside `init()`
(async). Assign the resume hook inside `init()` after `draw` exists; if unpause
happens before init finishes, the initial `requestAnimationFrame(draw)` at the end
of `init()` covers it (only schedule that one when not currently paused, else let
the resume hook fire it).

## Verify

`npm run build`. Toggle all three worlds repeatedly (triple-S in/out, triple-M
in/out): every switch is instant, letters resume where they were, flock state
persists, no double-speed anywhere (double-speed = the chain got scheduled twice).
With birds active, confirm PhysicsCanvas does zero work (breakpoint or
`console.count` temporarily) — and vice versa.
