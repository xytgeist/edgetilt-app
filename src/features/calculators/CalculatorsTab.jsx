import { lazy, Suspense } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'

const PhoenixLink = lazy(() => import('./games/PhoenixLink.jsx'))
const BuffaloLink = lazy(() => import('./games/BuffaloLink.jsx'))
const StackUpPays = lazy(() => import('./games/StackUpPays.jsx'))
const MHBCalculator = lazy(() => import('./games/MHBCalculator.jsx'))

function CalculatorLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center text-zinc-500 text-[15px] px-4">
      Loading calculator…
    </div>
  )
}

function CalculatorsHome({ onSelectCalculator, browseMode, onOpenAuth }) {
  return (
    <div className="w-full pt-2 sm:pt-3">
    <div className="mb-10 text-left sm:mb-12">
      <p className="text-base text-zinc-400">Select a calculator</p>
    </div>

    <button
      onClick={() => onSelectCalculator('phoenix')}
      className="w-full bg-gray-900 hover:bg-gray-800 transition-colors p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation active:scale-[0.99]"
    >
      <img src="/guides/phoenix-link/phoenix-link-calculator-icon.webp" alt="Phoenix" className="h-16 w-16 flex-shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1 self-center">
        <div className="line-clamp-2 font-semibold text-2xl leading-snug text-orange-400">Phoenix Link EV Calc</div>
        <p className="mt-0.5 line-clamp-1 text-base leading-snug text-gray-400 sm:line-clamp-2">
          Must-hit counter bonus analyzer
        </p>
      </div>
    </button>

    <button
      onClick={() => onSelectCalculator('buffalo')}
      className="mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-amber-700 via-orange-700 to-red-800 p-6 text-left ring-1 ring-orange-800/45 transition-all hover:from-amber-600 hover:via-orange-600 hover:to-red-700 hover:ring-orange-700/50 active:scale-[0.985] sm:gap-5 sm:p-8"
    >
      <div className="relative flex h-16 w-16 shrink-0 overflow-hidden rounded-2xl bg-gradient-to-br from-amber-600/90 to-orange-800 shadow-inner ring-1 ring-orange-900/45">
        <img
          src="/guides/buffalo-link/buffalo-link-calculator-icon.webp"
          alt="Buffalo"
          className="h-full w-full object-cover object-center"
        />
      </div>
      <div className="min-w-0 flex-1 self-center">
        <div className="line-clamp-2 text-2xl font-semibold leading-snug text-amber-100">Buffalo Link EV Calc</div>
        <p className="mt-0.5 line-clamp-1 text-base leading-snug text-amber-200/90 sm:line-clamp-2">
          Midpoint-based counter analyzer
        </p>
      </div>
    </button>

    <button
      onClick={() => onSelectCalculator('stackup')}
      className="w-full bg-gradient-to-br from-cyan-600 via-sky-600 to-blue-700 hover:from-cyan-500 hover:via-sky-500 hover:to-blue-600 p-6 sm:p-8 rounded-3xl text-left flex items-center gap-4 sm:gap-5 mb-4 min-h-[7rem] touch-manipulation transition-all active:scale-[0.985]"
    >
      <img src="/guides/stack-up-pays/stack-up-pays-calculator-icon.webp" alt="Stack Up Pays" className="h-16 w-16 flex-shrink-0 rounded-2xl object-cover shadow-lg" />
      <div className="min-w-0 flex-1 self-center">
        <div className="line-clamp-2 font-semibold text-2xl leading-snug text-cyan-100">Stack Up Pays</div>
        <p
          className="mt-0.5 line-clamp-1 text-base leading-snug text-cyan-200 sm:line-clamp-2"
          title="Ascending Fortunes • 5-meter analyzer"
        >
          Ascending Fortunes • 5-meter analyzer
        </p>
      </div>
    </button>

    <button
      onClick={() => onSelectCalculator('mhb')}
      className="mb-4 flex min-h-[7rem] w-full touch-manipulation items-center gap-4 rounded-3xl bg-gradient-to-br from-indigo-700 via-violet-700 to-cyan-700 p-6 text-left shadow-lg shadow-black/30 transition-all hover:from-indigo-600 hover:via-violet-600 hover:to-cyan-600 active:scale-[0.985] sm:gap-5 sm:p-8"
    >
      <img
        src="/guides/mhb/mhb-calculator-icon.webp"
        alt=""
        className="h-16 w-16 shrink-0 rounded-2xl object-cover shadow-lg"
      />
      <div className="min-w-0 flex-1 self-center">
        <div className="line-clamp-2 text-2xl font-semibold leading-snug text-violet-50">Must Hit By Jackpot</div>
        <p className="mt-0.5 line-clamp-1 text-base leading-snug text-cyan-100/95 sm:line-clamp-2">
          Progressive must-hit analyzer
        </p>
      </div>
    </button>

    {browseMode !== 'member' ? (
      <div className="mt-10 sm:mt-12 flex flex-col items-center gap-2 text-center">
        <button
          type="button"
          onClick={onOpenAuth}
          className="min-h-12 inline-flex items-center justify-center text-base text-cyan-400 hover:text-cyan-300 underline touch-manipulation transition-colors px-4 py-2"
        >
          Log in or create account
        </button>
      </div>
    ) : null}
  </div>
  )
}

export default function CalculatorsTab({
  activeCalculator,
  setActiveCalculator,
  browseMode,
  onOpenAuth,
  titleBarNavSlot = null,
}) {
  if (!activeCalculator) {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        contentClassName="px-3 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <CalculatorsHome
          onSelectCalculator={setActiveCalculator}
          browseMode={browseMode}
          onOpenAuth={onOpenAuth}
        />
      </ScrollLinkedEdgeTitleBarShell>
    )
  }
  return (
    <Suspense
      fallback={
        <ScrollLinkedEdgeTitleBarShell
          titleBarNavSlot={titleBarNavSlot}
          contentClassName="px-3 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
        >
          <CalculatorLoadingFallback />
        </ScrollLinkedEdgeTitleBarShell>
      }
    >
      {activeCalculator === 'phoenix' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <PhoenixLink onBack={() => setActiveCalculator(null)} />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'buffalo' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <BuffaloLink onBack={() => setActiveCalculator(null)} />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'stackup' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <StackUpPays onBack={() => setActiveCalculator(null)} />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'mhb' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <MHBCalculator onBack={() => setActiveCalculator(null)} />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
    </Suspense>
  )
}
