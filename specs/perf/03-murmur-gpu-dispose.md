# 03 — Dispose GPU resources when birds mode unmounts

## Problem

`src/MurmurCanvas.tsx` cleanup (~line 324) calls `renderer.dispose()` but never disposes the `PlaneGeometry` (`geo`), the `ShaderMaterial` (`mat`), or the atlas `CanvasTexture` (`atlas`). `MurmurCanvas` is fully unmounted/remounted on every triple-S toggle (`App.tsx`: `{murmurActive && <MurmurCanvas />}`), so repeated toggling accumulates GPU-side buffers and textures.

## Steps

1. In the `useEffect` cleanup function in `MurmurCanvas.tsx`, before `renderer.dispose()`, add:
   ```ts
   geo.dispose()
   mat.dispose()
   atlas.dispose()
   ```
2. That's it. `mesh` itself needs no dispose call (disposing geometry + material covers it); the scene is dropped with the closure.

## Must not change

Anything visible. This is cleanup-only.

## Verify

- Toggle triple-S on/off ~10 times; in devtools Memory / `renderer.info` (log `renderer.info.memory` before dispose if you want proof) confirm geometries/textures don't accumulate.
- Birds mode still renders correctly after multiple toggles.
- Build passes.
