# 07 — Dispose flag GPU resources on re-init

**Problem.** The flag's Three.js setup is torn down and rebuilt on resize, system scheme change, triple-0 theme toggle, and triple-M exit — but each teardown only calls `renderer.dispose()`. The plane geometry (COLS·8 × ROWS·8 segments), the flag `CanvasTexture`, and the three `ShaderMaterial`s (flag, dots, wireframe) are never disposed, so GPU memory accumulates over a session. Spec 03 fixed this leak class for birds mode; the flag was missed.

**Fix.** One `disposeThree()` helper next to the `threeSetup` state: dispose geometry, texture, flag mesh material, wireframe material, and dot material, then the renderer, then null out `threeSetup`. Replace every `threeSetup?.renderer.dispose()` / `threeSetup = null` pair (and the lone dispose in `initThreeFlag` and the unmount cleanup) with it.

Note the dot material shares its uniforms object with the flag material (`Object.assign`) — disposing both materials is still safe; uniforms hold no GPU handles of their own (the shared texture is disposed once via `threeSetup.texture`).

**Zero visible change** — teardown-only; the rebuilt flag is identical.

**Verify:** `npm run build`; toggle triple-M in/out repeatedly, resize, and triple-0 while in flag mode — flag looks unchanged each rebuild.
