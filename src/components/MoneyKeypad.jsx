import { useEffect } from 'react'
import { createPortal } from 'react-dom'

function applyKey(current, key, allowNegative) {
  if (key === '⌫') return current.slice(0, -1)

  if (key === '−') {
    if (!allowNegative) return current
    if (current === '') return '-'
    if (current === '-') return ''
    return current.startsWith('-') ? current.slice(1) : '-' + current
  }

  // Digit
  if (current === '0') return key
  if (current === '-0') return '-' + key
  return current + key
}

const ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['−', '0', '⌫'],
]

const DARK = {
  bg:        '#1c1c1e',
  border:    '#3a3a3c',
  keyNum:    '#2c2c2e',
  keyFn:     '#3a3a3c',
  keyShadow: 'rgba(0,0,0,0.55)',
  textKey:   '#ffffff',
  textMuted: '#8e8e93',
}

const LIGHT = {
  bg:        '#adb5bd',
  border:    '#9ea7b0',
  keyNum:    '#ffffff',
  keyFn:     '#adb5bd',
  keyShadow: 'rgba(0,0,0,0.25)',
  textKey:   '#000000',
  textMuted: '#555e68',
}

const keyBase = {
  border: 'none',
  borderRadius: 10,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  WebkitTapHighlightColor: 'transparent',
  userSelect: 'none',
  cursor: 'pointer',
}

export default function MoneyKeypad({ value, onChange, onClose, allowNegative = false }) {
  const isLight = document.documentElement.classList.contains('light')
  const C = isLight ? LIGHT : DARK

  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const press = key => onChange(applyKey(value, key, allowNegative))

  return createPortal(
    <>
      {/* Backdrop */}
      <div style={{ position: 'fixed', inset: 0, zIndex: 200 }} onPointerDown={onClose} />

      {/* Panel */}
      <div
        data-money-keypad
        style={{ position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 201, backgroundColor: C.bg }}
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Top bar: Cancel | Done */}
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: '8px 12px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: C.bg,
        }}>
          <button
            onPointerDown={e => { e.preventDefault(); onClose() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: C.textMuted, fontSize: 16, fontWeight: 500,
              padding: '4px 8px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Cancel
          </button>
          <button
            onPointerDown={e => { e.preventDefault(); onClose() }}
            style={{
              background: 'none', border: 'none', cursor: 'pointer',
              color: '#0891b2', fontSize: 16, fontWeight: 700,
              padding: '4px 8px',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Done
          </button>
        </div>

        {/* Keys */}
        <div style={{ padding: 6, backgroundColor: C.bg }}>
          {ROWS.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: ri < ROWS.length - 1 ? 6 : 0 }}>
              {row.map(key => {
                const isFn = key === '−' || key === '⌫'
                const disabled = key === '−' && !allowNegative
                return (
                  <button
                    key={key}
                    onPointerDown={e => { e.preventDefault(); if (!disabled) press(key) }}
                    style={{
                      ...keyBase,
                      flex: 1,
                      height: 54,
                      backgroundColor: isFn ? C.keyFn : C.keyNum,
                      color: disabled ? C.textMuted : C.textKey,
                      fontSize: key === '⌫' ? 22 : 28,
                      fontWeight: isFn ? 500 : 300,
                      boxShadow: `0 2px 0 ${C.keyShadow}`,
                      opacity: disabled ? 0.35 : 1,
                    }}
                  >
                    {key}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* iOS safe-area spacer */}
        <div style={{ backgroundColor: C.bg, paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>,
    document.body,
  )
}
