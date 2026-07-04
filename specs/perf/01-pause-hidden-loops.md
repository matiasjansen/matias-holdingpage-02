# 01 — Pause hidden render/simulation loops

## Problem

Both canvases run their full per-frame work even when hidden, so the user pays for two worlds at once:

1. **Birds mode active:** `App.tsx` hides `PhysicsCanvas` with `display: none` (see `App.tsx` render, `murmurActive`), but the `draw` loop in `PhysicsCanvas.tsx` (~line 735) keeps running: `world.step()` on the Rapier world, trail sample push/cull for all ~21 letters, and thousands of `drawImage` calls to the invisible 2D canvas — every frame.
2. **Flag mode active (`flagModeActive`):** the same `draw` loop still calls `world.step()` and rotates gravity every 5 s even though the letters canvas is hidden; only the drawing is skipped (early `return` after the Three render).

## Steps

### Part A — pause PhysicsCanvas entirely when birds mode is active

1. Add a `paused?: boolean` prop to `PhysicsCanvas`; pass `paused={murmurActive}` from `App.tsx`. (Alternative if props feel awkward: a custom window event like the existing `theme-toggle` pattern.)
2. Mirror the prop into a ref the closure can read (`pausedRef.current = paused` in a small separate `useEffect`) — the main `useEffect` has `[]` deps and must stay that way.
3. In `draw`: when paused, do **no** work — no `world.step()`, no trail updates, no drawing — but keep the rAF chain alive (`rafId = requestAnimationFrame(draw)`, then return).
4. While paused, keep resetting `lastTime = now` so `dt` doesn't spike on resume (it's clamped to 0.05 s anyway, but resetting is cleaner). Do not cancel/restart the rAF loop.
5. Resume behavior: today letters keep simulating while hidden, so positions drift invisibly; after this fix they freeze instead. Only observable at the toggle moment — accepted. Stale trail samples get instantly culled by their old timestamps on resume; verify there's no one-frame flash of wrong-alpha trails.

### Part B — skip physics stepping in flag mode

6. In `draw`, when `flagModeActive` is true, skip `world.step()` and the gravity-rotation block (the `currentSecond % 5` logic) before the flag branch. Keep the flag branch itself unchanged.
7. ⚠️ Behavioral note: today, letters keep tumbling invisibly during flag mode, so triple-M back reveals them in new positions. After this fix they resume exactly where they were when flag mode was entered. Confirm with the user if unsure; the assessment conversation flagged this and leaned toward accepting the freeze. If the drifting behavior turns out to be intentional, implement Part B as skip-drawing-only (it already skips drawing) and skip only the trail push/cull, keeping `world.step()`.

## Must not change

- Letters mode appearance and physics feel when visible.
- Flag mode appearance, mouse wind interaction, gust timing (`t = now / 1000` is wall-clock based, unaffected).
- Toggle animations (`flag-enter` class, blur-in).

## Verify

- Letters mode: unchanged.
- Triple-S into birds mode → in devtools Performance panel, confirm no Rapier/canvas2d work from PhysicsCanvas per frame. Toggle back → letters resume, no dt explosion, no trail flash.
- Triple-M flag mode → flag identical; toggle back → letters intact.
