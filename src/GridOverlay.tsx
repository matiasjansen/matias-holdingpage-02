import { useEffect, useState } from 'react'
import { breakpoints } from './colors'

const GAP = 16
const LINE = 'rgba(255, 110, 30, 0.66)'

function columnCountFor(width: number): number {
  if (width >= breakpoints.lg) return 12
  if (width >= breakpoints.md) return 8
  return 4
}

export function GridOverlay({ mode }: { mode: 'columns' | 'modular' }) {
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

  const columns = columnCountFor(width)
  const rowCount = Math.max(1, Math.round(columns * height / width))

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, pointerEvents: 'none' }}>
      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${columns}, 1fr)`, gap: `${GAP}px`, height: '100%', padding: `0 ${GAP}px` }}>
        {Array.from({ length: columns }).map((_, i) => (
          <div key={i} style={{ borderLeft: `1px solid ${LINE}`, borderRight: `1px solid ${LINE}`, background: 'transparent', display: 'flex', justifyContent: 'flex-end', alignItems: 'flex-start' }}>
            <span style={{ fontSize: '10px', fontFamily: 'monospace', color: LINE, padding: '4px', paddingTop: `${GAP + 4}px`, paddingRight: '4px', letterSpacing: '0.05em', display: 'inline-block' }}>
              COL {i + 1}
            </span>
          </div>
        ))}
      </div>
      {mode === 'modular' && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', gap: `${GAP}px`, padding: `${GAP}px 0`, height: '100%' }}>
          {Array.from({ length: rowCount }).map((_, i) => (
            <div key={i} style={{ flex: 1, borderTop: `1px solid ${LINE}`, borderBottom: `1px solid ${LINE}`, background: 'transparent', display: 'flex', alignItems: 'flex-end' }}>
              <span style={{ fontSize: '10px', fontFamily: 'monospace', color: LINE, padding: '4px', paddingLeft: `${GAP + 4}px`, letterSpacing: '0.05em', display: 'inline-block' }}>
                ROW {i + 1}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
