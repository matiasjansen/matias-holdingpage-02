# 02 — Replace O(N²) boid neighbor search with a spatial hash grid

## Problem

`src/MurmurCanvas.tsx`, simulation loop (~line 228): for each of `N = 500` boids, an inner loop scans all other 499 — ~250k pair distance checks per frame. This is the dominant cost of birds mode and caps N / min-spec framerate.

## Constraint

Flocking behavior must be **exactly** the same, not approximately: the grid must return the same neighbor sets as the brute-force loop for every radius (`SEP_R=28`, `ALI_R=72`, `COH_R=95`). Since `COH_R` is the largest radius, a grid queried at `COH_R` covers all three — per-pair radius checks stay as-is inside the loop.

## Steps

1. **Choose cell size** = `COH_R` (95). With cell = max radius, checking the boid's cell plus the 26 surrounding cells (3×3×3, since boids are 3D: x, y, z all participate in `d2`) is guaranteed to include every neighbor within `COH_R`.

2. **Build the grid each frame** before the per-boid loop. Simplest allocation-friendly structure:
   - `cellOf(b)`: `ix = floor((b.x + OFFSET) / CELL)`, same for y, z; hash into a `Map<number, number[]>` keyed by `ix + iy*P1 + iz*P2` (pick large distinct multipliers, e.g. 73856093 / 19349663 / 83492791, or simple `ix + iy*1024 + iz*1048576` given coordinates are bounded by screen size + DEPTH).
   - To avoid per-frame allocation churn, reuse the Map and clear arrays, or use the counting-sort variant (cell counts → prefix sums → index array in two `Int32Array`s). Either is acceptable; the typed-array variant is preferred if it stays readable.

3. **Rewrite the inner loop**: for boid `i`, iterate boids in the 27 candidate cells instead of all N. Keep the body identical — same `d2` computation, same three radius branches (`SEP_R2`, `ALI_R2`, `COH_R2`), same accumulators, same `if (i === j) continue`.

4. **Leave everything else untouched**: `addSteer`, attractor, predator, boundary push, speed clamp, matrix update. Order of neighbor iteration may differ from brute force — that's fine, accumulation is order-independent sums (floating-point reassociation differences are acceptable; behavior is statistically identical).

5. **Sanity check equivalence** (recommended, throwaway): for one frame, run both brute-force and grid versions and assert neighbor counts (`sepN/aliN/cohN`) match per boid. Delete the check before committing.

## Optional follow-up in same commit (only if trivial)

Convert `boids` from array-of-objects to SoA `Float32Array`s (`px, py, pz, vx, vy, vz` + `Uint8Array ci`) for cache locality. Skip if it makes the diff hard to review — the grid is the win.

## Verify

- Birds mode looks the same: flock cohesion, predator scatter on mouse move, attractor wander.
- FPS in devtools with birds mode active improves substantially (measure before/after on the same machine, note numbers in the commit message).
- Build passes.
