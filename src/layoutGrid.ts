import { useEffect, useState } from 'react'
import { breakpoints } from './colors'

export const GRID_GAP = 16

export function columnCountFor(width: number): number {
  if (width >= breakpoints.lg) return 12
  if (width >= breakpoints.md) return 8
  return 4
}

export function rowCountFor(width: number, height: number): number {
  const columns = columnCountFor(width)
  const base = Math.round(columns * height / width)
  // Mobile: 2 fewer rows (taller cells, fewer vertical breakpoints as height shrinks)
  return Math.max(1, columns === 4 ? base - 2 : base)
}

function colWidthPx(width: number): number {
  const columns = columnCountFor(width)
  return (width - GRID_GAP * (columns + 1)) / columns
}

function rowHeightPx(width: number, height: number): number {
  const rows = rowCountFor(width, height)
  return (height - GRID_GAP * (rows + 1)) / rows
}

// Left edge of a 1-indexed column
export function colLeft(col: number, width: number): number {
  return GRID_GAP + (col - 1) * (colWidthPx(width) + GRID_GAP)
}

// Right edge of a 1-indexed column
export function colRight(col: number, width: number): number {
  return colLeft(col, width) + colWidthPx(width)
}

// Top edge of a 1-indexed row, clamped to the current row count
export function rowTop(row: number, width: number, height: number): number {
  const rows = rowCountFor(width, height)
  const clamped = Math.min(row, rows)
  return GRID_GAP + (clamped - 1) * (rowHeightPx(width, height) + GRID_GAP)
}

// Bottom edge of a 1-indexed row, clamped to the current row count
export function rowBottom(row: number, width: number, height: number): number {
  const rows = rowCountFor(width, height)
  const clamped = Math.min(row, rows)
  return rowTop(clamped, width, height) + rowHeightPx(width, height)
}

// Which 1-indexed row contains a given y coordinate
export function rowAt(y: number, width: number, height: number): number {
  const rows = rowCountFor(width, height)
  for (let row = 1; row <= rows; row++) {
    if (y <= rowBottom(row, width, height)) return row
  }
  return rows
}

export function useViewportSize() {
  const [width, setWidth] = useState(window.innerWidth)
  const [height, setHeight] = useState(window.innerHeight)

  useEffect(() => {
    const onResize = () => {
      setWidth(window.innerWidth)
      setHeight(window.innerHeight)
    }
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return { width, height }
}
