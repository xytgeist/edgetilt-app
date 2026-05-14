import { useState } from 'react'

export default function BankrollTracker() {
  const [sessionDate, setSessionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [bankrollStart, setBankrollStart] = useState('2500')
  const [buyIn, setBuyIn] = useState('500')
  const [cashOut, setCashOut] = useState('0')
  const [notes, setNotes] = useState('')

  const parsedBuyIn = Number(buyIn) || 0
  const parsedCashOut = Number(cashOut) || 0
  const parsedBankrollStart = Number(bankrollStart) || 0
  const sessionPnl = parsedCashOut - parsedBuyIn
  const projectedBankroll = parsedBankrollStart + sessionPnl

  return (
    <div className="mx-auto w-full max-w-2xl px-3 py-6 pt-[max(0px,env(safe-area-inset-top))] pb-[max(0.5rem,env(safe-area-inset-bottom))]">
      <div className="mb-6">
        <div className="text-white text-2xl font-black tracking-tight">Bankroll Tracker</div>
        <div className="text-zinc-400 text-sm mt-0.5">Track sessions, win/loss trends, and bankroll growth</div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-2xl bg-zinc-900 p-4">
          <div className="text-zinc-400 text-xs">Session P/L</div>
          <div className={`mt-1 text-xl font-black ${sessionPnl >= 0 ? 'text-emerald-300' : 'text-red-300'}`}>
            {sessionPnl >= 0 ? '+' : '-'}${Math.abs(sessionPnl).toFixed(2)}
          </div>
        </div>
        <div className="rounded-2xl bg-zinc-900 p-4">
          <div className="text-zinc-400 text-xs">Projected Bankroll</div>
          <div className="mt-1 text-xl font-black text-cyan-200">${projectedBankroll.toFixed(2)}</div>
        </div>
      </div>

      <div className="rounded-3xl bg-zinc-900 p-5 mb-4">
        <div className="text-white font-bold mb-3">Log session (UI scaffold)</div>
        <div className="space-y-3">
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Session date</label>
            <input
              type="date"
              value={sessionDate}
              onChange={(e) => setSessionDate(e.target.value)}
              className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Starting bankroll</label>
            <input
              type="number"
              inputMode="decimal"
              value={bankrollStart}
              onChange={(e) => setBankrollStart(e.target.value)}
              className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Buy-in</label>
              <input
                type="number"
                inputMode="decimal"
                value={buyIn}
                onChange={(e) => setBuyIn(e.target.value)}
                className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
            <div>
              <label className="block text-zinc-400 text-xs mb-1">Cash-out</label>
              <input
                type="number"
                inputMode="decimal"
                value={cashOut}
                onChange={(e) => setCashOut(e.target.value)}
                className="w-full min-h-12 rounded-2xl bg-zinc-800 px-4 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              />
            </div>
          </div>
          <div>
            <label className="block text-zinc-400 text-xs mb-1">Session notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full min-h-24 rounded-2xl bg-zinc-800 px-4 py-3 text-white outline-none focus:ring-2 focus:ring-cyan-500/40"
              placeholder="Machine mix, promo used, notable hits..."
            />
          </div>
          <button
            type="button"
            className="w-full min-h-12 rounded-2xl bg-cyan-600 text-white font-bold touch-manipulation active:scale-[0.99]"
          >
            Save session (coming next)
          </button>
        </div>
      </div>

      <div className="rounded-3xl bg-zinc-900 p-5">
        <div className="text-white font-bold">Upcoming dashboard blocks</div>
        <div className="text-zinc-400 text-sm mt-2 leading-relaxed">
          Daily P/L graph, bankroll curve, game-level ROI, and promo-adjusted session analytics.
        </div>
      </div>
    </div>
  )
}
