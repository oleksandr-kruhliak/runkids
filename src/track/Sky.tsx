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
  // A friendly cube sun with little ray blocks, matching the voxel look.
  // Sits along the key-light direction so shading matches the sky.
  const rays = useMemo(
    () =>
      Array.from({ length: 8 }, (_, i) => {
        const a = (i / 8) * Math.PI * 2
        return {
          pos: [Math.cos(a) * 46, Math.sin(a) * 46, 0] as [number, number, number],
          s: i % 2 === 0 ? 9 : 6,
        }
      }),
    [],
  )
  return (
    <group position={[240, 330, 150]} rotation={[0, Math.atan2(240, 150), 0]}>
      <mesh>
        <boxGeometry args={[52, 52, 10]} />
        <meshBasicMaterial color="#ffe36b" fog={false} />
      </mesh>
      <mesh position={[0, 0, -2]}>
        <boxGeometry args={[68, 68, 6]} />
        <meshBasicMaterial color="#ffd94f" transparent opacity={0.35} fog={false} />
      </mesh>
      {rays.map((r, i) => (
        <mesh key={i} position={r.pos}>
          <boxGeometry args={[r.s, r.s, 6]} />
          <meshBasicMaterial color="#ffe36b" fog={false} />
        </mesh>
      ))}
    </group>
  )
}

/** One voxel cloud: a flat-bottomed cluster of white boxes. */
function Cloud({ seed }: { seed: number }) {
  const blocks = useMemo(() => {
    const rnd = (i: number) => {
      // tiny deterministic hash so each cloud keeps its shape across renders
      const x = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    const n = 3 + Math.floor(rnd(0) * 3)
    const out: { x: number; y: number; z: number; w: number; h: number }[] = []
    for (let i = 0; i < n; i++) {
      const w = 14 + rnd(i + 3) * 10
      const h = 8 + rnd(i + 5) * 5
      // Boxes share a flat base and stagger in x/z like stacked blocks.
      out.push({
        x: (i - (n - 1) / 2) * (11 + rnd(i + 1) * 5),
        y: h / 2,
        z: (rnd(i + 7) - 0.5) * 8,
        w,
        h,
      })
      // A smaller block riding on top of some segments.
      if (rnd(i + 9) > 0.55) {
        out.push({ x: out[out.length - 1].x + (rnd(i + 11) - 0.5) * 6, y: h + 3.5, z: 0, w: w * 0.55, h: 7 })
      }
    }
    return out
  }, [seed])
  return (
    <group>
      {blocks.map((b, i) => (
        <mesh key={i} position={[b.x, b.y, b.z]}>
          <boxGeometry args={[b.w, b.h, b.w * 0.8]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.94} fog={false} />
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
