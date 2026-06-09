import { Hct, hexFromArgb } from '@material/material-color-utilities'

// --- Primitives ---
// All neutral (chroma 0). Tone 0 = black, 100 = white.

function argb(tone: number): number {
  return Hct.from(0, 0, tone).toInt()
}

function hex(tone: number): string {
  return hexFromArgb(argb(tone))
}

function rgbaHct(hue: number, chroma: number, tone: number, alpha: number): string {
  const v = Hct.from(hue, chroma, tone).toInt()
  const r = (v >> 16) & 0xff
  const g = (v >> 8) & 0xff
  const b = v & 0xff
  return `rgba(${r},${g},${b},${alpha})`
}

function hct(hue: number, chroma: number, tone: number): string {
  return hexFromArgb(Hct.from(hue, chroma, tone).toInt())
}

export const primitives = {
  // neutral (chroma 0)
  neutral0:   hex(0),
  neutral6:   hex(6),
  neutral10:  hex(10),
  neutral20:  hex(20),
  neutral80:  hex(80),
  neutral90:  hex(90),
  neutral94:  hex(94),
  neutral98:  hex(98),
  neutral100: hex(100),

  // neutral-purple (H=275, C=12 — tinted neutral, Material Design neutral-variant)
  neutralPurple0:   hct(275, 5, 0),
  neutralPurple5:   hct(275, 5, 5),
  neutralPurple6:   hct(275, 5, 6),
  neutralPurple10:  hct(275, 5, 10),
  neutralPurple15:  hct(275, 5, 15),
  neutralPurple20:  hct(275, 5, 20),
  neutralPurple25:  hct(275, 5, 25),
  neutralPurple30:  hct(275, 5, 30),
  neutralPurple35:  hct(275, 5, 35),
  neutralPurple40:  hct(275, 5, 40),
  neutralPurple45:  hct(275, 5, 45),
  neutralPurple50:  hct(275, 5, 50),
  neutralPurple55:  hct(275, 5, 55),
  neutralPurple60:  hct(275, 5, 60),
  neutralPurple65:  hct(275, 5, 65),
  neutralPurple70:  hct(275, 5, 70),
  neutralPurple75:  hct(275, 5, 75),
  neutralPurple80:  hct(275, 5, 80),
  neutralPurple85:  hct(275, 5, 85),
  neutralPurple90:  hct(275, 5, 90),
  neutralPurple95:  hct(275, 5, 95),
  neutralPurple97:  hct(275, 5, 97),
  neutralPurple100: hct(275, 5, 100),

} as const

// --- Typography Primitives ---
export const typographyPrimitives = {
  // Small sizes
  fontSize12: '12px',
  fontSize14: '14px',
  fontSize16: '16px',
  fontSize20: '20px',
  fontSize24: '24px',
  fontSize28: '28px',
  fontSize32: '32px',

  // Display sizes
  fontSize48: '48px',
  fontSize64: '64px',
  fontSize80: '80px',
  fontSize96: '96px',
  fontSize128: '128px',
  fontSize160: '160px',
  fontSize192: '192px',
  fontSize224: '224px',
  fontSize256: '256px',
  fontSize288: '288px',
  fontSize320: '320px',

  lineHeight16: '16px',
  lineHeight20: '20px',
  lineHeight24: '24px',
  lineHeight28: '28px',
  lineHeight32: '32px',
  lineHeight36: '36px',
  lineHeight40: '40px',
  lineHeight56: '56px',
  lineHeight80: '80px',
  lineHeight104: '104px',
  lineHeight128: '128px',
  lineHeight152: '152px',
  lineHeight176: '176px',
  lineHeight200: '200px',
  lineHeight224: '224px',
  lineHeight256: '256px',
  lineHeight280: '280px',
  lineHeight312: '312px',
} as const

// --- Breakpoints ---
export const breakpoints = {
  xs: 0,
  sm: 480,
  md: 640,
  lg: 1024,
  xl: 1440,
  '2xl': 1920,
  '3xl': 2560,
} as const

export type Breakpoint = keyof typeof breakpoints

// --- Tokens ---

export interface Theme {
  surface:   string
  onSurface: string
  trail: string   // surface color at low opacity for motion trail
}

export const dark: Theme = {
  surface:   primitives.neutralPurple5,
  onSurface: primitives.neutralPurple97,
  trail:     rgbaHct(275, 12, 5, 0.12),
}

export const light: Theme = {
  surface:   primitives.neutralPurple97,
  onSurface: primitives.neutralPurple5,
  trail:     rgbaHct(275, 12, 97, 0.12),
}

// --- System helpers ---

export type Mode = 'dark' | 'light'

export function systemMode(): Mode {
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function themeFor(mode: Mode): Theme {
  return mode === 'dark' ? dark : light
}
