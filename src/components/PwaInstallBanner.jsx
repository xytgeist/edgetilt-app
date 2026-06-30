import { useCallback, useEffect, useRef, useState } from 'react'
import {
  isIosDevice,
  isSafariBrowser,
  isStandalonePwa,
  pwaInstallBannerSteps,
  shouldShowPwaInstallBanner,
} from '../utils/pwaNotificationPrompt.js'

const PWA_IOS_SETUP_IMAGE = '/onboarding/ios-setup.png'

function IosShareIcon({ className = 'h-[1.1em] w-[1.1em] inline-block align-[-0.15em] mx-0.5' }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
      aria-hidden
    >
      <path
        d="M12 3v10.2M12 3l3.5 3.5M12 3 8.5 6.5"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M5 14v4.5A2.5 2.5 0 0 0 7.5 21h9A2.5 2.5 0 0 0 19 18.5V14"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
      />
    </svg>
  )
}

function PwaInstallHelpDropPanel({
  open,
  onClose,
  steps,
  showIosSetupImage,
  onNativeInstall,
  nativeInstallReady,
}) {
  if (!open) return null

  return (
    <div
      id="pwa-install-drop-panel"
      data-pwa-install-drop-panel
      className="pwa-install-drop-panel absolute left-0 right-0 top-full z-[60] flex max-h-[min(85dvh,calc(100dvh-env(safe-area-inset-top)-2.5rem))] w-full flex-col overflow-hidden border-t border-b border-zinc-800/90 bg-zinc-950/98 shadow-[0_10px_28px_rgba(0,0,0,0.35)] backdrop-blur supports-[backdrop-filter]:bg-zinc-950/92"
      role="region"
      aria-labelledby="pwa-install-drop-title"
    >
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 py-3">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 id="pwa-install-drop-title" className="text-[15px] font-bold text-white">
              Install Edge
            </h2>
            <p className="mt-1 text-[13px] leading-relaxed text-zinc-400">
              Install to your home screen for quick access and push notifications.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-zinc-400 touch-manipulation hover:bg-zinc-800 hover:text-zinc-200 [-webkit-tap-highlight-color:transparent]"
            aria-label="Close install instructions"
          >
            <span aria-hidden className="text-xl leading-none">
              ×
            </span>
          </button>
        </div>

        {nativeInstallReady ? (
          <button
            type="button"
            onClick={() => void onNativeInstall?.()}
            className="mt-3 min-h-10 w-full rounded-xl border border-cyan-400/45 bg-cyan-600 px-3 text-[13px] font-semibold text-white touch-manipulation hover:bg-cyan-500 [-webkit-tap-highlight-color:transparent]"
          >
            Install app
          </button>
        ) : null}

        <ol className="mt-3 space-y-2 text-[13px] leading-relaxed text-zinc-200">
          {steps.map((step, index) => (
            <li key={step.id} className="flex gap-2">
              <span className="w-4 shrink-0 tabular-nums text-zinc-500">{index + 1}.</span>
              <span>
                {step.lead ? `${step.lead} ` : null}
                {step.showShareIcon ? <IosShareIcon /> : null}
                <span className="font-semibold text-zinc-50">{step.emphasis}</span>
                {step.tail ? ` ${step.tail}` : null}
              </span>
            </li>
          ))}
        </ol>

        {showIosSetupImage ? (
          <div className="mt-3 flex justify-center rounded-2xl border border-zinc-700/70 bg-zinc-900/60 p-2">
            <img
              src={PWA_IOS_SETUP_IMAGE}
              alt="iPhone Share menu and Add to Home Screen steps"
              className="max-h-[min(28dvh,168px)] w-full max-w-[240px] rounded-xl object-contain"
              loading="lazy"
            />
          </div>
        ) : null}
      </div>

      <div className="shrink-0 border-t border-zinc-800/90 px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <button
          type="button"
          onClick={onClose}
          className="min-h-10 w-full rounded-xl bg-orange-600 text-[14px] font-semibold text-white touch-manipulation hover:bg-orange-500 active:bg-orange-700 [-webkit-tap-highlight-color:transparent]"
        >
          Got it
        </button>
      </div>
    </div>
  )
}

/**
 * Title bar row: logo | install chip | nav - install help panel overlays feed below the row.
 */
export default function PwaInstallTitleBarRow({ logo, navSlot, rowClassName = 'px-3 py-2' }) {
  const deferredPromptRef = useRef(null)
  const [visible, setVisible] = useState(() => shouldShowPwaInstallBanner())
  const [panelOpen, setPanelOpen] = useState(false)
  const [nativeInstallReady, setNativeInstallReady] = useState(false)
  const safari = isSafariBrowser()
  const steps = pwaInstallBannerSteps(safari)
  const showIosSetupImage = isIosDevice()

  useEffect(() => {
    const syncVisible = () => {
      setVisible(shouldShowPwaInstallBanner())
      if (isStandalonePwa()) setPanelOpen(false)
    }
    syncVisible()
    const mq = window.matchMedia?.('(display-mode: standalone)')
    mq?.addEventListener?.('change', syncVisible)
    return () => mq?.removeEventListener?.('change', syncVisible)
  }, [])

  useEffect(() => {
    const onBeforeInstallPrompt = (event) => {
      event.preventDefault()
      deferredPromptRef.current = event
      setNativeInstallReady(true)
    }
    const onAppInstalled = () => {
      deferredPromptRef.current = null
      setNativeInstallReady(false)
      setVisible(false)
      setPanelOpen(false)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    window.addEventListener('appinstalled', onAppInstalled)
    return () => {
      window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
      window.removeEventListener('appinstalled', onAppInstalled)
    }
  }, [])

  const onNativeInstall = useCallback(async () => {
    const deferred = deferredPromptRef.current
    if (!deferred) return
    try {
      await deferred.prompt()
      const { outcome } = await deferred.userChoice
      if (outcome === 'accepted') {
        deferredPromptRef.current = null
        setNativeInstallReady(false)
        setPanelOpen(false)
      }
    } catch {
      /* keep panel open */
    }
  }, [])

  const chipLabel = 'How to Install'

  const installChip = (
    <button
      type="button"
      onClick={() => setPanelOpen((open) => !open)}
      data-pwa-install-title-chip
      aria-expanded={panelOpen}
      aria-controls="pwa-install-drop-panel"
      className={`flex max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-xl border px-2.5 py-1.5 text-[12px] font-semibold leading-snug shadow-sm touch-manipulation [-webkit-tap-highlight-color:transparent] ${
        panelOpen
          ? 'border-cyan-400/70 bg-cyan-900/80 text-cyan-50'
          : 'border-cyan-500/45 bg-cyan-950/70 text-cyan-100 hover:border-cyan-400/55 hover:bg-cyan-900/70 active:bg-cyan-900/90'
      }`}
      aria-label={`${chipLabel}. ${panelOpen ? 'Close' : 'Open'} install instructions.`}
    >
      <img
        src="/apple-touch-icon.png"
        alt=""
        width={18}
        height={18}
        className="h-[18px] w-[18px] shrink-0 rounded-[5px]"
        loading="lazy"
      />
      <span className="whitespace-nowrap">{chipLabel}</span>
    </button>
  )

  if (!visible) {
    return (
      <div className={`flex items-center justify-between gap-3 ${rowClassName}`}>
        {logo}
        <div className="flex min-w-0 shrink-0 items-center justify-end gap-2">{navSlot}</div>
      </div>
    )
  }

  return (
    <div className="relative" data-pwa-install-title-row-wrap>
      <div
        className={`grid grid-cols-[1fr_auto_1fr] items-center gap-x-2 ${rowClassName}`}
        data-pwa-install-title-row
      >
        <div className="min-w-0 justify-self-start">{logo}</div>
        {installChip}
        <div className="flex min-w-0 items-center justify-end gap-2 justify-self-end">{navSlot}</div>
      </div>

      <PwaInstallHelpDropPanel
        open={panelOpen}
        onClose={() => setPanelOpen(false)}
        steps={steps}
        showIosSetupImage={showIosSetupImage}
        onNativeInstall={onNativeInstall}
        nativeInstallReady={nativeInstallReady}
      />
    </div>
  )
}
