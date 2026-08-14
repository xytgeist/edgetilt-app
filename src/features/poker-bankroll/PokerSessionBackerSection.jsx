import { useLayoutEffect, useRef, useState } from 'react'
import PlayLogPartnerPickerModal from '../play-logbook/PlayLogPartnerPickerModal.jsx'
import {
  draftBackerActionSold,
  draftBackerUsedUserIds,
  emptyDraftBacker,
} from './pokerSessionBackerDrafts.js'

const FIELD =
  'w-full h-11 min-h-11 rounded-2xl bg-zinc-800 px-3 text-sm text-white outline-none focus:ring-2 focus:ring-cyan-500/40'

function revealExpandedInOverflowParent(el) {
  if (!el) return
  let parent = el.parentElement
  while (parent && parent !== document.body) {
    const style = window.getComputedStyle(parent)
    const oy = style.overflowY
    const canScroll =
      (oy === 'auto' || oy === 'scroll' || oy === 'overlay') &&
      parent.scrollHeight > parent.clientHeight + 1
    if (canScroll) {
      const parentRect = parent.getBoundingClientRect()
      const elRect = el.getBoundingClientRect()
      const pad = 16
      let delta = 0
      if (elRect.bottom > parentRect.bottom - pad) {
        delta = elRect.bottom - (parentRect.bottom - pad)
      }
      if (elRect.top - delta < parentRect.top + pad) {
        delta = elRect.top - (parentRect.top + pad)
      }
      if (Math.abs(delta) > 1) {
        parent.scrollTo({ top: parent.scrollTop + delta, behavior: 'smooth' })
      }
      return
    }
    parent = parent.parentElement
  }
  el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' })
}

/**
 * Personal Start Session: one-session stake drafts (cash_piece / tournament_piece).
 * `enabled` hides this Start Session block only (e.g. already writing onto a package
 * stake). It does not hide other stake carousel cards.
 */
export default function PokerSessionBackerSection({
  supabaseClient,
  userId,
  enabled = true,
  draftBackers = [],
  onDraftBackersChange,
}) {
  const [pickerOpen, setPickerOpen] = useState(false)
  const listRef = useRef(null)

  useLayoutEffect(() => {
    if (!draftBackers.length) return
    revealExpandedInOverflowParent(listRef.current)
  }, [draftBackers.length])

  if (!enabled) return null

  function patchDraft(key, patch) {
    onDraftBackersChange?.(
      draftBackers.map((row) => (row.key === key ? { ...row, ...patch } : row)),
    )
  }

  function removeDraft(key) {
    onDraftBackersChange?.(draftBackers.filter((row) => row.key !== key))
  }

  function addGuest() {
    onDraftBackersChange?.([...draftBackers, emptyDraftBacker({ isGuest: true })])
  }

  function onPickerConfirm(selected) {
    const profile = Array.isArray(selected) ? selected[0] : selected
    const stakerUserId = String(profile?.user_id || '').trim()
    if (!stakerUserId || stakerUserId === userId) {
      setPickerOpen(false)
      return
    }
    if (draftBackerUsedUserIds(draftBackers).includes(stakerUserId)) {
      setPickerOpen(false)
      return
    }
    onDraftBackersChange?.([
      ...draftBackers,
      {
        ...emptyDraftBacker({ isGuest: false }),
        stakerUserId,
        handle: String(profile.handle || '').replace(/^@+/, ''),
        displayName: profile.display_name || profile.handle || 'Backer',
      },
    ])
    setPickerOpen(false)
  }

  const sold = draftBackerActionSold(draftBackers)
  const overBy = sold > 100 ? Math.round((sold - 100) * 1000) / 1000 : 0

  return (
    <div
      className="mb-4 mt-1 rounded-2xl border border-cyan-500/40 bg-cyan-950/30 p-3 shadow-[inset_0_1px_0_0_rgba(34,211,238,0.12)]"
      data-poker-session-backers="featured"
      ref={listRef}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <div className="text-sm font-black uppercase tracking-wide text-cyan-300">
              Backers
            </div>
            <span className="rounded-full bg-cyan-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-cyan-200">
              This session
            </span>
          </div>
          <p className="mt-1 text-[12px] font-semibold leading-snug text-cyan-100/80">
            Single session stake ... closes when you end it
          </p>
        </div>
        <div className="flex shrink-0 gap-1.5">
          <button
            type="button"
            onClick={() => setPickerOpen(true)}
            className="rounded-xl bg-cyan-600 px-2.5 py-1.5 text-xs font-bold text-white touch-manipulation active:bg-cyan-500"
          >
            + Edge user
          </button>
          <button
            type="button"
            onClick={addGuest}
            className="rounded-xl border border-cyan-400/45 bg-cyan-950/50 px-2.5 py-1.5 text-xs font-bold text-cyan-100 touch-manipulation active:bg-cyan-900/60"
          >
            + Guest
          </button>
        </div>
      </div>

      {!draftBackers.length ? (
        <p className="mb-1 text-sm font-medium text-cyan-100/70">
          No backers yet ... add someone above.
        </p>
      ) : null}

      <div className="flex flex-col gap-2">
        {draftBackers.map((row) => (
          <div
            key={row.key}
            className="rounded-2xl border border-cyan-500/25 bg-black/20 p-3"
          >
            <div className="mb-2 flex items-start justify-between gap-2">
              <div
                data-poker-session-backer-name
                className="min-w-0 text-sm font-semibold text-white"
              >
                {row.isGuest
                  ? row.guestLabel.trim() || 'Guest backer'
                  : row.displayName || (row.handle ? `@${row.handle}` : 'Backer')}
              </div>
              <button
                type="button"
                onClick={() => removeDraft(row.key)}
                className="text-xs font-semibold text-rose-300 touch-manipulation"
              >
                Remove
              </button>
            </div>
            {row.isGuest ? (
              <div className="mb-2 grid grid-cols-1 gap-2">
                <input
                  value={row.guestLabel}
                  onChange={(e) => patchDraft(row.key, { guestLabel: e.target.value })}
                  placeholder="Guest name"
                  className={FIELD}
                />
                <input
                  value={row.guestEmail}
                  onChange={(e) => patchDraft(row.key, { guestEmail: e.target.value })}
                  placeholder="Email (optional)"
                  inputMode="email"
                  autoComplete="email"
                  className={FIELD}
                />
              </div>
            ) : null}
            <div className="grid grid-cols-2 gap-2">
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">
                  Action %
                </span>
                <input
                  value={row.actionPct}
                  onChange={(e) => patchDraft(row.key, { actionPct: e.target.value })}
                  placeholder="e.g. 50"
                  inputMode="decimal"
                  className={FIELD}
                />
              </label>
              <label className="min-w-0">
                <span className="mb-1 block text-[10px] font-bold uppercase tracking-wide text-cyan-200/80">
                  Your profit %
                </span>
                <input
                  value={row.playerProfitPct}
                  onChange={(e) => patchDraft(row.key, { playerProfitPct: e.target.value })}
                  placeholder="50"
                  inputMode="decimal"
                  className={FIELD}
                />
              </label>
            </div>
          </div>
        ))}
      </div>

      {overBy > 0 ? (
        <p className="mt-2 text-center text-sm font-semibold text-rose-400" role="alert">
          Action sold is over by {overBy}%
        </p>
      ) : null}

      <PlayLogPartnerPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        supabaseClient={supabaseClient}
        userId={userId}
        usedUserIds={draftBackerUsedUserIds(draftBackers)}
        onConfirm={onPickerConfirm}
        mode="directory"
        hideGuests
        title="Add Edge backer"
        confirmOnSelect
      />
    </div>
  )
}
