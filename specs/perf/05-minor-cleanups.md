# 05 — Minor per-frame cleanups (bundle)

Three small independent fixes; do all in one commit. Each is invisible on screen.

## Step 1 — Remove per-frame closure in trail drawing

`src/PhysicsCanvas.tsx` (~line 842): `trail.forEach(sample => { ... })` allocates a closure per entry per frame. Add an index-based accessor to `TrailBuffer` (e.g. `at(i: number): TrailSample` returning `this.buf[(this.head + i) % this.capacity]`) and replace the `forEach` call with a plain `for (let i = 0; i < trail.length; i++)` loop in `draw`. Keep `forEach` on the class if other callers use it (check first); otherwise delete it.

## Step 2 — Cull trail samples that render invisibly

Same loop: sample alpha is `(1 - age / TRAIL_DURATION) * TRAIL_ALPHA`. With the default `TRAIL_ALPHA = 0.08`, samples older than `TRAIL_DURATION * (1 - 1/(255 * TRAIL_ALPHA))` produce alpha < 1/255 — nothing visible is drawn. Tighten the cull in `trail.shiftWhile(...)` from `age > TRAIL_DURATION` to `age > TRAIL_DURATION * (1 - 1 / (255 * TRAIL_ALPHA))`, computed once per frame (TRAIL_ALPHA is tweakable via the triple-U panel, so don't hoist it out of `draw`). Guard against `TRAIL_ALPHA * 255 <= 1` (cull everything — clamp the factor to [0, 1]).

Output is identical: culled samples were quantized to alpha 0 anyway.

## Step 3 — Disable frustum culling on the boid instanced mesh

`src/MurmurCanvas.tsx` (~line 148): after creating the `InstancedMesh`, add `mesh.frustumCulled = false`. Three.js otherwise tests a bounding sphere that is never updated as instances move — it can both waste the per-frame test and (worse) wrongly cull the whole flock if the stale sphere leaves the frustum during camera drift.

## Verify

- Letters mode trails look identical at default settings and at slider extremes (triple-U panel: try alpha 0.01 and 1.0).
- Birds mode: flock never blinks out during camera drift.
- Build passes.
