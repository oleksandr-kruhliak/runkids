import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

// Stylized sky backdrop: a gradient dome, a soft sun, and slowly drifting
// puffy clouds. Everything ignores fog so the horizon stays crisp; the scene
// fog colour should match HORIZON so ground and sky blend.
export const SKY_HORIZON = '#e6f4fe'

const VERT = /* glsl */ `
  varying vec3 vPos;
  void main() {
    vPos = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

const FRAG = /* glsl */ `
  varying vec3 vPos;
  uniform vec3 zenith;
  uniform vec3 mid;
  uniform vec3 horizon;
  void main() {
    float h = clamp(normalize(vPos).y, 0.0, 1.0);
    // Blend horizon -> mid low in the sky, mid -> zenith higher up.
    vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
    col = mix(col, zenith, smoothstep(0.22, 0.75, h));
    gl_FragColor = vec4(col, 1.0);
  }
`

function Dome({ zenith, mid, horizon }: { zenith: string; mid: string; horizon: string }) {
  const uniforms = useMemo(
    () => ({
      zenith: { value: new THREE.Color(zenith) },
      mid: { value: new THREE.Color(mid) },
      horizon: { value: new THREE.Color(horizon) },
    }),
    [zenith, mid, horizon],
  )
  return (
    <mesh>
      <sphereGeometry args={[520, 32, 18]} />
      <shaderMaterial
        key={`${zenith}-${mid}-${horizon}`}
        vertexShader={VERT}
        fragmentShader={FRAG}
        uniforms={uniforms}
        side={THREE.BackSide}
        depthWrite={false}
        fog={false}
      />
    </mesh>
  )
}

function Sun() {
  // Sits along the key-light direction so shading matches the sky.
  return (
    <group position={[240, 330, 150]}>
      <mesh>
        <circleGeometry args={[38, 40]} />
        <meshBasicMaterial color="#fff6cf" fog={false} side={THREE.DoubleSide} />
      </mesh>
      <mesh position={[0, 0, -1]}>
        <circleGeometry args={[62, 40]} />
        <meshBasicMaterial color="#fff2b8" transparent opacity={0.35} fog={false} side={THREE.DoubleSide} />
      </mesh>
    </group>
  )
}

/** One puffy cloud: a few flattened white spheres in a row. */
function Cloud({ seed }: { seed: number }) {
  const puffs = useMemo(() => {
    const rnd = (i: number) => {
      // tiny deterministic hash so each cloud keeps its shape across renders
      const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    const n = 3 + Math.floor(rnd(0) * 3)
    return Array.from({ length: n }, (_, i) => ({
      x: (i - (n - 1) / 2) * (13 + rnd(i + 1) * 4),
      y: (rnd(i + 2) - 0.5) * 6,
      r: 10 + rnd(i + 3) * 8,
    }))
  }, [seed])
  return (
    <group>
      {puffs.map((p, i) => (
        <mesh key={i} position={[p.x, p.y, 0]} scale={[1, 0.55, 0.8]}>
          <sphereGeometry args={[p.r, 18, 12]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.92} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

const CLOUD_COUNT = 14

interface SkyProps {
  zenith?: string
  mid?: string
  horizon?: string
  clouds?: number
}

export default function Sky({
  zenith = '#3f9ef2',
  mid = '#a8d8fb',
  horizon = SKY_HORIZON,
  clouds: cloudCount = CLOUD_COUNT,
}: SkyProps) {
  const cloudsRef = useRef<THREE.Group>(null)
  const clouds = useMemo(
    () =>
      Array.from({ length: cloudCount }, (_, i) => {
        const angle = (i / Math.max(1, cloudCount)) * Math.PI * 2 + (i % 3) * 0.35
        const radius = 170 + (i % 4) * 55
        return {
          seed: i + 1,
          pos: [
            Math.cos(angle) * radius,
            55 + ((i * 37) % 110),
            Math.sin(angle) * radius,
          ] as [number, number, number],
          rotY: -angle + Math.PI / 2,
        }
      }),
    [cloudCount],
  )

  // Whole cloud layer drifts slowly around the sky.
  useFrame((_, delta) => {
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.004
  })

  return (
    <group>
      <Dome zenith={zenith} mid={mid} horizon={horizon} />
      <Sun />
      <group ref={cloudsRef}>
        {clouds.map((c) => (
          <group key={c.seed} position={c.pos} rotation={[0, c.rotY, 0]}>
            <Cloud seed={c.seed} />
          </group>
        ))}
      </group>
    </group>
  )
}
