import { useEffect } from 'react'
import { createPortal } from 'react-dom'

const KEYS = [
  '7', '8', '9',
  '4', '5', '6',
  '1', '2', '3',
  '−', '0', '⌫',
  '.', null, 'Done',
]

function applyKey(current, key, allowNegative) {
  if (key === '⌫') return current.slice(0, -1)

  if (key === '−') {
    if (!allowNegative) return current
    if (current === '' || current === '-') return current
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

export default function MoneyKeypad({ value, onChange, onClose, allowNegative = false }) {
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [onClose])

  const press = key => {
    if (key === 'Done') { onClose(); return }
    onChange(applyKey(value, key, allowNegative))
  }

  return createPortal(
    <>
      {/* Invisible backdrop — tap anywhere above keypad to dismiss */}
      <div className="fixed inset-0 z-[200]" onPointerDown={onClose} />

      {/* Keypad panel */}
      <div
        data-money-keypad
        className="fixed bottom-0 left-0 right-0 z-[201] select-none"
        onPointerDown={e => e.stopPropagation()}
      >
        {/* Value preview bar */}
        <div className="bg-zinc-800 border-t border-zinc-700/60 px-5 py-2.5 flex items-center justify-between">
          <span className="text-zinc-400 text-xs font-semibold uppercase tracking-wide">Amount</span>
          <span className={`text-lg font-black tabular-nums ${
            value && value !== '-'
              ? parseFloat(value) < 0 ? 'text-red-300' : 'text-emerald-300'
              : 'text-zinc-500'
          }`}>
            {value ? (parseFloat(value) >= 0 && value !== '-' ? '+' : '') + '$' + value.replace('-', '') : '$0'}
          </span>
        </div>

        {/* Keys grid */}
        <div className="grid grid-cols-3 bg-zinc-950 border-t border-zinc-800">
          {KEYS.map((key, i) => {
            if (key === null) return <div key={i} className="bg-zinc-950" />

            const isDone = key === 'Done'
            const isBack = key === '⌫'
            const isMinus = key === '−'
            const isSpecial = isDone || isBack || isMinus || key === '.'

            return (
              <button
                key={i}
                onPointerDown={e => { e.preventDefault(); press(key) }}
                disabled={isMinus && !allowNegative}
                className={[
                  'h-[60px] flex items-center justify-center text-xl font-semibold',
                  'border-b border-r border-zinc-800/60 touch-manipulation',
                  'transition-colors active:brightness-75',
                  isDone
                    ? 'bg-cyan-600 text-white font-bold text-base'
                    : isBack || isMinus
                    ? 'bg-zinc-900 text-zinc-300'
                    : key === '.'
                    ? 'bg-zinc-900 text-zinc-300'
                    : 'bg-zinc-950 text-white',
                  isMinus && !allowNegative ? 'opacity-20 cursor-default' : '',
                ].join(' ')}
              >
                {key}
              </button>
            )
          })}
        </div>

        {/* iOS safe area spacer */}
        <div className="bg-zinc-950 pb-safe-bottom" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }} />
      </div>
    </>,
    document.body,
  )
}
