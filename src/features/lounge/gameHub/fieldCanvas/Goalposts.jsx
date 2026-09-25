import { ENDZONE, FIELD_THICK, FIELD_WID, PLAYING_LEN } from './constants.js'

function Upright({ x }) {
  const postY = FIELD_THICK / 2 + 1.15
  const crossY = FIELD_THICK / 2 + 1.85
  const half = FIELD_WID * 0.18
  return (
    <group position={[x, 0, 0]}>
      {/* Ground stem */}
      <mesh position={[0, postY / 2, 0]}>
        <boxGeometry args={[0.08, postY, 0.08]} />
        <meshStandardMaterial color="#facc15" roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Crossbar */}
      <mesh position={[0, crossY, 0]}>
        <boxGeometry args={[0.08, 0.08, half * 2]} />
        <meshStandardMaterial color="#facc15" roughness={0.35} metalness={0.4} />
      </mesh>
      {/* Uprights */}
      <mesh position={[0, crossY + 0.7, -half]}>
        <boxGeometry args={[0.07, 1.4, 0.07]} />
        <meshStandardMaterial color="#facc15" roughness={0.35} metalness={0.4} />
      </mesh>
      <mesh position={[0, crossY + 0.7, half]}>
        <boxGeometry args={[0.07, 1.4, 0.07]} />
        <meshStandardMaterial color="#facc15" roughness={0.35} metalness={0.4} />
      </mesh>
    </group>
  )
}

export default function Goalposts() {
  const awayX = -(PLAYING_LEN / 2 + ENDZONE) + 0.15
  const homeX = PLAYING_LEN / 2 + ENDZONE - 0.15
  return (
    <group>
      <Upright x={awayX} />
      <Upright x={homeX} />
    </group>
  )
}
