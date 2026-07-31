import { EDGE_MONITOR_SECTIONS } from './opsMonitorNavigation.js'

/**
 * @param {{
 *   section: string,
 *   onSectionChange: (id: string) => void,
 *   badges?: Record<string, number>,
 * }} props
 */
export default function EdgeMonitorSectionNav({ section, onSectionChange, badges = {} }) {
  return (
    <nav className="edge-monitor-section-nav mb-4 rounded-2xl border border-zinc-800 bg-zinc-900/95 p-2 backdrop-blur-sm" aria-label="Monitor sections">
      <div className="flex flex-wrap gap-1.5">
        {EDGE_MONITOR_SECTIONS.map((item) => {
          const active = section === item.id
          const badge = Number(badges[item.id]) || 0
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              title={item.hint}
              aria-current={active ? 'page' : undefined}
              className={`edge-monitor-section-tab min-h-9 rounded-xl px-3 py-2 text-left touch-manipulation transition-colors ${
                active
                  ? 'bg-violet-600 text-white shadow-sm shadow-violet-900/30'
                  : 'bg-zinc-800/80 text-zinc-300 hover:bg-zinc-700 hover:text-zinc-100'
              }`}
            >
              <span className="flex items-center gap-2">
                <span className="text-[12px] font-bold leading-none">{item.label}</span>
                {badge > 0 ? (
                  <span
                    className={`inline-flex min-w-[1.125rem] items-center justify-center rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums leading-none ${
                      active ? 'bg-white/20 text-white' : 'bg-red-500/90 text-white'
                    }`}
                  >
                    {badge > 99 ? '99+' : badge}
                  </span>
                ) : null}
              </span>
              <span className={`mt-0.5 block text-[10px] leading-snug ${active ? 'text-violet-100/90' : 'text-zinc-500'}`}>
                {item.hint}
              </span>
            </button>
          )
        })}
      </div>
    </nav>
  )
}
