import { Canvas, useThree } from '@react-three/fiber'
import { Suspense, useEffect, useMemo, useState } from 'react'
import ColiseumBowl from './fieldCanvas/ColiseumBowl.jsx'
import CrowdInstances from './fieldCanvas/CrowdInstances.jsx'
import FieldPitch from './fieldCanvas/FieldPitch.jsx'
import Goalposts from './fieldCanvas/Goalposts.jsx'
import GameHubFieldFallback from './GameHubFieldFallback.jsx'

function webglAvailable() {
  try {
    const canvas = document.createElement('canvas')
    return Boolean(
      canvas.getContext('webgl2') ||
        canvas.getContext('webgl') ||
        canvas.getContext('experimental-webgl'),
    )
  } catch {
    return false
  }
}

function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== 'undefined'
      ? window.matchMedia('(prefers-reduced-motion: reduce)').matches
      : false,
  )
  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const onChange = () => setReduced(mq.matches)
    mq.addEventListener?.('change', onChange)
    return () => mq.removeEventListener?.('change', onChange)
  }, [])
  return reduced
}

/** One paint when frameloop is `demand` (reduced motion). */
function InvalidateOnce() {
  const invalidate = useThree((s) => s.invalidate)
  useEffect(() => {
    invalidate()
  }, [invalidate])
  return null
}

function StadiumScene({
  awayColor,
  homeColor,
  homeSecondary,
  awayAbbrev,
  homeAbbrev,
  reducedMotion,
}) {
  return (
    <>
      {reducedMotion ? <InvalidateOnce /> : null}
      <color attach="background" args={['#050508']} />
      <ambientLight intensity={0.35} />
      <directionalLight position={[8, 18, 6]} intensity={1.35} color="#fff7e6" />
      <directionalLight position={[-6, 8, -4]} intensity={0.35} color="#93c5fd" />
      <spotLight position={[0, 22, 0]} angle={0.55} penumbra={0.6} intensity={1.1} color="#ffffff" />
      <FieldPitch
        awayColor={awayColor}
        homeColor={homeColor}
        awayAbbrev={awayAbbrev}
        homeAbbrev={homeAbbrev}
      />
      <Goalposts />
      <ColiseumBowl />
      <CrowdInstances
        homeColor={homeColor}
        homeSecondary={homeSecondary}
        awayColor={awayColor}
        count={reducedMotion ? 1600 : 2800}
      />
    </>
  )
}

/**
 * Phase-1 NFL hub field: isometric turf inside a Lambeau-style coliseum bowl.
 * Lazy-loaded from GameHubHero so the Lounge feed never pays for Three.js.
 */
export default function GameHubFieldCanvas({ game, awayColor, homeColor }) {
  const reducedMotion = usePrefersReducedMotion()
  const [glOk, setGlOk] = useState(true)

  useEffect(() => {
    setGlOk(webglAvailable())
  }, [])

  const homeSecondary = useMemo(() => {
    const c2 = String(game?.home?.color2 || '').trim()
    return c2 || null
  }, [game?.home?.color2])

  if (!glOk) {
    return <GameHubFieldFallback game={game} awayColor={awayColor} homeColor={homeColor} />
  }

  return (
    <div data-lounge-game-field data-lounge-game-field-canvas className="relative px-3 pb-3 pt-1">
      <div
        className="pointer-events-none absolute inset-x-3 inset-y-1 rounded-2xl opacity-80"
        style={{
          background: `radial-gradient(ellipse 55% 80% at 12% 50%, ${awayColor || '#7f1d1d'}66, transparent 70%), radial-gradient(ellipse 55% 80% at 88% 50%, ${homeColor || '#14532d'}66, transparent 70%)`,
        }}
        aria-hidden="true"
      />
      <div className="relative h-[240px] overflow-hidden rounded-2xl border border-white/10 bg-zinc-950/80 shadow-inner sm:h-[260px]">
        <Canvas
          dpr={[1, 2]}
          gl={{ antialias: true, alpha: true, powerPreference: 'high-performance' }}
          camera={{
            position: [18, 14, 16],
            fov: 32,
            near: 0.1,
            far: 120,
          }}
          onCreated={({ camera, gl }) => {
            camera.lookAt(0, 1.2, 0)
            gl.setClearColor(0x000000, 0)
          }}
          frameloop={reducedMotion ? 'demand' : 'always'}
          style={{ width: '100%', height: '100%' }}
        >
          <Suspense fallback={null}>
            <StadiumScene
              awayColor={awayColor}
              homeColor={homeColor}
              homeSecondary={homeSecondary}
              awayAbbrev={game?.away?.abbrev}
              homeAbbrev={game?.home?.abbrev}
              reducedMotion={reducedMotion}
            />
          </Suspense>
        </Canvas>
      </div>
    </div>
  )
}
