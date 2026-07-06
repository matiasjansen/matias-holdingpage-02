# 09 — Replace Map-of-arrays spatial grid with flat typed-array grid

**File:** `src/MurmurCanvas.tsx` · **Risk:** medium (touches flocking hot loop) ·
**Visible change:** none allowed — neighbor sets must be identical, so flocking
feel is untouched.

## Problem

The spatial hash (~line 412) is a `Map<number, number[]>`:

- Every neighbor query does up to 27 `grid.get(cellKey(...))` Map lookups per boid
  per frame (n ≈ 2850 → ~77k hashed Map lookups/frame), each boxing the numeric key.
- Buckets are plain JS arrays — pointer-chasing, not cache-friendly.
- Buckets are never deleted, only `length = 0`'d, so as the flock wanders the Map
  accumulates stale empty cells forever (the per-frame clear loop `for (const bucket
  of grid.values()) bucket.length = 0` gets slower the longer the session runs).

## Fix — counting-sort grid, rebuilt each frame

Keep `CELL = COH_R` and the same 3×3×3 neighborhood scan. Replace the Map with:

```ts
const HASH_SIZE = 4096                        // power of two
const cellStart = new Int32Array(HASH_SIZE + 1)
const cellEntries = new Int32Array(MAX_N)
const boidCell = new Int32Array(MAX_N)        // scratch: hash per boid
const hashCell = (ix: number, iy: number, iz: number) =>
  ((ix * 73856093) ^ (iy * 19349663) ^ (iz * 83492791)) & (HASH_SIZE - 1)
```

Per frame (replacing the current rebuild block ~line 557, keep the centroid
accumulation in the same pass):

1. `cellStart.fill(0)`; for each boid i compute `boidCell[i] = hashCell(...)` and
   `cellStart[boidCell[i] + 1]++`.
2. Prefix-sum `cellStart` in place.
3. Scatter: for each boid, `cellEntries[cellStart[boidCell[i]]++] = i` — **use a
   copy of the offsets** (or the standard trick: prefix-sum into `cellStart`,
   scatter with a second counter array, or re-derive; do NOT corrupt `cellStart`,
   the query loop needs it). Simplest correct version: keep a separate
   `cellCursor = Int32Array(HASH_SIZE)`, copy starts in, scatter via cursor.

Query (inner loop ~line 597): for each of the 27 cells compute `h = hashCell(gx, gy, gz)`
and iterate `for (let k = cellStart[h]; k < cellStart[h + 1]; k++) { const j = cellEntries[k]; … }`.
Everything inside (distance checks, `MAX_NEIGHBORS` / `SEP_SAT` early-outs,
`break outer`) stays byte-for-byte the same.

**Hash-collision note:** the old code also had collisions (distinct cells sharing a
bucket) and filtered by `d2` — same story here, so behavior is equivalent. The old
`cellKey` multiplied; use XOR as above so distant negative coords don't correlate.

## Verify

`npm run build`. Birds mode: flocking looks the same (ribbons, startle waves,
predator scatter), no perf regression at count = 3500 (check with the triple-U
count slider). Let it run several minutes — no growing jank (this was the stale-
bucket symptom).
