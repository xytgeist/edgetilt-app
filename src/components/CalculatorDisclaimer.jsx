/**
 * Shared footnote for all calculators: expectations vs. real-world variance.
 */
export default function CalculatorDisclaimer({ className = '' }) {
  return (
    <footer
      className={`mt-10 pt-6 border-t border-zinc-800/80 text-center text-zinc-500 text-[13px] leading-relaxed max-w-2xl mx-auto px-0.5 ${className}`.trim()}
    >
      <p className="mb-2.5">
        Figures here reflect <span className="text-zinc-400 font-medium">long-run average expectations</span> over a
        very large sample of spins... similar in spirit to how theoretical payback is defined... not a prediction for any
        single session, visit, or short-term run.
      </p>
      <p className="mb-2.5">
        It is important to note that <span className="text-zinc-400 font-medium">math is math</span>: slot machines can
        run multiple percentage points higher or lower than their programmed RTP even over tens of millions of spins,
        depending on the volatility index of the game. Video poker can be solved precisely because it is a game of
        perfect information. Slots are games of varying degrees of imperfect information. Thus, despite tens of millions
        of observed spins and empirical data modeling, there is no guarantee of precise accuracy on any individual EV
        threshold or return estimate.
      </p>
      <p className="mb-2.5">
        Actual results can <span className="text-zinc-400 font-medium">differ widely</span> from these averages,
        including extended downswings or outlier jackpots, regardless of how favorable or unfavorable the numbers may
        look in theory.
      </p>
      <p className="text-zinc-600 text-xs leading-normal">
        For general information and education only. Not gambling, tax, or financial advice. Comply with applicable laws
        and only wager what you can afford to lose.
      </p>
    </footer>
  )
}
