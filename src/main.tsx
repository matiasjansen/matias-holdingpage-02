import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { dark, light } from './colors'

// Set surface colors as CSS variables before first paint to avoid flash
document.documentElement.style.setProperty('--surface-dark', dark.surface)
document.documentElement.style.setProperty('--surface-light', light.surface)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
