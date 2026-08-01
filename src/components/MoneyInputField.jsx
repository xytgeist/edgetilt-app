import InField, { INFIELD_CONTROL } from './InField.jsx'
import { formatMoneyInputValue } from '../utils/moneyInputFormat.js'

/**
 * Prefixed $ money input with thousands separators while typing.
 */
export default function MoneyInputField({
  value,
  onChange,
  placeholder,
  label,
  allowNegative = false,
  className = '',
  inputClassName = '',
  focusRingClass = 'focus:ring-2 focus:ring-cyan-500/40',
  inFieldFocusRingClass = '',
  compact = false,
  hidePrefix = false,
  autoFocus,
  'aria-label': ariaLabel,
}) {
  const inField = Boolean(label)
  const resolvedAriaLabel = ariaLabel || label || undefined

  const baseInput = inField
    ? INFIELD_CONTROL
    : compact
      ? 'min-h-9 rounded-xl bg-zinc-800 text-sm text-white outline-none'
      : 'min-h-12 rounded-2xl bg-zinc-800 font-semibold text-white outline-none'

  const padding = hidePrefix
    ? inField
      ? 'pl-0 pr-0'
      : compact
        ? 'px-3'
        : 'px-4'
    : inField
      ? 'pl-4 pr-0'
      : compact
        ? 'pl-7 pr-3'
        : 'pl-8 pr-4'

  const prefixClass = inField
    ? 'pointer-events-none absolute left-0 top-1/2 -translate-y-1/2 font-semibold text-zinc-400'
    : `pointer-events-none absolute top-1/2 -translate-y-1/2 font-semibold text-zinc-400 ${
        compact ? 'left-3 text-sm' : 'left-4'
      }`

  const input = (
    <div className="relative">
      {!hidePrefix ? <span className={prefixClass}>$</span> : null}
      <input
        type="text"
        inputMode={allowNegative ? 'text' : 'decimal'}
        value={value}
        onChange={(e) => onChange(formatMoneyInputValue(e.target.value, { allowNegative }))}
        placeholder={placeholder}
        autoFocus={autoFocus}
        aria-label={resolvedAriaLabel}
        className={`w-full ${baseInput} ${padding} ${
          inField ? '' : focusRingClass
        } ${inputClassName}`}
      />
    </div>
  )

  if (label) {
    return (
      <InField label={label} className={className} focusRingClass={inFieldFocusRingClass}>
        {input}
      </InField>
    )
  }

  return <div className={`relative ${className}`}>{input}</div>
}
