import { PhysicsCanvas } from './PhysicsCanvas'
import { systemMode, themeFor } from './colors'
import { useEffect, useState } from 'react'

function App() {
  const [time, setTime] = useState('')
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
      const offset = -now.getTimezoneOffset() / 60
      const sign = offset >= 0 ? '+' : '-'
      const absOffset = Math.abs(Math.floor(offset))
      setTime(`${day}, ${month} ${date} ${h}:${m}:${s}\nAMS GMT ${sign}${absOffset}`)
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

  return (
    <>
      <PhysicsCanvas />
      <div className="clock" style={{ color: theme.onSurface }}>{time}</div>
      <span className="label" style={{ color: theme.onSurface }}>
        Matias Jansen, Designer
      </span>
    </>
  )
}

export default App
