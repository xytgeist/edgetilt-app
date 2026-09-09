/**
 * Inline (i) panel for Ops drop types. Lists every drop for the selected sport.
 */

/**
 * @param {{
 *   drops: { id: string, label: string, info?: string, hint?: string }[],
 *   selectedDropId: string,
 *   onSelectDrop: (id: string) => void,
 * }} props
 */
export function SyndicateOpsDropInfo({ drops, selectedDropId, onSelectDrop }) {
  return (
    <div
      className="rounded-md border border-zinc-700 bg-zinc-950/95 px-2.5 py-2 space-y-2"
      data-syndicate-ops-drop-info
    >
      <p className="text-[10px] font-semibold uppercase tracking-wide text-zinc-500">
        What each drop is
      </p>
      <ul className="space-y-2">
        {drops.map((d) => {
          const selected = d.id === selectedDropId
          return (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => onSelectDrop(d.id)}
                className={`w-full text-left rounded-md px-2 py-1.5 transition ${
                  selected
                    ? 'bg-amber-500/15 ring-1 ring-amber-500/40'
                    : 'hover:bg-zinc-900/80'
                }`}
              >
                <span className={`block text-[11px] font-semibold ${selected ? 'text-amber-200' : 'text-zinc-200'}`}>
                  {d.label}
                  {selected ? <span className="ml-1.5 font-normal text-amber-400/80">selected</span> : null}
                </span>
                <span className="block mt-0.5 text-[10px] leading-snug text-zinc-400">
                  {d.info || d.hint}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
