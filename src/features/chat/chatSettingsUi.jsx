/** Shared settings section chrome for DM / group chat info sheets. */

export function SectionLabel({ children }) {
  return (
    <p className="mx-4 mb-2 mt-5 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">
      {children}
    </p>
  )
}

export function SettingsGroup({ children }) {
  return (
    <div className="mx-4 overflow-hidden rounded-2xl bg-zinc-900/60" data-chat-settings-group>
      {children}
    </div>
  )
}

/**
 * @param {{
 *   label: string,
 *   hint?: string,
 *   enabled: boolean,
 *   busy?: boolean,
 *   onToggle: () => void,
 * }} props
 */
export function SettingsToggleRow({ label, hint, enabled, busy = false, onToggle }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-800/50 px-4 py-3.5 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="text-[14px] font-medium text-zinc-100">{label}</div>
        {hint ? (
          <p className="mt-0.5 text-[12px] leading-snug text-zinc-500">{hint}</p>
        ) : null}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={onToggle}
        className={`relative shrink-0 overflow-hidden rounded-full p-0.5 transition-colors touch-manipulation disabled:opacity-50 ${
          enabled ? 'bg-cyan-500' : 'bg-zinc-600'
        }`}
        style={{ width: '3rem', height: '1.75rem' }}
      >
        <span
          aria-hidden
          className={`block h-6 w-6 rounded-full bg-white shadow transition-transform duration-200 ease-out ${
            enabled ? 'translate-x-5' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  )
}
