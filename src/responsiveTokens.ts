import { typographyPrimitives, breakpoints } from './colors'

export const letterSizeByBreakpoint = {
  [breakpoints.xs]: typographyPrimitives.fontSize128,
  [breakpoints.sm]: typographyPrimitives.fontSize160,
  [breakpoints.md]: typographyPrimitives.fontSize224,
  [breakpoints.lg]: typographyPrimitives.fontSize288,
  [breakpoints.xl]: typographyPrimitives.fontSize320,
  [breakpoints['2xl']]: typographyPrimitives.fontSize340,
  [breakpoints['3xl']]: typographyPrimitives.fontSize360,
} as const

export function getFlagCols(windowWidth: number): number {
  if (windowWidth < breakpoints.sm)    return 8
  if (windowWidth < breakpoints.md)    return 10
  if (windowWidth < breakpoints.lg)    return 14
  if (windowWidth < breakpoints.xl)    return 18
  if (windowWidth < breakpoints['2xl']) return 24
  if (windowWidth < breakpoints['3xl']) return 30
  return 30
}

export function getLetterSize(windowWidth: number): string {
  if (windowWidth < breakpoints.sm) return letterSizeByBreakpoint[breakpoints.xs]
  if (windowWidth < breakpoints.md) return letterSizeByBreakpoint[breakpoints.sm]
  if (windowWidth < breakpoints.lg) return letterSizeByBreakpoint[breakpoints.md]
  if (windowWidth < breakpoints.xl) return letterSizeByBreakpoint[breakpoints.lg]
  if (windowWidth < breakpoints['2xl']) return letterSizeByBreakpoint[breakpoints.xl]
  if (windowWidth < breakpoints['3xl']) return letterSizeByBreakpoint[breakpoints['2xl']]
  return letterSizeByBreakpoint[breakpoints['3xl']]
}
