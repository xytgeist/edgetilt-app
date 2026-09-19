function UsFlag() {
  return (
    <svg viewBox="0 0 16 12" className="h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px]" aria-hidden>
      <rect width="16" height="12" fill="#bf0a30" />
      <g fill="#fff">
        <rect y="1.85" width="16" height="0.92" />
        <rect y="3.69" width="16" height="0.92" />
        <rect y="5.54" width="16" height="0.92" />
        <rect y="7.38" width="16" height="0.92" />
        <rect y="9.23" width="16" height="0.92" />
      </g>
      <rect width="7" height="6.46" fill="#002868" />
    </svg>
  )
}

function CanadaFlag() {
  return (
    <svg viewBox="0 0 16 12" className="h-3.5 w-5 shrink-0 overflow-hidden rounded-[2px]" aria-hidden>
      <rect width="16" height="12" fill="#fff" />
      <rect width="4" height="12" fill="#d80621" />
      <rect x="12" width="4" height="12" fill="#d80621" />
      <path
        fill="#d80621"
        d="M8 2.3 8.55 4.05 10.1 3.5 9.45 4.95 11.1 5.25 9.55 6 10.35 7.35 8.55 6.55 8.75 8.4 8 7.05 7.25 8.4 7.45 6.55 5.65 7.35 6.45 6 4.9 5.25 6.55 4.95 5.9 3.5 7.45 4.05z"
      />
    </svg>
  )
}

/**
 * US / Canada only. Both dial +1. The menu is the country, not a second number format.
 */
export default function PhoneCountryField({
  id,
  value,
  onChange,
  country = 'US',
  onCountryChange,
  tone = 'auth',
  placeholder = 'Phone number',
  enterKeyHint = 'done',
  onKeyDown,
  required = false,
}) {
  const countryId = country === 'CA' ? 'CA' : 'US'
  const shell =
    tone === 'account'
      ? 'mt-1.5 min-h-11 w-full rounded-xl border border-zinc-700/90 bg-zinc-900/80 text-[15px] focus-within:border-cyan-500/50'
      : 'min-h-12 w-full rounded-2xl bg-zinc-800 text-base focus-within:ring-2 focus-within:ring-orange-500/50'

  return (
    <div data-phone-country={tone} className={`flex items-center ${shell}`}>
      <div className="relative flex shrink-0 items-center gap-1 pl-3 pr-1">
        {countryId === 'CA' ? <CanadaFlag /> : <UsFlag />}
        <span className="font-medium text-zinc-100">+1</span>
        <svg viewBox="0 0 12 12" className="h-3 w-3 text-zinc-400" aria-hidden>
          <path
            d="M2.5 4.5 6 8l3.5-3.5"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <select
          aria-label="Country code"
          value={countryId}
          onChange={(e) => onCountryChange?.(e.target.value === 'CA' ? 'CA' : 'US')}
          className="absolute inset-0 cursor-pointer opacity-0"
        >
          <option value="US">United States (+1)</option>
          <option value="CA">Canada (+1)</option>
        </select>
      </div>
      <input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder={placeholder}
        enterKeyHint={enterKeyHint}
        value={value}
        onKeyDown={onKeyDown}
        onChange={onChange}
        required={required}
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        className="min-w-0 flex-1 bg-transparent py-3 pr-3 text-[length:inherit] text-zinc-100 outline-none placeholder:text-zinc-500"
      />
    </div>
  )
}
