# 04 — Skip trail work for settled (sleeping) letters

## Problem

`src/PhysicsCanvas.tsx`, letters draw loop (~lines 818–869): once letters come to rest, Rapier puts their bodies to sleep, but every frame each letter still:
- pushes `TRAIL_SUBSTEPS + 1` (default 9) interpolated samples into its `TrailBuffer`,
- culls old samples,
- draws up to ~250 stacked translucent atlas stamps **at the same position**, all fully hidden behind the opaque letter drawn last at alpha 1.

The page spends most of its life in this settled state, so this is thousands of pointless `drawImage` calls per frame at idle.

## Why skipping is invisible

A stationary trail is a stack of identical stamps directly under the alpha-1 glyph — occluded except for sub-pixel antialiased edge contribution that is imperceptible. When the letter starts moving again, the trail restarts from its current position, which matches the current visual (trail fades out within `TRAIL_DURATION` = 500 ms of stopping anyway).

## Steps

1. In the `for (const entry of entries)` loop in `draw`, after reading `pos`/`angle`, compute whether the body is at rest. Use Rapier's sleep state: `body.isSleeping()`. (If dragging via kinematic bodies interferes — a dragged body is `KinematicPositionBased`, not sleeping — no special case needed: kinematic moving bodies aren't sleeping.)
2. If sleeping:
   - **Do not** push new samples (skip the `prev` interpolation block and the `trail.push`).
   - **Still run** `trail.shiftWhile(...)` culling and **still draw** whatever samples remain, so an in-flight trail fades out naturally over 500 ms after the letter lands, exactly as today.
   - Once `trail.length === 0`, the per-letter cost is just the single full-opacity draw.
3. If awake: unchanged behavior.
4. Do not add a position-epsilon heuristic — sleep state alone is enough and avoids tuning. (Rapier bodies jitter slightly before sleep; those frames keep trails, matching today.)

## Must not change

- Trail appearance during motion, on landing (fade-out), and while dragging.
- The triple-U tweak panel sliders must still affect live trails.

## Verify

- Watch a letter fall and settle: trail fades within ~500 ms, then no visual change vs. before.
- Drag a letter: trail appears as today; release: fades as today.
- Devtools Performance at idle: per-frame `drawImage` count drops to ~1 per letter.
- Build passes.
