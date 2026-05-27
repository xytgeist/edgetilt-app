import { useState, useRef, useEffect } from 'react'

const CHEVRON = (
  <svg viewBox="0 0 20 20" className="h-5 w-5 shrink-0" fill="currentColor" aria-hidden>
    <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 0 1 1.06.02L10 11.168l3.71-3.936a.75.75 0 1 1 1.08 1.04l-4.24 4.5a.75.75 0 0 1-1.08 0l-4.24-4.5a.75.75 0 0 1 .02-1.06Z" clipRule="evenodd" />
  </svg>
)

const CHECK = (
  <svg viewBox="0 0 20 20" className="h-4 w-4 shrink-0" fill="currentColor" aria-hidden>
    <path fillRule="evenodd" d="M16.704 4.153a.75.75 0 0 1 .143 1.052l-8 10.5a.75.75 0 0 1-1.127.075l-4.5-4.5a.75.75 0 0 1 1.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 0 1 1.05-.143Z" clipRule="evenodd" />
  </svg>
)

const SIZE = {
  sm: 'h-10 px-3 text-base font-semibold',
  md: 'h-12 px-4 text-lg font-bold',
  lg: 'h-14 px-4 text-2xl font-bold',
}

/**
 * @param {{
 *   value: any,
 *   onChange: (v: any) => void,
 *   options: Array<{ value: any, label: string }>,
 *   accentClass?: string,
 *   size?: 'sm'|'md'|'lg',
 *   className?: string,
 * }} props
 */
export function DropdownSelect({
  value,
  onChange,
  options,
  accentClass = 'text-orange-400',
  size = 'md',
  className = '',
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', close, true)
    return () => document.removeEventListener('pointerdown', close, true)
  }, [open])

  const selected = options.find((o) => o.value === value)

  return (
    <div ref={ref} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex w-full items-center justify-between gap-2 rounded-2xl border border-gray-700 bg-gray-800 text-white transition-colors touch-manipulation ${SIZE[size]}`}
      >
        <span className="min-w-0 flex-1 truncate text-center">{selected?.label ?? String(value)}</span>
        <span className={`shrink-0 text-gray-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}>
          {CHEVRON}
        </span>
      </button>

      {open && (
        <div className="absolute left-0 right-0 top-[calc(100%+6px)] z-[60] overflow-hidden rounded-2xl border border-gray-700 bg-gray-800 shadow-[0_8px_32px_rgba(0,0,0,0.45)]">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => { onChange(opt.value); setOpen(false) }}
              className={`flex w-full items-center justify-between px-4 py-3 text-base font-semibold transition-colors hover:bg-gray-700 touch-manipulation ${
                opt.value === value ? accentClass : 'text-white'
              }`}
            >
              <span>{opt.label}</span>
              {opt.value === value && CHECK}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
