import { typographyPrimitives, breakpoints } from './colors'

export const letterSizeByBreakpoint = {
  [breakpoints.xs]: typographyPrimitives.fontSize96,
  [breakpoints.sm]: typographyPrimitives.fontSize128,
  [breakpoints.md]: typographyPrimitives.fontSize160,
  [breakpoints.lg]: typographyPrimitives.fontSize224,
  [breakpoints.xl]: typographyPrimitives.fontSize288,
  [breakpoints['2xl']]: typographyPrimitives.fontSize320,
  [breakpoints['3xl']]: typographyPrimitives.fontSize320,
} as const

export function getLetterSize(windowWidth: number): string {
  if (windowWidth < breakpoints.sm) return letterSizeByBreakpoint[breakpoints.xs]
  if (windowWidth < breakpoints.md) return letterSizeByBreakpoint[breakpoints.sm]
  if (windowWidth < breakpoints.lg) return letterSizeByBreakpoint[breakpoints.md]
  if (windowWidth < breakpoints.xl) return letterSizeByBreakpoint[breakpoints.lg]
  if (windowWidth < breakpoints['2xl']) return letterSizeByBreakpoint[breakpoints.xl]
  if (windowWidth < breakpoints['3xl']) return letterSizeByBreakpoint[breakpoints['2xl']]
  return letterSizeByBreakpoint[breakpoints['3xl']]
}
