import { Pencil } from 'lucide-react'
import { triggerTapHapticLight } from '../../utils/tapHaptic.js'
import { fmtPoker$ } from '../poker-bankroll/pokerBankrollMath.js'
import { roundMoney } from './pokerStableMath.js'
import {
  STABLE_PRIMARY_BTN,
  STABLE_SURFACE_CARD,
  STABLE_SURFACE_DIVIDER,
} from './pokerStableUi.js'

function fmtPct(n) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return `${sign}${n.toFixed(1)}%`
}

function pctToneClass(n) {
  if (n == null || !Number.isFinite(n) || n === 0) return 'text-zinc-200'
  return n > 0 ? 'text-emerald-300' : 'text-rose-300'
}

/** Shared hero $ size … shrinks when either column gets long so the pair stays matched. */
function portfolioHeroAmountSizeClass(...labels) {
  const maxLen = Math.max(0, ...labels.map((s) => String(s ?? '').length))
  if (maxLen <= 7) return 'text-4xl'
  if (maxLen <= 9) return 'text-3xl'
  if (maxLen <= 11) return 'text-2xl'
  return 'text-xl'
}

/**
 * Backer Stable portfolio hero summary. Tap opens portfolio detail sheet
 * (Overview / Trend / Locations + adjust bankroll).
 */
export default function PokerStablePortfolioHero({
  metrics,
  onOpenDetail,
  onNeedsAttention,
  onCreateStake,
  pendingCommitCount = 0,
}) {
  const m = metrics || {}
  const currentBalance = roundMoney(m.liquidBankroll ?? 0)
  const pendingHold = roundMoney(m.pendingHold ?? 0)
  const backingAmountLabel = fmtPoker$(currentBalance)
  const portfolioAmountLabel = fmtPoker$(m.portfolioValue ?? 0)
  const amountSizeClass = portfolioHeroAmountSizeClass(backingAmountLabel, portfolioAmountLabel)

  function openDetail() {
    triggerTapHapticLight()
    onOpenDetail?.()
  }

  return (
    <div
      data-poker-stable-portfolio-hero
      role="button"
      tabIndex={0}
      onClick={openDetail}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          openDetail()
        }
      }}
      className={`relative mb-4 ${STABLE_SURFACE_CARD} px-5 py-4 text-left touch-manipulation active:opacity-[0.98]`}
      aria-label="Open backing portfolio details"
    >
      {/* Same width as before, taller mouth so the chevron reads as a bigger tap affordance. */}
      <svg
        viewBox="0 0 24 40"
        className="pointer-events-none absolute right-3 top-1/2 h-10 w-6 -translate-y-1/2 text-zinc-500"
        fill="none"
        aria-hidden
      >
        <path
          d="M7 4 L17 20 L7 36"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>

      {pendingCommitCount > 0 ? (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onNeedsAttention?.()
          }}
          className="mb-3 w-full rounded-2xl border border-amber-400/40 bg-amber-500/15 px-3 py-2.5 text-left touch-manipulation"
        >
          <div className="text-sm font-bold text-amber-100">
            Needs your attention ({pendingCommitCount})
          </div>
          <div className="text-xs text-amber-200/80">Tap to review and commit updates</div>
        </button>
      ) : null}

      <div className="grid grid-cols-2 gap-3 text-center">
        <div className="min-w-0">
          <div className="relative mx-auto w-fit">
            <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">
              Backing bankroll
            </div>
            {/* Out of flow … anchored past the label end so layout stays unchanged. */}
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                openDetail()
              }}
              className="absolute left-full top-1/2 z-[1] ml-2 inline-flex h-4 w-4 -translate-y-1/2 items-center justify-center text-zinc-500 touch-manipulation active:text-zinc-300"
              aria-label="Adjust backing bankroll"
              data-poker-stable-edit-btn
            >
              <Pencil className="h-3 w-3" strokeWidth={2.25} aria-hidden />
            </button>
          </div>
          <div className="mt-1 min-w-0">
            <div
              data-poker-stable-backing-bankroll={currentBalance < 0 ? 'negative' : undefined}
              className={`whitespace-nowrap font-black tabular-nums tracking-tight leading-none ${
                currentBalance < 0 ? 'text-rose-400' : 'text-white'
              } ${amountSizeClass}`}
            >
              {backingAmountLabel}
            </div>
            {pendingHold > 0 ? (
              <div
                className="mt-1 text-xs font-semibold tabular-nums text-zinc-400"
                data-poker-stable-backing-pending-hold
              >
                ({fmtPoker$(-pendingHold)} pending)
              </div>
            ) : null}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-xs font-bold uppercase tracking-wide text-zinc-500">
            Portfolio value
          </div>
          <div
            className={`mt-1 whitespace-nowrap font-black tabular-nums tracking-tight leading-none text-cyan-300 ${amountSizeClass}`}
            data-poker-stable-portfolio-value
          >
            {portfolioAmountLabel}
          </div>
        </div>
      </div>

      <div
        className={`mt-3 grid grid-cols-3 gap-2 border-t ${STABLE_SURFACE_DIVIDER} pt-3 text-center sm:grid-cols-6`}
      >
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">At risk</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.capitalAtRisk ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Stakes MTM</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {fmtPoker$(m.stakeValueMtm ?? 0)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">At-risk ROI</div>
          <div className={`mt-0.5 text-sm font-bold tabular-nums ${pctToneClass(m.atRiskReturnPct)}`}>
            {fmtPct(m.atRiskReturnPct)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Horses</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-zinc-200">
            {m.activeHorseCount ?? 0}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">TWR</div>
          <div className={`mt-0.5 text-sm font-bold tabular-nums ${pctToneClass(m.twrPct)}`}>
            {fmtPct(m.twrPct)}
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase text-zinc-500">Realized P/L</div>
          <div className="mt-0.5 text-sm font-bold tabular-nums text-emerald-300">
            {fmtPoker$(m.realizedBackingPl ?? 0)}
          </div>
        </div>
      </div>

      {onCreateStake ? (
        <div className={`mt-4 border-t ${STABLE_SURFACE_DIVIDER} pt-4`}>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation()
              triggerTapHapticLight()
              onCreateStake()
            }}
            className={`w-full rounded-2xl py-3.5 text-sm font-bold touch-manipulation ${STABLE_PRIMARY_BTN}`}
            data-poker-stable-primary-btn
            data-poker-stable-create-stake-btn
          >
            Create Stake
          </button>
        </div>
      ) : null}
    </div>
  )
}
