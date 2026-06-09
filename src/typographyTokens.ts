import { typographyPrimitives } from './colors'

export interface TypographyToken {
  fontSize: string
  lineHeight: string
}

export const typographyTokens = {
  // Display
  display: {
    fontSize: typographyPrimitives.fontSize32,
    lineHeight: typographyPrimitives.lineHeight40,
  },

  // Headline
  headline: {
    fontSize: typographyPrimitives.fontSize28,
    lineHeight: typographyPrimitives.lineHeight36,
  },

  // Title
  title: {
    fontSize: typographyPrimitives.fontSize24,
    lineHeight: typographyPrimitives.lineHeight32,
  },

  // Body
  body: {
    fontSize: typographyPrimitives.fontSize16,
    lineHeight: typographyPrimitives.lineHeight24,
  },

  // Label
  label: {
    fontSize: typographyPrimitives.fontSize14,
    lineHeight: typographyPrimitives.lineHeight20,
  },

  // Caption
  caption: {
    fontSize: typographyPrimitives.fontSize12,
    lineHeight: typographyPrimitives.lineHeight16,
  },

  // Large Display sizes
  displayLarge: {
    fontSize: typographyPrimitives.fontSize48,
    lineHeight: typographyPrimitives.lineHeight56,
  },

  displayXL: {
    fontSize: typographyPrimitives.fontSize64,
    lineHeight: typographyPrimitives.lineHeight80,
  },

  displayXXL: {
    fontSize: typographyPrimitives.fontSize80,
    lineHeight: typographyPrimitives.lineHeight104,
  },

  displayHero: {
    fontSize: typographyPrimitives.fontSize256,
    lineHeight: typographyPrimitives.lineHeight256,
  },

  displayHeroMax: {
    fontSize: typographyPrimitives.fontSize320,
    lineHeight: typographyPrimitives.lineHeight312,
  },
} as const
