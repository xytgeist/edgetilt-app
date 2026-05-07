import { forwardRef } from 'react'

const DateTimeInput = forwardRef(({ value, onClick, placeholder, align = 'left', grouped = false, active = false }, ref) => {
  const display = value || ''
  const alignCls = align === 'right' ? 'text-right' : 'text-left'
  const boxed = grouped
    ? `h-12 min-h-12 rounded-none bg-transparent text-[16px] text-zinc-100 outline-none focus-visible:ring-0 flex items-center ${
        align === 'right' ? 'justify-end text-right pr-0' : 'justify-start text-left px-2'
      }`
    : 'h-12 rounded-2xl bg-zinc-800 text-zinc-100 text-left px-3 outline-none focus:ring-2 focus:ring-violet-500/30 flex items-center justify-start text-[16px]'

  const timeMatch = display.match(/(\d{1,2}:\d{2}\s*[AP]M)$/i)
  const datePart = timeMatch ? display.replace(timeMatch[0], '').trim() : display
  const timePart = timeMatch ? timeMatch[0].trim() : ''

  const pillOn = active ? 'bg-zinc-600/60 text-red-400' : 'bg-zinc-600/60 text-white'
  const pillOff = active ? 'bg-zinc-600/45 text-red-300/80' : 'bg-zinc-600/45 text-white'
  return (
    <button ref={ref} type="button" onClick={onClick} className={`w-full touch-manipulation ${boxed}`}>
      {grouped && align === 'right' ? (
        display ? (
          timePart ? (
            <span className="inline-flex items-center gap-2">
              <span className={`inline-flex items-center rounded-full px-3 py-1 ${pillOn}`}>{datePart}</span>
              <span className={`inline-flex items-center rounded-full px-3 py-1 ${pillOn}`}>{timePart}</span>
            </span>
          ) : (
            <span className={`inline-flex items-center rounded-full px-3 py-1 ${pillOn}`}>{display}</span>
          )
        ) : (
          <span className={`inline-flex items-center rounded-full px-3 py-1 ${pillOff}`}>{placeholder}</span>
        )
      ) : display ? (
        <span>{display}</span>
      ) : (
        <span className={`text-zinc-500 ${alignCls}`}>{placeholder}</span>
      )}
    </button>
  )
})

DateTimeInput.displayName = 'DateTimeInput'

export default DateTimeInput
