import { lazy, Suspense, useState } from 'react'
import ScrollLinkedEdgeTitleBarShell from '../../components/ScrollLinkedEdgeTitleBarShell.jsx'
import SlotsToolPageHeader from '../../components/SlotsToolPageHeader.jsx'
import NavLockGlyph from '../../components/NavLockGlyph.jsx'
import ContentAccessAdminSwitch from '../../components/ContentAccessAdminSwitch.jsx'
import {
  CALCULATOR_CATALOG,
  calculatorRequiresSlotsEdge,
  canOpenCalculator,
  showCalculatorLock,
} from './calculatorAccess.js'

const PhoenixLink = lazy(() => import('./games/PhoenixLink.jsx'))
const BuffaloLink = lazy(() => import('./games/BuffaloLink.jsx'))
const BuffaloDiamond = lazy(() => import('./games/BuffaloDiamond.jsx'))
const StackUpPays = lazy(() => import('./games/StackUpPays.jsx'))
const MHBCalculator = lazy(() => import('./games/MHBCalculator.jsx'))
const WheelOfFortuneCollectorsEdition = lazy(() => import('./games/WheelOfFortuneCollectorsEdition.jsx'))

function CalculatorLoadingFallback() {
  return (
    <div className="flex min-h-[50vh] w-full items-center justify-center text-zinc-500 text-[15px] px-4">
      Loading calculator…
    </div>
  )
}

function CalculatorsHome({
  onSelectCalculator,
  browseMode,
  onOpenAuth,
  hasSlotsEdge = false,
  isStaff = false,
  onRequireSubscribe,
  gatesMap = null,
  isAdmin = false,
  gatesDbReady = false,
  onSetContentGate,
}) {
  const access = { browseMode, isStaff, hasSlotsEdge, gatesMap }
  const [gateBusyKey, setGateBusyKey] = useState(null)

  const handleSelect = (key) => {
    if (browseMode !== 'member') {
      onOpenAuth?.()
      return
    }
    if (!canOpenCalculator(key, { isStaff, hasSlotsEdge, gatesMap })) {
      onRequireSubscribe?.('slots-edge')
      return
    }
    onSelectCalculator(key)
  }

  const handleAdminLockToggle = async (key, locked) => {
    if (!isAdmin || !gatesDbReady || !onSetContentGate) return
    setGateBusyKey(key)
    try {
      await onSetContentGate('calculator', key, locked)
    } finally {
      setGateBusyKey(null)
    }
  }

  return (
    <div className="w-full pt-2 sm:pt-3">
      {isAdmin && !gatesDbReady ? (
        <p className="mb-6 text-left text-xs text-fuchsia-300/90 sm:mb-8">
          Apply migration `20260526150000_content_access_gates.sql` to enable admin lock switches.
        </p>
      ) : null}

      {CALCULATOR_CATALOG.map((calc) => {
        const locked = showCalculatorLock(calc.key, access)
        const adminLocked = calculatorRequiresSlotsEdge(calc.key, gatesMap)
        return (
          <div key={calc.key} className="relative">
            {isAdmin ? (
              <div className="absolute right-3 top-3 z-10">
                <ContentAccessAdminSwitch
                  locked={adminLocked}
                  busy={gateBusyKey === calc.key}
                  disabled={!gatesDbReady}
                  label={`${calc.title} Slots Edge lock`}
                  onLockedChange={(nextLocked) => void handleAdminLockToggle(calc.key, nextLocked)}
                />
              </div>
            ) : null}
            <button
              type="button"
              title={locked ? 'Subscribe to unlock Slots Edge' : undefined}
              onClick={() => handleSelect(calc.key)}
              className={`calc-list-btn ${calc.buttonClassName}`}
            >
              {calc.iconWrapClassName?.includes('relative') ? (
                <div className={calc.iconWrapClassName}>
                  <img
                    src={calc.iconSrc}
                    alt={calc.iconAlt}
                    className={calc.iconImgClassName || 'h-full w-full object-cover object-center'}
                  />
                </div>
              ) : (
                <img src={calc.iconSrc} alt={calc.iconAlt} className={calc.iconWrapClassName} />
              )}
              <div className="min-w-0 flex-1 self-center">
                <div className="flex min-w-0 items-center gap-2">
                  <div className={`min-w-0 flex-1 ${calc.titleClassName}`}>{calc.title}</div>
                  {locked ? <NavLockGlyph className="h-4 w-4 shrink-0 text-amber-400/95" /> : null}
                </div>
                <p className={calc.subtitleClassName} title={calc.subtitleTitle || undefined}>
                  {calc.subtitle}
                </p>
              </div>
            </button>
          </div>
        )
      })}

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
  hasSlotsEdge = false,
  isStaff = false,
  onRequireSubscribe,
  gatesMap = null,
  isAdmin = false,
  gatesDbReady = false,
  onSetContentGate,
  titleBarNavSlot = null,
  titleBarToolCloseVisible = false,
  supabaseClient = null,
  onOpenLogbook = null,
  logPlayLocked = false,
  playLogsRemaining = null,
  freemiumUsageLoading = false,
}) {
  if (!activeCalculator) {
    return (
      <ScrollLinkedEdgeTitleBarShell
        titleBarNavSlot={titleBarNavSlot}
        titleBarToolCloseVisible={titleBarToolCloseVisible}
        contentClassName="px-3 pt-3 pb-[calc(6rem+env(safe-area-inset-bottom,0px))]"
      >
        <SlotsToolPageHeader quickLinkDestinationId="calculators" />
        <CalculatorsHome
          onSelectCalculator={setActiveCalculator}
          browseMode={browseMode}
          onOpenAuth={onOpenAuth}
          hasSlotsEdge={hasSlotsEdge}
          isStaff={isStaff}
          onRequireSubscribe={onRequireSubscribe}
          gatesMap={gatesMap}
          isAdmin={isAdmin}
          gatesDbReady={gatesDbReady}
          onSetContentGate={onSetContentGate}
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
          <PhoenixLink
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'buffalo-link' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <BuffaloLink
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'buffalo-diamond' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <BuffaloDiamond
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'stackup' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <StackUpPays
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'mhb' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <MHBCalculator
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
      {activeCalculator === 'wof-collectors-edition' ? (
        <ScrollLinkedEdgeTitleBarShell titleBarNavSlot={titleBarNavSlot} contentClassName="px-3 pt-3 pb-[calc(3rem+env(safe-area-inset-bottom,0px))]">
          <WheelOfFortuneCollectorsEdition
            onBack={() => setActiveCalculator(null)}
            supabaseClient={supabaseClient}
            onOpenLogbook={onOpenLogbook}
            logPlayLocked={logPlayLocked}
            onRequireSubscribe={onRequireSubscribe}
            playLogsRemaining={playLogsRemaining}
            freemiumUsageLoading={freemiumUsageLoading}
          />
        </ScrollLinkedEdgeTitleBarShell>
      ) : null}
    </Suspense>
  )
}
