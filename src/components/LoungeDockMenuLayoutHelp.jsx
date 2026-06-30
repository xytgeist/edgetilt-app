/** Inline Settings help + first-run intro - Wheel vs Edge schematics (selectable) + move FAB copy. */

export default function LoungeDockMenuLayoutHelp({

  dockMenuLayout = 'wheel',

  onDockMenuLayoutChange,

  /** When true, render inside the first-run modal shell (no inner card border). */

  embedded = false,

}) {

  const wheelCx = 40

  const wheelCy = 40

  const edgeFabCx = 22

  const edgeFabCy = 40

  const wheelR = 22

  const fabPlusTextProps = (cx, cy) => ({

    x: cx,

    y: cy,

    dy: '-0.7',

    textAnchor: 'middle',

    dominantBaseline: 'central',

    fontSize: 13,

    fill: 'white',

    fontWeight: 600,

    style: { fontFamily: 'ui-sans-serif, system-ui, sans-serif' },

  })

  const wheelDots = 7

  const wheelDotEls = Array.from({ length: wheelDots }, (_, i) => {

    const a = (i / wheelDots) * Math.PI * 2 - Math.PI / 2

    const x = wheelCx + wheelR * Math.cos(a)

    const y = wheelCy + wheelR * Math.sin(a)

    return <circle key={i} cx={x} cy={y} r="3.6" fill="currentColor" opacity="0.55" />

  })



  const layoutOptionClass = (selected) =>

    `rounded-xl border p-2.5 text-left touch-manipulation [-webkit-tap-highlight-color:transparent] transition-[border-color,background-color,box-shadow] ${

      selected

        ? 'border-lv-blue/90 bg-[#001828]/95 shadow-[0_0_14px_rgba(6,206,252,0.35)]'

        : 'border-zinc-700/70 bg-zinc-900/70 hover:bg-zinc-900/90'

    }`



  const TitleTag = embedded ? 'h2' : 'h4'

  const titleClass = embedded

    ? 'text-lg font-bold leading-snug text-white'

    : 'text-[14px] font-semibold text-zinc-100'

  const titleId = embedded ? 'lounge-dock-menu-layout-intro-title' : undefined

  const moveCopyClass = embedded

    ? 'mt-3 text-[15px] leading-relaxed text-zinc-300'

    : 'mt-2 text-[13px] leading-relaxed text-zinc-400'

  const layoutCopyClass = embedded

    ? 'mt-3 text-[13px] leading-relaxed text-zinc-400'

    : 'mt-2 text-[12px] leading-relaxed text-zinc-500'



  return (

    <div

      className={

        embedded ? '' : 'rounded-lg border border-zinc-800/90 bg-zinc-950/50 px-3.5 py-3'

      }

    >

      <TitleTag id={titleId} className={titleClass}>

        Move the menu button

      </TitleTag>

      <p className={moveCopyClass}>

        Press and hold the <span className="font-semibold text-cyan-200/95">Menu (+)</span> button until the button

        animates, then drag it anywhere on the screen. Release to drop it where it&apos;s most comfortable.

      </p>

      <p className={layoutCopyClass}>

        {embedded ? (

          <>

            Choose a layout to continue. <span className="font-semibold text-zinc-200">Wheel (O)</span> puts shortcuts
            in a ring around the button. <span className="font-semibold text-zinc-200">Edge (L)</span> snaps to a bottom
            corner. Change anytime in Settings.

          </>

        ) : (

          <>

            Tap a layout below. <span className="font-semibold text-zinc-300">Wheel (O)</span> puts shortcuts in a ring

            around the button. <span className="font-semibold text-zinc-300">Edge (L)</span> snaps to a bottom corner.

          </>

        )}

      </p>

      <div

        className="mt-3 grid grid-cols-2 gap-2"

        role="group"

        aria-label="Menu button layout"

      >

        <button

          type="button"

          aria-pressed={dockMenuLayout === 'wheel'}

          onClick={() => onDockMenuLayoutChange?.('wheel')}

          className={layoutOptionClass(dockMenuLayout === 'wheel')}

        >

          <span className="mb-1 block text-center text-[11px] font-semibold text-cyan-200/95">Wheel (O)</span>

          <svg viewBox="0 0 80 80" className="mx-auto aspect-square w-full max-w-[108px] text-lv-blue/85">

            <circle

              cx={wheelCx}

              cy={wheelCy}

              r={wheelR}

              fill="none"

              stroke="currentColor"

              strokeWidth="1.25"

              strokeDasharray="3 3"

              opacity="0.5"

            />

            {wheelDotEls}

            <circle cx={wheelCx} cy={wheelCy} r="9" fill="#057698" stroke="#06cefc" strokeWidth="1" />

            <text {...fabPlusTextProps(wheelCx, wheelCy)}>+</text>

          </svg>

          <p className="mt-1 text-center text-[10px] leading-snug text-zinc-500">

            Shortcuts in a full ring; drag the ring to rotate.

          </p>

        </button>

        <button

          type="button"

          aria-pressed={dockMenuLayout === 'cornerL'}

          onClick={() => onDockMenuLayoutChange?.('cornerL')}

          className={layoutOptionClass(dockMenuLayout === 'cornerL')}

        >

          <span className="mb-1 block text-center text-[11px] font-semibold text-cyan-200/95">Edge (L)</span>

          <svg viewBox="0 0 80 80" className="mx-auto aspect-square w-full max-w-[108px] text-lv-blue/85">

            <path

              d={`M ${edgeFabCx} 14 V 52 H 58`}

              fill="none"

              stroke="currentColor"

              strokeWidth="1.35"

              strokeLinecap="round"

              strokeLinejoin="round"

              strokeDasharray="3 3"

              opacity="0.5"

            />

            <circle cx={edgeFabCx} cy="34" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx={edgeFabCx} cy="24" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx={edgeFabCx} cy="14" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx={edgeFabCx} cy="52" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx="34" cy="52" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx="46" cy="52" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx="58" cy="52" r="3.6" fill="currentColor" opacity="0.55" />

            <circle cx={edgeFabCx} cy={edgeFabCy} r="9" fill="#057698" stroke="#06cefc" strokeWidth="1" />

            <text {...fabPlusTextProps(edgeFabCx, edgeFabCy)}>+</text>

          </svg>

          <p className="mt-1 text-center text-[10px] leading-snug text-zinc-500">

            Snaps to a corner; icons run along bottom + side.

          </p>

        </button>

      </div>

    </div>

  )

}


