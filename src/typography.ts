// --- Primitives ---

export const primitives = {
  fontSans: '-apple-system, "SF Pro Display", sans-serif',
  fontMono: 'ui-monospace, "SF Mono", monospace',
  sizeXs: 12,
  sizeSm: 14,
  sizeMd: 16,
  sizeLg: 24,
  sizeXl: 32,
} as const

// --- Tokens ---

export interface TypographyStyle {
  fontFamily: string
  fontSize: number
}

export const typography = {
  clock: {
    fontFamily: primitives.fontSans,
    fontSize: primitives.sizeLg,
  },
  label: {
    fontFamily: primitives.fontSans,
    fontSize: primitives.sizeLg,
  },
} as const
