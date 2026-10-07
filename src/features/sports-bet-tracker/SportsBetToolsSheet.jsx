import { useMemo, useState } from 'react'
import { Calculator, ChevronLeft, X } from 'lucide-react'
import AppModalOverlay from '../../components/AppModalOverlay.jsx'
import {
  americanToDecimal,
  americanToFractional,
  arbTwoWay,
  evFromTrueProb,
  formatAmericanOdds,
  formatPct,
  formatSignedUsd,
  hedgeToLock,
  americanFromImplied,
  impliedFromAmerican,
  kellyStake,
  noVigTwoWay,
  parseAnyOdds,
  parlayFromOdds,
  payoutFromStake,
} from './sportsBetCalcMath.js'
import { formatUsd } from './sportsBetStake.js'

const FEATURED = [
  { id: 'parlay', label: 'Parlay', blurb: 'Stack legs from open bets or type juice' },
  { id: 'hedge', label: 'Hedge', blurb: 'Lock a logged bet against the other side' },
  { id: 'kelly', label: 'Kelly', blurb: 'Size vs your bankroll and a fair %' },
]

const UTILS = [
  { id: 'payout', label: 'Payout', blurb: 'To-win and return' },
  { id: 'converter', label: 'Converter', blurb: 'American · decimal · fraction' },
  { id: 'implied', label: 'Implied', blurb: 'Juice → win % and back' },
  { id: 'ev', label: 'Expected value', blurb: 'Your % vs this price' },
  { id: 'novig', label: 'No-vig', blurb: 'Strip the two-way hold' },
  { id: 'arb', label: 'Arbitrage', blurb: 'Split two books if both sides pay' },
]

const inputClass =
  'w-full rounded-xl border border-zinc-700 bg-zinc-950 px-3 py-2.5 text-[15px] text-white outline-none focus:border-cyan-500'

function Result({ label, value, tone = 'zinc' }) {
  const toneClass =
    tone === 'green'
      ? 'text-emerald-300'
      : tone === 'red'
        ? 'text-rose-300'
        : tone === 'cyan'
          ? 'text-cyan-300'
          : 'text-white'
  return (
    <div data-sports-bet-stat className="rounded-2xl border border-zinc-800 bg-zinc-900/80 px-3 py-2.5">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-zinc-500">{label}</div>
      <div className={`mt-0.5 text-lg font-black tabular-nums ${toneClass}`}>{value}</div>
    </div>
  )
}

function Field({ label, children }) {
  return (
    <label className="block text-xs font-semibold uppercase tracking-wide text-zinc-500">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function OpenBetSelect({ bets, value, onChange, allowEmpty = true }) {
  const open = (Array.isArray(bets) ? bets : []).filter((b) => b?.status === 'open')
  if (!open.length) return null
  return (
    <Field label="Open bet">
      <select className={inputClass} value={value || ''} onChange={(e) => onChange(e.target.value)}>
        {allowEmpty ? <option value="">Type it in</option> : null}
        {open.map((b) => (
          <option key={b.id} value={b.id}>
            {b.selection_label || 'Open bet'} · {formatAmericanOdds(b.odds)}
          </option>
        ))}
      </select>
    </Field>
  )
}

function betStakeDollars(bet, unitSize) {
  const d = Number(bet?.stake_dollars)
  if (Number.isFinite(d) && d > 0) return d
  const u = Number(bet?.stake_units)
  const size = Number(bet?.unit_size_dollars) || Number(unitSize)
  if (Number.isFinite(u) && u > 0 && Number.isFinite(size) && size > 0) return u * size
  return null
}

function findBet(bets, id) {
  return (Array.isArray(bets) ? bets : []).find((b) => String(b.id) === String(id)) || null
}

function ParlayTool({ bets }) {
  const open = (Array.isArray(bets) ? bets : []).filter((b) => b?.status === 'open')
  const [legs, setLegs] = useState(() => [
    { odds: '', label: '' },
    { odds: '', label: '' },
  ])
  const addBlank = () => setLegs((prev) => [...prev, { odds: '', label: '' }])
  const addBet = (id) => {
    const bet = findBet(open, id)
    if (!bet) return
    setLegs((prev) => [...prev, {
      odds: String(bet.odds ?? ''),
      label: String(bet.selection_label || ''),
    }])
  }
  const pack = parlayFromOdds(legs.map((l) => l.odds))
  const payout = pack ? payoutFromStake(100, pack.american) : null
  return (
    <div className="space-y-3">
      {open.length ? (
        <Field label="Add an open bet">
          <select className={inputClass} value="" onChange={(e) => addBet(e.target.value)}>
            <option value="">Pick a logged bet…</option>
            {open.map((b) => (
              <option key={b.id} value={b.id}>
                {b.selection_label || 'Open bet'} · {formatAmericanOdds(b.odds)}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      {legs.map((leg, i) => (
        <div key={`leg-${i}`} className="grid grid-cols-[1fr_6.5rem_auto] gap-2">
          <input
            className={inputClass}
            value={leg.label}
            placeholder={`Leg ${i + 1}`}
            onChange={(e) => setLegs((prev) => prev.map((row, j) => (j === i ? { ...row, label: e.target.value } : row)))}
          />
          <input
            className={inputClass}
            inputMode="decimal"
            value={leg.odds}
            placeholder="-110"
            onChange={(e) => setLegs((prev) => prev.map((row, j) => (j === i ? { ...row, odds: e.target.value } : row)))}
          />
          <button
            type="button"
            className="rounded-xl px-2 text-zinc-500 active:bg-zinc-800"
            aria-label={`Remove leg ${i + 1}`}
            onClick={() => setLegs((prev) => prev.filter((_, j) => j !== i))}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}
      <button type="button" onClick={addBlank} className="text-[13px] font-bold text-cyan-400">
        + Add leg
      </button>
      {pack ? (
        <div className="grid grid-cols-2 gap-2">
          <Result label="Combined" value={formatAmericanOdds(pack.american)} tone="cyan" />
          <Result label="Decimal" value={pack.decimal.toFixed(3)} />
          <Result label="$100 pays" value={formatUsd(payout?.payout)} tone="green" />
          <Result label="To win" value={formatUsd(payout?.profit)} />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Add at least one valid American price.</p>
      )}
    </div>
  )
}

function HedgeTool({ bets, unitSize, seedBet }) {
  const [betId, setBetId] = useState(seedBet?.status === 'open' ? String(seedBet.id) : '')
  const [stake, setStake] = useState(() => {
    const d = betStakeDollars(seedBet, unitSize)
    return d != null ? String(d) : ''
  })
  const [openOdds, setOpenOdds] = useState(seedBet?.odds != null ? String(seedBet.odds) : '')
  const [hedgeOdds, setHedgeOdds] = useState('')

  const applyBet = (id) => {
    setBetId(id)
    const bet = findBet(bets, id)
    if (!bet) return
    const d = betStakeDollars(bet, unitSize)
    if (d != null) setStake(String(Number(d.toFixed(2))))
    if (bet.odds != null) setOpenOdds(String(bet.odds))
  }

  const pack = hedgeToLock(stake, openOdds, hedgeOdds)
  return (
    <div className="space-y-3">
      <OpenBetSelect bets={bets} value={betId} onChange={applyBet} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Open stake ($)">
          <input className={inputClass} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
        </Field>
        <Field label="Open odds">
          <input className={inputClass} inputMode="decimal" value={openOdds} onChange={(e) => setOpenOdds(e.target.value)} />
        </Field>
      </div>
      <Field label="Hedge odds">
        <input className={inputClass} inputMode="decimal" value={hedgeOdds} placeholder="-120" onChange={(e) => setHedgeOdds(e.target.value)} />
      </Field>
      {pack ? (
        <div className="grid grid-cols-2 gap-2">
          <Result label="Hedge stake" value={formatUsd(pack.hedgeStake)} tone="cyan" />
          <Result
            label="Locked P&L"
            value={formatSignedUsd(pack.lockedProfit)}
            tone={pack.lockedProfit > 0 ? 'green' : pack.lockedProfit < 0 ? 'red' : 'zinc'}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Enter the open stake and both prices.</p>
      )}
    </div>
  )
}

function KellyTool({ bets, bankrollNow, unitSize, seedBet }) {
  const [betId, setBetId] = useState(seedBet ? String(seedBet.id) : '')
  const [odds, setOdds] = useState(seedBet?.odds != null ? String(seedBet.odds) : '-110')
  const [winPct, setWinPct] = useState('')
  const [bankroll, setBankroll] = useState(bankrollNow != null ? String(Number(bankrollNow.toFixed(2))) : '')
  const [frac, setFrac] = useState('0.5')

  const applyBet = (id) => {
    setBetId(id)
    const bet = findBet(bets, id)
    if (bet?.odds != null) setOdds(String(bet.odds))
  }

  const implied = impliedFromAmerican(odds)
  const p = Number(winPct) / 100
  const pack = kellyStake(bankroll, odds, p, Number(frac))
  const units = pack && Number(unitSize) > 0 ? pack.stake / Number(unitSize) : null
  return (
    <div className="space-y-3">
      <OpenBetSelect bets={bets} value={betId} onChange={applyBet} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Bankroll ($)">
          <input className={inputClass} inputMode="decimal" value={bankroll} onChange={(e) => setBankroll(e.target.value)} />
        </Field>
        <Field label="Odds">
          <input className={inputClass} inputMode="decimal" value={odds} onChange={(e) => setOdds(e.target.value)} />
        </Field>
      </div>
      <Field label="Your win %">
        <input className={inputClass} inputMode="decimal" value={winPct} placeholder={implied ? (implied * 100).toFixed(1) : '55'} onChange={(e) => setWinPct(e.target.value)} />
      </Field>
      {implied != null ? (
        <p className="text-[12px] text-zinc-500">This juice implies {formatPct(implied * 100)}. Kelly needs your fair %, not the book’s.</p>
      ) : null}
      <div className="flex gap-1 rounded-2xl bg-zinc-900 p-1">
        {[
          { id: '1', label: 'Full' },
          { id: '0.5', label: 'Half' },
          { id: '0.25', label: 'Quarter' },
        ].map((row) => (
          <button
            key={row.id}
            type="button"
            onClick={() => setFrac(row.id)}
            className={`flex-1 rounded-xl py-2 text-[13px] font-bold touch-manipulation ${
              frac === row.id ? 'bg-cyan-600 text-white' : 'text-zinc-400 active:bg-zinc-800'
            }`}
          >
            {row.label}
          </button>
        ))}
      </div>
      {pack ? (
        pack.noBet ? (
          <p className="text-sm text-rose-300">No edge at that %. Kelly says sit.</p>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            <Result label="Stake" value={formatUsd(pack.stake)} tone="cyan" />
            <Result label="Units" value={units == null ? '—' : `${units.toFixed(2)}u`} />
            <Result label="Bankroll %" value={formatPct(pack.usedFraction * 100)} />
            <Result label="Full Kelly" value={formatPct(pack.fullFraction * 100)} />
          </div>
        )
      ) : (
        <p className="text-sm text-zinc-500">Need bankroll, odds, and a win % under 100.</p>
      )}
    </div>
  )
}

function PayoutTool({ bets, unitSize, seedBet }) {
  const [betId, setBetId] = useState(seedBet ? String(seedBet.id) : '')
  const [stake, setStake] = useState(() => {
    const d = betStakeDollars(seedBet, unitSize)
    return d != null ? String(Number(d.toFixed(2))) : '100'
  })
  const [odds, setOdds] = useState(seedBet?.odds != null ? String(seedBet.odds) : '-110')
  const applyBet = (id) => {
    setBetId(id)
    const bet = findBet(bets, id)
    if (!bet) return
    const d = betStakeDollars(bet, unitSize)
    if (d != null) setStake(String(Number(d.toFixed(2))))
    if (bet.odds != null) setOdds(String(bet.odds))
  }
  const pack = payoutFromStake(stake, odds)
  return (
    <div className="space-y-3">
      <OpenBetSelect bets={bets} value={betId} onChange={applyBet} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Stake ($)">
          <input className={inputClass} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
        </Field>
        <Field label="Odds">
          <input className={inputClass} inputMode="decimal" value={odds} onChange={(e) => setOdds(e.target.value)} />
        </Field>
      </div>
      {pack ? (
        <div className="grid grid-cols-2 gap-2">
          <Result label="To win" value={formatUsd(pack.profit)} tone="green" />
          <Result label="Payout" value={formatUsd(pack.payout)} tone="cyan" />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Enter a stake and American odds.</p>
      )}
    </div>
  )
}

function ConverterTool() {
  const [raw, setRaw] = useState('+150')
  const american = parseAnyOdds(raw)
  return (
    <div className="space-y-3">
      <Field label="Any format">
        <input className={inputClass} value={raw} onChange={(e) => setRaw(e.target.value)} placeholder="+150 or 2.50 or 3/2" />
      </Field>
      {american != null ? (
        <div className="grid grid-cols-3 gap-2">
          <Result label="American" value={formatAmericanOdds(american)} tone="cyan" />
          <Result label="Decimal" value={americanToDecimal(american)?.toFixed(2) || '—'} />
          <Result label="Fraction" value={americanToFractional(american) || '—'} />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Try +150, 2.50, or 3/2.</p>
      )}
    </div>
  )
}

function ImpliedTool() {
  const [odds, setOdds] = useState('-110')
  const [pct, setPct] = useState('')
  const implied = impliedFromAmerican(odds)
  const fromPct = Number(pct) > 0 && Number(pct) < 100
    ? americanFromImplied(Number(pct) / 100)
    : null
  return (
    <div className="space-y-3">
      <Field label="Odds">
        <input className={inputClass} inputMode="decimal" value={odds} onChange={(e) => setOdds(e.target.value)} />
      </Field>
      {implied != null ? <Result label="Win probability" value={formatPct(implied * 100, 2)} tone="cyan" /> : null}
      <Field label="Or type a win %">
        <input className={inputClass} inputMode="decimal" value={pct} placeholder="52.4" onChange={(e) => setPct(e.target.value)} />
      </Field>
      {fromPct != null ? <Result label="Fair American" value={formatAmericanOdds(fromPct)} /> : null}
    </div>
  )
}

function EvTool({ bets, seedBet }) {
  const [betId, setBetId] = useState(seedBet ? String(seedBet.id) : '')
  const [odds, setOdds] = useState(seedBet?.odds != null ? String(seedBet.odds) : '-110')
  const [winPct, setWinPct] = useState('')
  const [stake, setStake] = useState('100')
  const applyBet = (id) => {
    setBetId(id)
    const bet = findBet(bets, id)
    if (bet?.odds != null) setOdds(String(bet.odds))
  }
  const pack = evFromTrueProb(odds, Number(winPct) / 100)
  const dollars = pack && Number(stake) > 0 ? pack.ev * Number(stake) : null
  return (
    <div className="space-y-3">
      <OpenBetSelect bets={bets} value={betId} onChange={applyBet} />
      <div className="grid grid-cols-2 gap-2">
        <Field label="Odds">
          <input className={inputClass} inputMode="decimal" value={odds} onChange={(e) => setOdds(e.target.value)} />
        </Field>
        <Field label="Your win %">
          <input className={inputClass} inputMode="decimal" value={winPct} placeholder="55" onChange={(e) => setWinPct(e.target.value)} />
        </Field>
      </div>
      <Field label="Stake ($)">
        <input className={inputClass} inputMode="decimal" value={stake} onChange={(e) => setStake(e.target.value)} />
      </Field>
      {pack ? (
        <div className="grid grid-cols-2 gap-2">
          <Result
            label="EV"
            value={formatPct(pack.evPct)}
            tone={pack.ev > 0 ? 'green' : pack.ev < 0 ? 'red' : 'zinc'}
          />
          <Result
            label="On this stake"
            value={formatSignedUsd(dollars)}
            tone={dollars > 0 ? 'green' : dollars < 0 ? 'red' : 'zinc'}
          />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Need odds and a win % that is not the book’s implied.</p>
      )}
    </div>
  )
}

function NoVigTool() {
  const [a, setA] = useState('-110')
  const [b, setB] = useState('-110')
  const pack = noVigTwoWay(a, b)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Side A">
          <input className={inputClass} inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
        </Field>
        <Field label="Side B">
          <input className={inputClass} inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
        </Field>
      </div>
      {pack ? (
        <div className="grid grid-cols-2 gap-2">
          <Result label="Vig" value={formatPct(pack.vigPct, 2)} tone={pack.vigPct > 0 ? 'red' : 'green'} />
          <Result label="Overround" value={formatPct(pack.overround * 100, 2)} />
          <Result label="Fair A" value={formatAmericanOdds(pack.fairAmericanA)} tone="cyan" />
          <Result label="Fair B" value={formatAmericanOdds(pack.fairAmericanB)} tone="cyan" />
          <Result label="True A" value={formatPct(pack.fairA * 100, 2)} />
          <Result label="True B" value={formatPct(pack.fairB * 100, 2)} />
        </div>
      ) : (
        <p className="text-sm text-zinc-500">Two-way prices … same as the hub’s Pinnacle reference.</p>
      )}
    </div>
  )
}

function ArbTool() {
  const [a, setA] = useState('+150')
  const [b, setB] = useState('-140')
  const [bank, setBank] = useState('100')
  const pack = arbTwoWay(a, b, bank)
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <Field label="Book A">
          <input className={inputClass} inputMode="decimal" value={a} onChange={(e) => setA(e.target.value)} />
        </Field>
        <Field label="Book B">
          <input className={inputClass} inputMode="decimal" value={b} onChange={(e) => setB(e.target.value)} />
        </Field>
      </div>
      <Field label="Total to split ($)">
        <input className={inputClass} inputMode="decimal" value={bank} onChange={(e) => setBank(e.target.value)} />
      </Field>
      {pack ? (
        pack.isArb ? (
          <div className="grid grid-cols-2 gap-2">
            <Result label="Locked profit" value={formatSignedUsd(pack.profit)} tone="green" />
            <Result label="Return" value={formatPct(pack.profitPct)} tone="green" />
            <Result label="Stake A" value={formatUsd(pack.stakeA)} />
            <Result label="Stake B" value={formatUsd(pack.stakeB)} />
          </div>
        ) : (
          <p className="text-sm text-zinc-400">
            No arb. Combined implied {formatPct(pack.overround * 100, 2)} (need under 100%).
          </p>
        )
      ) : (
        <p className="text-sm text-zinc-500">Two prices from different books on opposite sides.</p>
      )}
    </div>
  )
}

function ToolBody({ tool, bets, bankrollNow, unitSize, seedBet }) {
  if (tool === 'parlay') return <ParlayTool bets={bets} />
  if (tool === 'hedge') return <HedgeTool bets={bets} unitSize={unitSize} seedBet={seedBet} />
  if (tool === 'kelly') return <KellyTool bets={bets} bankrollNow={bankrollNow} unitSize={unitSize} seedBet={seedBet} />
  if (tool === 'payout') return <PayoutTool bets={bets} unitSize={unitSize} seedBet={seedBet} />
  if (tool === 'converter') return <ConverterTool />
  if (tool === 'implied') return <ImpliedTool />
  if (tool === 'ev') return <EvTool bets={bets} seedBet={seedBet} />
  if (tool === 'novig') return <NoVigTool />
  if (tool === 'arb') return <ArbTool />
  return null
}

function ToolTile({ item, onOpen }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(item.id)}
      className="rounded-2xl border border-zinc-800 bg-zinc-900/70 px-3 py-3 text-left touch-manipulation active:bg-zinc-800"
    >
      <div className="text-[15px] font-bold text-white">{item.label}</div>
      <div className="mt-0.5 text-[12px] text-zinc-500">{item.blurb}</div>
    </button>
  )
}

export default function SportsBetToolsSheet({
  open,
  onClose,
  bets = [],
  bankrollNow = null,
  unitSize = 100,
  initialTool = '',
  seedBet = null,
}) {
  const start = String(initialTool || '').trim()
  const [tool, setTool] = useState(start && start !== '1' ? start : '')
  const title = useMemo(() => {
    const all = [...FEATURED, ...UTILS]
    return all.find((t) => t.id === tool)?.label || 'Bet tools'
  }, [tool])

  if (!open) return null

  return (
    <AppModalOverlay
      role="dialog"
      aria-modal="true"
      aria-label="Bet tools"
      onClick={onClose}
    >
      <div
        data-sports-bet-tools
        className="relative z-[1] flex max-h-[min(90dvh,calc(100dvh-max(env(safe-area-inset-top,0px),var(--edge-sat,0px))-3.5rem))] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-zinc-700 bg-zinc-950 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2 border-b border-zinc-800 px-3 py-3">
          {tool ? (
            <button
              type="button"
              onClick={() => setTool('')}
              className="grid h-10 w-10 place-items-center rounded-xl text-zinc-300 active:bg-zinc-800"
              aria-label="All tools"
            >
              <ChevronLeft className="h-5 w-5" strokeWidth={2.5} />
            </button>
          ) : (
            <div className="grid h-10 w-10 place-items-center text-cyan-400">
              <Calculator className="h-5 w-5" strokeWidth={2.25} />
            </div>
          )}
          <h2 className="min-w-0 flex-1 truncate text-lg font-black text-white">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full p-2 text-zinc-400 active:bg-zinc-800"
            aria-label="Close tools"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 pb-[calc(1rem+max(env(safe-area-inset-bottom,0px),var(--edge-sab,0px)))]">
          {tool ? (
            <ToolBody
              tool={tool}
              bets={bets}
              bankrollNow={bankrollNow}
              unitSize={unitSize}
              seedBet={seedBet}
            />
          ) : (
            <div className="space-y-4">
              <p className="text-sm text-zinc-400">
                Prefills from open bets and bankroll. Hub no-vig / EV stay on the board.
              </p>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Use your bets</div>
                <div className="grid gap-2">
                  {FEATURED.map((item) => (
                    <ToolTile key={item.id} item={item} onOpen={setTool} />
                  ))}
                </div>
              </div>
              <div>
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-zinc-500">Utilities</div>
                <div className="grid grid-cols-2 gap-2">
                  {UTILS.map((item) => (
                    <ToolTile key={item.id} item={item} onOpen={setTool} />
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </AppModalOverlay>
  )
}
