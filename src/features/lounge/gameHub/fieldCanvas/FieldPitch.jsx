import { Text } from '@react-three/drei'
import { ENDZONE, FIELD_LEN, FIELD_THICK, FIELD_WID, PLAYING_LEN } from './constants.js'

function YardLines() {
  const lines = []
  // Every 5 yards across the 100-yard playing field (−10 … +10).
  for (let i = 0; i <= 20; i++) {
    const x = -PLAYING_LEN / 2 + i * (PLAYING_LEN / 20)
    const major = i % 2 === 0
    lines.push(
      <mesh key={`yl-${i}`} position={[x, FIELD_THICK / 2 + 0.01, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[major ? 0.06 : 0.035, FIELD_WID * 0.98]} />
        <meshBasicMaterial color="#f4f4f5" transparent opacity={major ? 0.9 : 0.55} />
      </mesh>,
    )
  }
  // Sideline rails
  for (const z of [-FIELD_WID / 2 + 0.04, FIELD_WID / 2 - 0.04]) {
    lines.push(
      <mesh key={`sl-${z}`} position={[0, FIELD_THICK / 2 + 0.01, z]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLAYING_LEN, 0.05]} />
        <meshBasicMaterial color="#f4f4f5" transparent opacity={0.85} />
      </mesh>,
    )
  }
  return <group>{lines}</group>
}

function YardNumbers() {
  const marks = [10, 20, 30, 40, 50, 40, 30, 20, 10]
  const xs = [-8, -6, -4, -2, 0, 2, 4, 6, 8]
  return (
    <group>
      {marks.map((n, i) => (
        <group key={`n-${i}`}>
          <Text
            position={[xs[i], FIELD_THICK / 2 + 0.02, -FIELD_WID / 2 + 1.1]}
            rotation={[-Math.PI / 2, 0, 0]}
            fontSize={0.55}
            color="#f4f4f5"
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.85}
          >
            {String(n)}
          </Text>
          <Text
            position={[xs[i], FIELD_THICK / 2 + 0.02, FIELD_WID / 2 - 1.1]}
            rotation={[-Math.PI / 2, 0, Math.PI]}
            fontSize={0.55}
            color="#f4f4f5"
            anchorX="center"
            anchorY="middle"
            fillOpacity={0.85}
          >
            {String(n)}
          </Text>
        </group>
      ))}
    </group>
  )
}

function Endzone({ side, color, label }) {
  const x = side === 'away' ? -(PLAYING_LEN / 2 + ENDZONE / 2) : PLAYING_LEN / 2 + ENDZONE / 2
  return (
    <group position={[x, 0, 0]}>
      <mesh position={[0, FIELD_THICK / 2 + 0.008, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[ENDZONE * 0.96, FIELD_WID * 0.96]} />
        <meshStandardMaterial color={color} roughness={0.85} metalness={0.05} />
      </mesh>
      <Text
        position={[0, FIELD_THICK / 2 + 0.03, 0]}
        rotation={[-Math.PI / 2, 0, side === 'away' ? Math.PI / 2 : -Math.PI / 2]}
        fontSize={1.1}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.92}
        outlineWidth={0.02}
        outlineColor="#000000"
      >
        {label}
      </Text>
    </group>
  )
}

/**
 * Thick turf slab with markings. Away endzone −X, home +X (matches left/right hero chrome).
 */
export default function FieldPitch({ awayColor, homeColor, awayAbbrev, homeAbbrev }) {
  return (
    <group>
      <mesh position={[0, 0, 0]} castShadow={false} receiveShadow={false}>
        <boxGeometry args={[FIELD_LEN, FIELD_THICK, FIELD_WID]} />
        <meshStandardMaterial color="#1a5c2e" roughness={0.92} metalness={0} />
      </mesh>
      {/* Slightly brighter playing surface strip */}
      <mesh position={[0, FIELD_THICK / 2 + 0.002, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[PLAYING_LEN, FIELD_WID * 0.98]} />
        <meshStandardMaterial color="#217a3c" roughness={0.9} metalness={0} />
      </mesh>
      <Endzone side="away" color={awayColor || '#7f1d1d'} label={String(awayAbbrev || 'AWAY').slice(0, 4)} />
      <Endzone side="home" color={homeColor || '#14532d'} label={String(homeAbbrev || 'HOME').slice(0, 4)} />
      <YardLines />
      <YardNumbers />
      {/* Midfield X accent (X-style) */}
      <Text
        position={[0, FIELD_THICK / 2 + 0.025, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        fontSize={1.4}
        color="#ffffff"
        anchorX="center"
        anchorY="middle"
        fillOpacity={0.35}
      >
        ×
      </Text>
    </group>
  )
}
