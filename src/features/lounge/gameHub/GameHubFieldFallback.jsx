/** Slim CSS stub when WebGL is unavailable or the Three.js chunk is still loading. */
export default function GameHubFieldFallback({ game, awayColor, homeColor }) {
  return (
    <div data-lounge-game-field data-lounge-game-field-fallback className="px-4 pb-3 pt-1">
      <div
        className="relative h-[64px] overflow-hidden rounded-2xl border border-white/10 shadow-inner"
        style={{
          background: `linear-gradient(90deg, ${awayColor || '#7f1d1d'}55, #14532dcc 35%, #14532dcc 65%, ${homeColor || '#14532d'}55)`,
        }}
      >
        <div
          className="pointer-events-none absolute inset-0 opacity-40"
          style={{
            backgroundImage:
              'repeating-linear-gradient(90deg, transparent, transparent 9.5%, rgba(255,255,255,0.08) 9.5%, rgba(255,255,255,0.08) 10%)',
          }}
        />
        <span className="absolute left-2 top-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">
          {game?.away?.abbrev}
        </span>
        <span className="absolute right-2 top-1.5 text-[10px] font-bold uppercase tracking-wide text-white/85">
          {game?.home?.abbrev}
        </span>
      </div>
    </div>
  )
}
