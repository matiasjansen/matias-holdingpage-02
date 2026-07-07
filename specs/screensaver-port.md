# Idea: macOS screensaver port

Status: hypothetical, explored 2026-07-07. Not started.

## Paths, ranked

### 1. Web-view wrapper (~a weekend) — do this first
macOS screensavers are `.saver` bundles hosting a `ScreenSaverView`; embed a
`WKWebView` pointed at the built `dist/`. The open-source **WebViewScreenSaver**
project is a ready-made shell (supply a URL or local files).

Adaptation work, not porting work:
- **Screensavers have no input** — any mouse/key event exits. All interactive
  features (predator scatter, wind jet, drag, triple-key secrets, world
  switching) go dormant. Ship flock-only, or flock/flag on a timer, selected via
  the saver's options sheet instead of keys.
- Assets must load without a dev server: Rapier WASM + font fetches assume one.
  A flock-only build needs neither Rapier nor opentype.
- WKWebView inside the screensaver sandbox (`legacyScreenSaver.appex`) is
  quirky — WebGL works but budget an afternoon of debugging. Multi-monitor =
  one instance (and one webview) per display.

**Go/no-go test before any effort:** drop the current build into
WebViewScreenSaver locally and confirm WebGL + the trail ping-pong pipeline
behave inside the screensaver sandbox. That single test decides viability.

### 2. Native Metal/Swift port of the flock (1–2 weeks) — the "right" version
The murmuration is an excellent candidate: the sim in `src/MurmurCanvas.tsx` is
~400 lines of self-contained math (SoA arrays, counting-sort spatial grid,
steering forces) that translates to Swift nearly mechanically; rendering is one
instanced draw of atlas-textured quads; the trail ping-pong maps directly to
Metal render targets. Flag = one shader, also easy. Letters world is the
expensive one (needs a physics engine — JoltPhysics/Box2D via SPM) and the
least screensaver-suited (it settles and sleeps).

Benefits over path 1: proper battery behavior, no web stack, survives macOS
updates that break webview savers.

### 3. Distribution reality (either path)
Code signing + notarization for anyone but yourself; Apple keeps churning the
third-party screensaver settings surface each macOS release — treat it as a
maintained artifact, not fire-and-forget.

## Recommendation
Path 1 for personal use (flock in dark mode). Path 2 only if it should be
shared. Run the go/no-go sandbox test first in all cases.
