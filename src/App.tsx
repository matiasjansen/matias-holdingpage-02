import { PhysicsCanvas } from './PhysicsCanvas'
import { MurmurCanvas } from './MurmurCanvas'
import { GridOverlay } from './GridOverlay'
import { systemMode, themeFor } from './colors'
import { colLeft, colRight, columnCountFor, useViewportSize } from './layoutGrid'
import { Fragment, useEffect, useState } from 'react'

type World = 'ghost' | 'wind' | 'flock'
const WORLDS: { id: World; label: string }[] = [
  { id: 'ghost', label: 'Ghost' },
  { id: 'wind', label: 'Wind' },
  { id: 'flock', label: 'Flock' },
]

// Matches assets/ic-20-checkmark.svg, recolored to currentColor so it follows theme
function CheckIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M16.875 3.125L7.25 16.875L3.125 11.7188" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

// Matches assets/ic-20-grid.svg, recolored to currentColor so it follows theme
function GridOnIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M1.75 4H18.25M1.75 10H18.25M1.75 16H18.25M16 1.75L16 18.25M10 1.75L10 18.25M4 1.75L4 18.25" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  )
}

// Matches assets/ic-20-grid-off.svg, recolored to currentColor so it follows theme
function GridOffIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M4.75 15.25V18.25C4.75 18.6642 4.41421 19 4 19C3.58579 19 3.25 18.6642 3.25 18.25V16.75H1.75C1.33579 16.75 1 16.4142 1 16C1 15.5858 1.33579 15.25 1.75 15.25H4.75ZM10.75 15.25V18.25C10.75 18.6642 10.4142 19 10 19C9.58579 19 9.25 18.6642 9.25 18.25V15.25H10.75ZM18.25 15.25C18.6642 15.25 19 15.5858 19 16C19 16.4142 18.6642 16.75 18.25 16.75H16.75V18.25C16.75 18.6642 16.4142 19 16 19C15.5858 19 15.25 18.6642 15.25 18.25V15.25H18.25ZM13.75 15.25V16.75H12.25V15.25H13.75ZM7.75 15.25V16.75H6.25V15.25H7.75ZM16.75 13.75H15.25V12.25H16.75V13.75ZM4.75 12.25V13.75H3.25V12.25H4.75ZM10.75 12.25V13.75H9.25V12.25H10.75ZM16.75 10.75H15.25V9.25H16.75V10.75ZM4.75 9.25V10.75H3.25V9.25H4.75ZM7.75 9.25V10.75H6.25V9.25H7.75ZM10.75 9.25V10.75H9.25V9.25H10.75ZM13.75 9.25V10.75H12.25V9.25H13.75ZM16.75 7.75H15.25V6.25H16.75V7.75ZM4.75 6.25V7.75H3.25V6.25H4.75ZM10.75 6.25V7.75H9.25V6.25H10.75ZM16 1C16.4142 1 16.75 1.33579 16.75 1.75V3.25H18.25C18.6642 3.25 19 3.58579 19 4C19 4.41421 18.6642 4.75 18.25 4.75H15.25V1.75C15.25 1.33579 15.5858 1 16 1ZM4 1C4.41421 1 4.75 1.33579 4.75 1.75V4.75H1.75C1.33579 4.75 1 4.41421 1 4C1 3.58579 1.33579 3.25 1.75 3.25H3.25V1.75C3.25 1.33579 3.58579 1 4 1ZM7.75 3.25V4.75H6.25V3.25H7.75ZM10 1C10.4142 1 10.75 1.33579 10.75 1.75V4.75H9.25V1.75C9.25 1.33579 9.58579 1 10 1ZM13.75 3.25V4.75H12.25V3.25H13.75Z" fill="currentColor" />
    </svg>
  )
}

// Matches assets/ic-20-colormode.svg, recolored to currentColor so it follows theme
function ThemeIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <circle cx="9.99997" cy="9.99997" r="8.125" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M10 5.375C7.44576 5.375 5.37513 7.4458 5.375 10C5.37513 12.5542 7.44576 14.625 10 14.625V18.8867C5.09201 18.8867 1.1133 14.908 1.11328 10C1.11328 5.092 5.092 1.11328 10 1.11328V5.375Z" fill="currentColor" />
      <path d="M10.1611 6.87939C11.8121 6.96328 13.125 8.32866 13.125 10.0005C13.1247 11.7261 11.7257 13.1255 10 13.1255V6.87451L10.1611 6.87939Z" fill="currentColor" />
    </svg>
  )
}

const CHAR_STAGGER = 0.04
const LINE_GAP = 0.1

function clearCharAnim(e: React.AnimationEvent<HTMLSpanElement>) {
  const el = e.currentTarget
  el.style.animation = 'none'
  el.style.opacity = '1'
  el.style.filter = 'none'
}

function AnimatedLine({ text, startDelay }: { text: string; startDelay: number }) {
  const words = text.split(' ')
  let i = 0
  return (
    <span style={{ display: 'block' }}>
      {words.map((word, wordIdx) => (
        <Fragment key={wordIdx}>
          <span style={{ display: 'inline-block', whiteSpace: 'nowrap' }}>
            {word.split('').map((char) => {
              const charIndex = i++
              return (
                <span
                  key={charIndex}
                  style={{
                    display: 'inline-block',
                    animation: `blurIn 0.5s ${startDelay + charIndex * CHAR_STAGGER}s ease-out both`,
                  }}
                  onAnimationEnd={clearCharAnim}
                >
                  {char}
                </span>
              )
            })}
          </span>
          {wordIdx < words.length - 1 && (() => {
            const charIndex = i++
            return (
              <span
                key={charIndex}
                style={{
                  display: 'inline-block',
                  whiteSpace: 'pre',
                  animation: `blurIn 0.5s ${startDelay + charIndex * CHAR_STAGGER}s ease-out both`,
                }}
                onAnimationEnd={clearCharAnim}
              >
                {' '}
              </span>
            )
          })()}
        </Fragment>
      ))}
    </span>
  )
}

// Seconds digits — animation string is constant so React never re-sets it on the DOM,
// only text content changes each tick (no animation restart → no blink)
function SecondsDigits({ seconds, startDelay, charOffset }: { seconds: string; startDelay: number; charOffset: number }) {
  return (
    <>
      {seconds.split('').map((char, ci) => {
        const i = charOffset + ci
        return (
          <span
            key={ci}
            style={{
              display: 'inline-block',
              animation: `blurIn 0.5s ${startDelay + i * CHAR_STAGGER}s ease-out both`,
            }}
            onAnimationEnd={clearCharAnim}
          >
            {char}
          </span>
        )
      })}
    </>
  )
}

// Renders "HH:MM:SS" — colon opacity is React-controlled via seconds parity, never drifts
function ClockTimeLine({ text, seconds, startDelay }: { text: string; seconds: string; startDelay: number }) {
  // Tie colon visibility to the JS clock so it never drifts from the displayed seconds
  const colonOpacity = seconds && parseInt(seconds) % 2 === 0 ? 1 : 0

  // text is "Day, Mon DD HH:MM", split on ':' gives ["Day, Mon DD HH", "MM"]
  const parts = text.split(':')
  const elements: React.ReactNode[] = []
  let charOffset = 0

  parts.forEach((part, pi) => {
    part.split('').forEach((char, ci) => {
      const i = charOffset + ci
      elements.push(
        <span
          key={`c-${pi}-${ci}`}
          style={{
            display: 'inline-block',
            animation: `blurIn 0.5s ${startDelay + i * CHAR_STAGGER}s ease-out both`,
          }}
          onAnimationEnd={clearCharAnim}
        >
          {char === ' ' ? ' ' : char}
        </span>
      )
    })
    charOffset += part.length

    if (pi < parts.length - 1) {
      elements.push(
        <span key={`colon-${pi}`} style={{ display: 'inline-block', opacity: colonOpacity, transition: 'opacity 0.2s' }}>
          <span style={{ display: 'inline-block', animation: `blurIn 0.5s ${startDelay + charOffset * CHAR_STAGGER}s ease-out both` }} onAnimationEnd={clearCharAnim}>:</span>
        </span>
      )
      charOffset++
    }
  })

  // Append seconds colon + digits after HH:MM
  const secondsColonOffset = charOffset
  elements.push(
    <span key="colon-seconds" style={{ display: 'inline-block', opacity: colonOpacity, transition: 'opacity 0.2s' }}>
      <span style={{ display: 'inline-block', animation: `blurIn 0.5s ${startDelay + secondsColonOffset * CHAR_STAGGER}s ease-out both` }} onAnimationEnd={clearCharAnim}>:</span>
    </span>
  )
  charOffset++

  elements.push(
    <SecondsDigits
      key="seconds"
      seconds={seconds}
      startDelay={startDelay}
      charOffset={charOffset}
    />
  )

  return <span style={{ display: 'block' }}>{elements}</span>
}

function App() {
  const [timeBase, setTimeBase] = useState('')  // "Day, Mon DD HH:MM"
  const [seconds, setSeconds] = useState('')    // "SS"
  const [, setTheme] = useState(themeFor(systemMode()))
  const [gridMode, setGridMode] = useState<'off' | 'modular'>('off')
  const [world, setWorld] = useState<World>('ghost')
  const [emailCopied, setEmailCopied] = useState(false)
  const { width } = useViewportSize()

  const murmurActive = world === 'flock'
  const toggleGrid = () => setGridMode(v => v === 'off' ? 'modular' : 'off')

  // Tell PhysicsCanvas whether flag mode should be on (kept in sync with the triple-M/triple-S secrets)
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('request-world-select', { detail: { world } }))
  }, [world])

  const selectWorld = (w: World) => setWorld(w)
  const toggleTheme = () => window.dispatchEvent(new CustomEvent('request-theme-toggle'))
  const copyEmail = () => {
    navigator.clipboard.writeText('hi@matiasjansen.com')
    setEmailCopied(true)
    window.setTimeout(() => setEmailCopied(false), 1500)
  }

  // Triple-S toggles the murmuration world
  useEffect(() => {
    let count = 0, timer = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 's' || e.key === 'S') {
        count++
        clearTimeout(timer)
        timer = window.setTimeout(() => { count = 0 }, 500)
        if (count >= 3) { count = 0; setWorld(w => w === 'flock' ? 'ghost' : 'flock') }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  // Triple-G toggles the design-grid overlay (columns + rows)
  useEffect(() => {
    let count = 0, timer = 0
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'g' || e.key === 'G') {
        count++
        clearTimeout(timer)
        timer = window.setTimeout(() => { count = 0 }, 500)
        if (count >= 3) {
          count = 0
          toggleGrid()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    const TZ = 'Europe/Amsterdam'
    const fmt = new Intl.DateTimeFormat('en-US', {
      timeZone: TZ,
      weekday: 'short', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hourCycle: 'h23',
    })
    const updateTime = () => {
      const now = new Date()
      const parts = fmt.formatToParts(now)
      const get = (type: string) => parts.find(p => p.type === type)?.value ?? ''
      setTimeBase(`${get('weekday')}, ${get('month')} ${get('day')}  ${get('hour')}:${get('minute')}`)
      setSeconds(get('second'))
    }
    updateTime()
    const interval = setInterval(updateTime, 1000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onSchemeChange = () => setTheme(themeFor(systemMode()))
    const onThemeToggle = (e: Event) => {
      const evt = e as CustomEvent
      setTheme(themeFor(evt.detail.mode))
    }
    mq.addEventListener('change', onSchemeChange)
    window.addEventListener('theme-toggle', onThemeToggle)
    return () => {
      mq.removeEventListener('change', onSchemeChange)
      window.removeEventListener('theme-toggle', onThemeToggle)
    }
  }, [])

  const labelText = 'Matias Jansen, Designer'
  const labelDuration = labelText.length * CHAR_STAGGER + LINE_GAP

  const amsOffsetStr = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Amsterdam',
    timeZoneName: 'shortOffset',
  }).formatToParts(new Date()).find(p => p.type === 'timeZoneName')?.value ?? 'GMT+1'
  // shortOffset gives "GMT+2" or "GMT+1" — insert space after GMT to match existing style
  const tzLine = `AMS ${amsOffsetStr.replace('GMT', 'GMT ')}`

  const timeLineLength = timeBase.length + 1 + 2  // HH:MM + ':' + SS
  const tzDelay = labelDuration + timeLineLength * CHAR_STAGGER + LINE_GAP

  const hidden = undefined   // UI shows in every world (was hidden in flock)
  const columns = columnCountFor(width)
  const isMobile = columns === 4
  const labelWidth = isMobile ? undefined : colRight(2, width) - colLeft(1, width)

  return (
    <>
      <MurmurCanvas style={{ display: murmurActive ? 'block' : 'none' }} paused={!murmurActive} />
      <PhysicsCanvas style={{ display: murmurActive ? 'none' : undefined }} paused={murmurActive} />
      <span className="label" style={{ display: murmurActive ? 'none' : 'block', width: labelWidth }}>
        <AnimatedLine text={labelText} startDelay={0} />
      </span>
      <div className="clock" style={{ display: hidden, top: 16, left: colLeft(3, width) }}>
        {timeBase && (
          <>
            <ClockTimeLine text={timeBase} seconds={seconds} startDelay={labelDuration} />
            <AnimatedLine text={tzLine} startDelay={tzDelay} />
          </>
        )}
      </div>

      <span
        style={{
          display: hidden,
          position: 'fixed', top: 16, left: colRight(9, width),
          transform: 'translateX(-100%)',
          font: '200 24px "OtherSans", sans-serif', lineHeight: '32px',
          color: 'var(--color-on-surface-variant)', userSelect: 'none', zIndex: 1000,
        }}
      >
        Mode
      </span>

      <div
        style={{
          display: hidden,
          position: 'fixed', top: 16, left: colLeft(10, width),
          font: '250 24px "OtherSans", sans-serif', lineHeight: '32px',
          userSelect: 'none', zIndex: 1000,
        }}
      >
        {WORLDS.map(w => {
          const active = w.id === world
          return (
            <div
              key={w.id}
              className="world-row"
              onClick={() => selectWorld(w.id)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                color: active ? 'var(--color-on-surface)' : 'var(--color-on-surface-variant)',
              }}
            >
              <span className="hover-underline" style={{ flex: '0 0 auto', padding: '4px 2px', margin: '-4px -2px' }}>{w.label}</span>
              {active && (
                <span style={{ marginLeft: 'auto', paddingLeft: 8, display: 'inline-flex', transform: 'translateY(-3px)' }}>
                  <CheckIcon />
                </span>
              )}
            </div>
          )
        })}
      </div>

      <span
        className="hover-underline"
        onClick={copyEmail}
        title="Copy email address"
        style={{
          display: hidden,
          padding: '4px 2px', margin: '-4px -2px',
          position: 'fixed', bottom: 16, left: colLeft(3, width),
          font: '250 24px "OtherSans", sans-serif', lineHeight: '32px',
          color: 'var(--color-on-surface)', userSelect: 'none', zIndex: 1000,
        }}
      >
        {emailCopied ? 'Copied!' : 'hi@matiasjansen.com'}
      </span>

      <div
        style={{
          display: 'flex',
          position: 'fixed', top: 16, right: 16,
          alignItems: 'flex-start', gap: 32, zIndex: 1000,
          color: 'var(--color-on-surface)',
        }}
      >
        <button
          onClick={toggleGrid}
          aria-label="Toggle grid overlay"
          className="icon-button"
          style={{
            border: 'none', padding: 0, font: 'inherit',
            cursor: 'pointer', display: 'flex', color: 'inherit',
            width: 24, height: 24, background: 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          {gridMode !== 'off' ? <GridOffIcon /> : <GridOnIcon />}
        </button>
        <button
          onClick={toggleTheme}
          aria-label="Toggle dark mode"
          className="icon-button"
          style={{
            border: 'none', padding: 0, font: 'inherit',
            cursor: 'pointer', display: 'flex', color: 'inherit',
            width: 24, height: 24, background: 'transparent',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <ThemeIcon />
        </button>
      </div>

      {gridMode !== 'off' && <GridOverlay mode={gridMode} />}
    </>
  )
}

export default App
