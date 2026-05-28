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

  if (key === '.') {
    if (current.includes('.')) return current
    if (current === '' || current === '-') return current + '0.'
    return current + '.'
  }

  // Digit
  if (current === '0') return key
  if (current === '-0') return '-' + key
  return current + key
}

const MAIN_ROWS = [
  ['7', '8', '9'],
  ['4', '5', '6'],
  ['1', '2', '3'],
  ['−', '0', '⌫'],
]

// Dark palette
const DARK = {
  bg:        '#1c1c1e',
  border:    '#3a3a3c',
  keyNum:    '#2c2c2e',
  keyFn:     '#3a3a3c',
  keyShadow: 'rgba(0,0,0,0.55)',
  textKey:   '#ffffff',
  textMuted: '#8e8e93',
  cyan:      '#0891b2',
}

// Light palette — gray bg, white keys, black text
const LIGHT = {
  bg:        '#adb5bd',
  border:    '#9ea7b0',
  keyNum:    '#ffffff',
  keyFn:     '#adb5bd',
  keyShadow: 'rgba(0,0,0,0.25)',
  textKey:   '#000000',
  textMuted: '#555e68',
  cyan:      '#0891b2',
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

  const press = key => {
    if (key === 'Done') { onClose(); return }
    onChange(applyKey(value, key, allowNegative))
  }

  const num = parseFloat(value)
  const hasValue = value !== '' && value !== '-'
  const previewColor = !hasValue ? C.textMuted : num < 0 ? '#f87171' : '#34d399'
  const previewText = hasValue
    ? (num < 0 ? '−$' + Math.abs(num) : '+$' + value)
    : value === '-' ? '−$…' : '$—'

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
        {/* Preview bar */}
        <div style={{
          borderTop: `1px solid ${C.border}`,
          padding: '10px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          backgroundColor: C.bg,
        }}>
          <span style={{ color: C.textMuted, fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 1 }}>
            Amount
          </span>
          <span style={{ color: previewColor, fontSize: 22, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
            {previewText}
          </span>
        </div>

        {/* Key grid */}
        <div style={{ padding: 6, backgroundColor: C.bg }}>
          {/* Main 4 rows */}
          {MAIN_ROWS.map((row, ri) => (
            <div key={ri} style={{ display: 'flex', gap: 6, marginBottom: 6 }}>
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

          {/* Bottom row: . | space | Done */}
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onPointerDown={e => { e.preventDefault(); press('.') }}
              style={{
                ...keyBase,
                flex: 1,
                height: 54,
                backgroundColor: C.keyFn,
                color: C.textKey,
                fontSize: 28,
                fontWeight: 400,
                boxShadow: `0 2px 0 ${C.keyShadow}`,
              }}
            >.</button>

            {/* Space bar — inert, visual balance only */}
            <div style={{
              flex: 1,
              height: 54,
              borderRadius: 10,
              backgroundColor: C.keyNum,
              boxShadow: `0 2px 0 ${C.keyShadow}`,
            }} />

            <button
              onPointerDown={e => { e.preventDefault(); press('Done') }}
              style={{
                ...keyBase,
                flex: 1,
                height: 54,
                backgroundColor: C.cyan,
                color: '#ffffff',
                fontSize: 17,
                fontWeight: 700,
                letterSpacing: 0.3,
                boxShadow: `0 2px 0 rgba(0,0,0,0.4)`,
              }}
            >Done</button>
          </div>
        </div>

        {/* iOS safe-area spacer */}
        <div style={{ backgroundColor: C.bg, paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>,
    document.body,
  )
}
