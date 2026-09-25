import { BOWL_INNER_LEN, BOWL_INNER_WID } from './constants.js'

/**
 * Continuous seating rings around the field (Lambeau-style bowl).
 * Rounded-rect rings via many short box segments along the perimeter.
 */
export default function ColiseumBowl() {
  const tiers = 7
  const rings = []
  for (let t = 0; t < tiers; t++) {
    const inset = t * 0.55
    const len = BOWL_INNER_LEN + 1.6 + inset * 2
    const wid = BOWL_INNER_WID + 1.6 + inset * 2
    const y = 0.15 + t * 0.42
    const thick = 0.38
    const depth = 0.5
    const shade = 0.12 + t * 0.04
    const color = `rgb(${18 + shade * 40}, ${18 + shade * 40}, ${22 + shade * 45})`

    // Four walls of the ring
    rings.push(
      <group key={`tier-${t}`}>
        {/* Long sides (±Z) */}
        <mesh position={[0, y, wid / 2]} rotation={[0.12, 0, 0]}>
          <boxGeometry args={[len, thick, depth]} />
          <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[0, y, -wid / 2]} rotation={[-0.12, 0, 0]}>
          <boxGeometry args={[len, thick, depth]} />
          <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
        </mesh>
        {/* Short sides (±X) */}
        <mesh position={[len / 2, y, 0]} rotation={[0, 0, -0.12]}>
          <boxGeometry args={[depth, thick, wid]} />
          <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
        </mesh>
        <mesh position={[-len / 2, y, 0]} rotation={[0, 0, 0.12]}>
          <boxGeometry args={[depth, thick, wid]} />
          <meshStandardMaterial color={color} roughness={0.95} metalness={0} />
        </mesh>
      </group>,
    )
  }

  // Dark apron between field and first seating ring
  return (
    <group>
      <mesh position={[0, -0.05, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[BOWL_INNER_LEN + 0.4, BOWL_INNER_WID + 0.4]} />
        <meshStandardMaterial color="#1c1c1f" roughness={1} metalness={0} />
      </mesh>
      {rings}
    </group>
  )
}
