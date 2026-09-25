import { useLayoutEffect, useMemo, useRef } from 'react'
import * as THREE from 'three'
import { BOWL_INNER_LEN, BOWL_INNER_WID } from './constants.js'

function pickFanColor(rand, homePrimary, homeSecondary, awayPrimary) {
  const r = rand()
  if (r < 0.12) return awayPrimary
  if (r < 0.22 && homeSecondary) return homeSecondary
  return homePrimary
}

function mulberry32(seed) {
  let a = seed >>> 0
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Packed crowd as colored capsules on seating rings.
 * ~85% home primary, ~10% home secondary, ~5–15% away.
 */
export default function CrowdInstances({
  homeColor = '#203731',
  homeSecondary = '#FFB612',
  awayColor = '#A71930',
  count = 2800,
}) {
  const meshRef = useRef(null)
  const colorAttr = useMemo(() => new Float32Array(count * 3), [count])
  const dummy = useMemo(() => new THREE.Object3D(), [])
  const color = useMemo(() => new THREE.Color(), [])

  const layout = useMemo(() => {
    const rand = mulberry32(0xc015e7)
    const seats = []
    const tiers = 7
    for (let t = 0; t < tiers; t++) {
      const inset = t * 0.55
      const len = BOWL_INNER_LEN + 1.6 + inset * 2
      const wid = BOWL_INNER_WID + 1.6 + inset * 2
      const y = 0.35 + t * 0.42
      const perSideLong = Math.floor(28 + t * 4)
      const perSideShort = Math.floor(14 + t * 2)
      // Long sides
      for (const zSign of [1, -1]) {
        for (let i = 0; i < perSideLong; i++) {
          const u = (i + 0.5) / perSideLong
          const x = (u - 0.5) * (len - 0.8)
          const z = zSign * (wid / 2 + (rand() - 0.5) * 0.15)
          seats.push({ x, y: y + (rand() - 0.5) * 0.08, z, s: 0.85 + rand() * 0.35 })
        }
      }
      // Short sides
      for (const xSign of [1, -1]) {
        for (let i = 0; i < perSideShort; i++) {
          const u = (i + 0.5) / perSideShort
          const z = (u - 0.5) * (wid - 0.8)
          const x = xSign * (len / 2 + (rand() - 0.5) * 0.15)
          seats.push({ x, y: y + (rand() - 0.5) * 0.08, z, s: 0.85 + rand() * 0.35 })
        }
      }
    }
    // Trim / pad to count
    while (seats.length > count) seats.pop()
    while (seats.length < count) {
      const s = seats[Math.floor(rand() * Math.max(1, seats.length))] || { x: 0, y: 1, z: 0, s: 1 }
      seats.push({
        x: s.x + (rand() - 0.5) * 0.3,
        y: s.y + (rand() - 0.5) * 0.05,
        z: s.z + (rand() - 0.5) * 0.3,
        s: 0.8 + rand() * 0.4,
      })
    }
    return seats
  }, [count])

  useLayoutEffect(() => {
    const mesh = meshRef.current
    if (!mesh) return
    const rand = mulberry32(0xfa15e7)
    for (let i = 0; i < layout.length; i++) {
      const seat = layout[i]
      dummy.position.set(seat.x, seat.y, seat.z)
      dummy.scale.set(seat.s * 0.22, seat.s * 0.45, seat.s * 0.22)
      dummy.rotation.set(0, rand() * Math.PI * 2, 0)
      dummy.updateMatrix()
      mesh.setMatrixAt(i, dummy.matrix)
      color.set(pickFanColor(rand, homeColor, homeSecondary, awayColor))
      color.toArray(colorAttr, i * 3)
    }
    mesh.instanceMatrix.needsUpdate = true
    const attr = mesh.geometry.getAttribute('color')
    if (attr) {
      attr.needsUpdate = true
    } else {
      mesh.geometry.setAttribute('color', new THREE.InstancedBufferAttribute(colorAttr, 3))
    }
  }, [layout, homeColor, homeSecondary, awayColor, colorAttr, dummy, color])

  return (
    <instancedMesh ref={meshRef} args={[undefined, undefined, count]} frustumCulled={false}>
      <capsuleGeometry args={[0.35, 0.55, 3, 6]} />
      <meshStandardMaterial vertexColors roughness={0.85} metalness={0} />
    </instancedMesh>
  )
}
