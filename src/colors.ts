import { Hct, hexFromArgb } from '@material/material-color-utilities'

// --- Primitives ---
// All neutral (chroma 0). Tone 0 = black, 100 = white.

function argb(tone: number): number {
  return Hct.from(0, 0, tone).toInt()
}

function hex(tone: number): string {
  return hexFromArgb(argb(tone))
}

function rgba(tone: number, alpha: number): string {
  const v = argb(tone)
  const r = (v >> 16) & 0xff
  const g = (v >> 8) & 0xff
  const b = v & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}

export const primitives = {
  neutral0:   hex(0),
  neutral6:   hex(6),
  neutral10:  hex(10),
  neutral20:  hex(20),
  neutral80:  hex(80),
  neutral90:  hex(90),
  neutral94:  hex(94),
  neutral98:  hex(98),
  neutral100: hex(100),
} as const

// --- Tokens ---

export interface Theme {
  background: string
  letter: string
  trail: string   // background color at low opacity for motion trail
}

export const dark: Theme = {
  background: primitives.neutral6,
  letter:     primitives.neutral90,
  trail:      rgba(6, 0.05),
}

export const light: Theme = {
  background: primitives.neutral98,
  letter:     primitives.neutral10,
  trail:      rgba(98, 0.05),
}

// --- System helpers ---

export type Mode = 'dark' | 'light'

export function systemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function themeFor(mode: Mode): Theme {
  return mode === 'dark' ? dark : light
}
