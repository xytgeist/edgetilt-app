/**
 * Shared footnote for all calculators: expectations vs. real-world variance.
 */
export default function CalculatorDisclaimer({ className = '' }) {
  return (
    <footer
      className={`mt-10 pt-6 border-t border-zinc-800/80 text-center text-zinc-500 text-[13px] leading-relaxed max-w-2xl mx-auto px-0.5 ${className}`.trim()}
    >
      <p className="mb-2.5">
        Figures here reflect <span className="text-zinc-400">long-run average expectations</span> over a very large
        number of spins - similar in spirit to how theoretical payback is defined - not a prediction for any single session,
        visit, or sample of play.
      </p>
      <p className="mb-2.5">
        Actual results can <span className="text-zinc-400">differ widely</span> from these averages, including
        large wins or losses, regardless of how favorable or unfavorable the numbers may look in theory.
      </p>
      <p className="text-zinc-600 text-xs leading-normal">
        For general information and education only. Not gambling, tax, or financial advice. Comply with applicable laws
        and only wager what you can afford to lose.
      </p>
    </footer>
  )
}
