import LoungeDockMenuLayoutHelp from './LoungeDockMenuLayoutHelp.jsx'

/** One-time first menu open - pick Wheel or Edge to dismiss (no backdrop / Got it escape hatch). */
export default function LoungeDockMenuLayoutIntroOverlay({ dockMenuLayout, onChooseLayout }) {
  return (
    <div
      className="pointer-events-auto fixed inset-0 z-[230] flex items-center justify-center bg-black/55 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-labelledby="lounge-dock-menu-layout-intro-title"
    >
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-cyan-500/35 bg-zinc-950/98 px-5 py-5 shadow-2xl backdrop-blur-md">
        <LoungeDockMenuLayoutHelp
          embedded
          dockMenuLayout={dockMenuLayout}
          onDockMenuLayoutChange={onChooseLayout}
        />
      </div>
    </div>
  )
}
