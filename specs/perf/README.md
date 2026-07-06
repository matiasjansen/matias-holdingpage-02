# Performance fix specs

Specs for performance improvements identified 2026-07-04 on branch `feat/new-world`. Each is independent and safe to implement in isolation, in its own commit.

**Hard constraint for all specs: zero visible change.** The letters, flag, and birds modes must look and feel pixel-identical before and after. If a fix cannot be made visually invisible, stop and flag it instead of shipping an approximation.

Context: personal holding page with three canvas modes —
- **Kinetic letters** (default): `src/PhysicsCanvas.tsx`, Rapier2D physics + 2D canvas, letters of "Matias Jansen, Designer" tumble with fading trails.
- **Flag mode**: same file, Three.js shader flag on `webglCanvas`, toggled by pressing `m` three times quickly ("triple-M").
- **Birds mode**: `src/MurmurCanvas.tsx`, 500 boids rendered as instanced letter glyphs, toggled by triple-S (handled in `src/App.tsx`).

**Budget note for the executing agent:** the user is on a token budget. Implement each spec in **separate steps/commits**, and where you delegate work to subagents, spawn **Sonnet at low effort** (`model: "sonnet"`) rather than Opus/Fable — these specs are deliberately detailed enough that a smaller model can execute them. Reserve the larger model only for spec 02 (spatial grid) if Sonnet struggles. Prefer doing the work inline over spawning agents at all when context is already loaded.

Recommended order (impact / risk):

1. `01-pause-hidden-loops.md` — stop simulating/drawing hidden modes (biggest win, low risk)
2. `03-murmur-gpu-dispose.md` — fix GPU resource leak on birds toggle (trivial)
3. `04-skip-sleeping-trails.md` — skip trail work for settled letters (big win at rest)
4. `02-boids-spatial-grid.md` — replace O(N²) neighbor search (biggest birds-mode win, most involved; own commit so flocking feel can be A/B'd)
5. `05-minor-cleanups.md` — closure allocation, invisible-sample culling, frustumCulled

Verification for every spec: `npm run build` must pass (or the project's tsc/vite equivalent — check `package.json`), and manually eyeball all three modes plus the toggles (triple-M, triple-S) in the dev server.

Line numbers below refer to the working tree as of 2026-07-04 (uncommitted changes present); treat them as anchors, re-locate if drifted.

## Round 2 (2026-07-06) — specs 08–11

Specs 01–07 are implemented. Round 2, identified on `feat/new-world` at 752c6ef; same hard constraint (zero visible change), same budget note (Sonnet low effort per spec, separate commits). Recommended order:

1. `08-instanced-upload-and-trig-cache.md` — cut redundant instanceMatrix uploads (~5×224 KB/frame) + trig recompute across trail substeps (low risk, birds mode)
2. `10-stop-raf-when-paused.md` — kill the no-op rAF chain on whichever canvas is paused (low risk, both files)
3. `11-static-letters-skip-redraw.md` — zero draw work once letters settle (medium risk — invalidation must be right; default-mode steady-state win)
4. `09-flat-spatial-grid.md` — Map-of-arrays grid → flat counting-sort typed arrays (medium risk, hot loop; also fixes unbounded stale-bucket growth)
