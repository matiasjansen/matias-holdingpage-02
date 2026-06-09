import { PhysicsCanvas } from './PhysicsCanvas'
import { systemMode, themeFor } from './colors'
import { useEffect, useState } from 'react'

const CHAR_STAGGER = 0.04
const LINE_GAP = 0.1

function AnimatedLine({ text, startDelay }: { text: string; startDelay: number }) {
  return (
    <span style={{ display: 'block' }}>
      {text.split('').map((char, i) => (
        <span
          key={i}
          style={{
            display: 'inline-block',
            animation: `blurIn 0.5s ${startDelay + i * CHAR_STAGGER}s ease-out both`,
          }}
        >
          {char === ' ' ? ' ' : char}
        </span>
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
        >
          {char === ' ' ? ' ' : char}
        </span>
      )
    })
    charOffset += part.length

    if (pi < parts.length - 1) {
      elements.push(
        <span key={`colon-${pi}`} style={{ display: 'inline-block', opacity: colonOpacity, transition: 'opacity 0.2s' }}>
          <span style={{ display: 'inline-block', animation: `blurIn 0.5s ${startDelay + charOffset * CHAR_STAGGER}s ease-out both` }}>:</span>
        </span>
      )
      charOffset++
    }
  })

  // Append seconds colon + digits after HH:MM
  const secondsColonOffset = charOffset
  elements.push(
    <span key="colon-seconds" style={{ display: 'inline-block', opacity: colonOpacity, transition: 'opacity 0.2s' }}>
      <span style={{ display: 'inline-block', animation: `blurIn 0.5s ${startDelay + secondsColonOffset * CHAR_STAGGER}s ease-out both` }}>:</span>
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
  const [theme, setTheme] = useState(themeFor(systemMode()))

  useEffect(() => {
    const updateTime = () => {
      const now = new Date()
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
      const day = days[now.getDay()]
      const month = months[now.getMonth()]
      const date = now.getDate()
      const h = String(now.getHours()).padStart(2, '0')
      const m = String(now.getMinutes()).padStart(2, '0')
      const s = String(now.getSeconds()).padStart(2, '0')
      setTimeBase(`${day}, ${month} ${date} ${h}:${m}`)
      setSeconds(s)
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

  const now = new Date()
  const offset = -now.getTimezoneOffset() / 60
  const sign = offset >= 0 ? '+' : '-'
  const absOffset = Math.abs(Math.floor(offset))
  const tzLine = `AMS GMT ${sign}${absOffset}`

  const timeLineLength = timeBase.length + 1 + 2  // HH:MM + ':' + SS
  const tzDelay = labelDuration + timeLineLength * CHAR_STAGGER + LINE_GAP

  return (
    <>
      <PhysicsCanvas />
      <span className="label" style={{ color: theme.onSurface }}>
        <AnimatedLine text={labelText} startDelay={0} />
      </span>
      <div className="clock" style={{ color: theme.onSurface }}>
        {timeBase && (
          <>
            <ClockTimeLine text={timeBase} seconds={seconds} startDelay={labelDuration} />
            <AnimatedLine text={tzLine} startDelay={tzDelay} />
          </>
        )}
      </div>
    </>
  )
}

export default App
