import { useEffect } from 'react'

/** Full-screen blur over the public site while Sharpe Syndicate is not open yet. /ops never renders this. */
export function SyndicateComingSoon() {
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [])

  return (
    <div
      data-syndicate-coming-soon
      role="dialog"
      aria-modal="true"
      aria-label="Sharpe Syndicate is coming soon"
      className="fixed inset-0 z-[200] flex items-center justify-center bg-zinc-950/60 px-6 backdrop-blur-xl"
    >
      <div className="flex flex-col items-center text-center">
        <img
          src="/syndicate/mark.png"
          alt=""
          width={72}
          height={72}
          className="h-[72px] w-[72px] object-contain"
          decoding="async"
        />
        <div className="mt-4 text-2xl font-extrabold tracking-tight text-white sm:text-3xl">Sharpe Syndicate</div>
        <div className="mt-2 font-mono text-xs font-bold uppercase tracking-[0.3em] text-emerald-400">Coming soon</div>
      </div>
    </div>
  )
}
