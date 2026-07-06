# 08 — Trim InstancedMesh upload + cache per-boid trig across substeps

> **Outcome (2026-07-07):** items 1 and 3 shipped (4b9ebb5). Item 2
> (`addUpdateRange`) was reverted in ca7814b after a stutter report that turned
> out to be low battery, not this change. Kept reverted regardless: the saving
> was small (~19% of 224 KB) and partial `bufferSubData` into a buffer uploaded
> 5×/frame risks implicit sync stalls, while full uploads orphan cleanly.
> Only re-apply with measured evidence it helps.

**File:** `src/MurmurCanvas.tsx` · **Risk:** low · **Visible change:** none allowed

## Problem

`buildMatricesAt(f)` (~line 753) runs once per trail stamp — with the default
`trailSubsteps: 4` that's **5 times per frame**. Each run:

1. Recomputes `Math.cos(bang[i])` / `Math.sin(bang[i])` for every boid, even though
   `bang` only changes once per frame (the heading-lerp loop runs before any stamps).
   That's 4 × n × 2 wasted trig calls per frame (n ≈ 2850).
2. Sets `mesh.instanceMatrix.needsUpdate = true`, which uploads the **entire**
   buffer — MAX_N (3500) × 16 floats = 224 KB — even though only `n` instances are
   live. At 5 stamps/frame on a 120 Hz display that's ~130 MB/s of redundant PCIe
   traffic.

## Fix

1. **Trig cache.** Add two module-scope-of-effect arrays next to the other SoA arrays
   (~line 285): `const bcos = new Float32Array(MAX_N), bsin = new Float32Array(MAX_N)`.
   In the heading-angle loop (~line 741, the one updating `bang[i]`), after updating
   `bang[i]`, also set `bcos[i] = Math.cos(bang[i]); bsin[i] = Math.sin(bang[i])`.
   In `buildMatricesAt`, replace `const c = Math.cos(bang[i]), s = Math.sin(bang[i])`
   with `const c = bcos[i], s = bsin[i]`.
2. **Partial upload.** In `buildMatricesAt`, after the loop, before
   `needsUpdate = true`, add:
   ```ts
   mesh.instanceMatrix.clearUpdateRanges()
   mesh.instanceMatrix.addUpdateRange(0, n * 16)
   ```
   (three.js ≥ r159 API — this repo's version supports it; if `addUpdateRange` is
   missing, use `updateRange = { offset: 0, count: n * 16 }` instead.)
3. **FrontSide.** In the boid `ShaderMaterial` (~line 358) change
   `side: THREE.DoubleSide` to `side: THREE.FrontSide`. The instance basis is built
   from camera right/up (billboarded, ~line 761), so planes always face the camera
   and winding never flips. **Verify visually**: if any glyph disappears or flickers
   during fast turns, revert just this item — it's independent of 1 and 2.

## Verify

`npm run build` passes. Birds mode (triple-S): flock renders identically at
trail = 0 and trail > 0, all glyphs visible during startle turns, count slider
up to 3500 still works (upload range must track `n` live).
