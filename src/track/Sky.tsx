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

/** Direction of the sun for a given elevation (shared with the key light). */
export function sunDirection(elevDeg: number): THREE.Vector3 {
  const elev = (elevDeg * Math.PI) / 180
  const az = 0.56 // fixed azimuth, matches the classic light angle
  return new THREE.Vector3(
    Math.cos(elev) * Math.cos(az),
    Math.sin(elev),
    Math.cos(elev) * Math.sin(az),
  )
}

/** Warm the light as the sun drops toward the horizon (golden hour). */
export function sunTint(elevDeg: number): string {
  const k = Math.max(0, Math.min(1, (32 - elevDeg) / 26))
  return `#${new THREE.Color('#ffffff').lerp(new THREE.Color('#ff9a3c'), k * 0.75).getHexString()}`
}

function Sun({ elevDeg }: { elevDeg: number }) {
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
  const pos = useMemo(() => sunDirection(elevDeg).multiplyScalar(430), [elevDeg])
  const low = elevDeg < 30
  const body = low ? '#ffb54f' : '#ffe36b'
  const halo = low ? '#ff9a3c' : '#ffd94f'
  return (
    <group position={pos} rotation={[0, Math.atan2(pos.x, pos.z), 0]}>
      <mesh>
        <boxGeometry args={[52, 52, 10]} />
        <meshBasicMaterial color={body} fog={false} />
      </mesh>
      <mesh position={[0, 0, -2]}>
        <boxGeometry args={[68, 68, 6]} />
        <meshBasicMaterial color={halo} transparent opacity={0.35} fog={false} />
      </mesh>
      {rays.map((r, i) => (
        <mesh key={i} position={r.pos}>
          <boxGeometry args={[r.s, r.s, 6]} />
          <meshBasicMaterial color={body} fog={false} />
        </mesh>
      ))}
    </group>
  )
}

/** One voxel cloud: a flat-bottomed cluster of boxes. */
function Cloud({ seed, color = '#ffffff' }: { seed: number; color?: string }) {
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
          <meshBasicMaterial color={color} transparent opacity={0.94} fog={false} />
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
  /** Starfield + moon instead of the sun; clouds turn to dark silhouettes. */
  night?: boolean
  /** Sun elevation in degrees (low = golden hour). */
  sunElev?: number
}

/** A scattering of star cubes on the upper dome, plus a pale voxel moon. */
function NightLights() {
  const stars = useMemo(() => {
    const rnd = (i: number) => {
      const x = Math.sin(i * 127.1 + 311.7) * 43758.5453
      return x - Math.floor(x)
    }
    return Array.from({ length: 220 }, (_, i) => {
      const a = rnd(i * 2 + 1) * Math.PI * 2
      const elev = 0.08 + rnd(i * 2 + 2) * 1.35 // radians above horizon
      const r = 470
      return {
        pos: [Math.cos(a) * Math.cos(elev) * r, Math.sin(elev) * r, Math.sin(a) * Math.cos(elev) * r] as [
          number,
          number,
          number,
        ],
        s: 0.9 + rnd(i * 3 + 5) * 1.6,
        c: rnd(i * 5 + 7) > 0.85 ? '#bcd8ff' : rnd(i * 7 + 9) > 0.85 ? '#ffe9c8' : '#ffffff',
      }
    })
  }, [])
  return (
    <group>
      {stars.map((st, i) => (
        <mesh key={i} position={st.pos}>
          <boxGeometry args={[st.s, st.s, st.s]} />
          <meshBasicMaterial color={st.c} fog={false} />
        </mesh>
      ))}
      {/* pale voxel moon with a soft halo */}
      <group position={[-200, 300, -220]}>
        <mesh>
          <boxGeometry args={[42, 42, 8]} />
          <meshBasicMaterial color="#e8ecf4" fog={false} />
        </mesh>
        <mesh position={[8, 6, 1]}>
          <boxGeometry args={[10, 10, 8]} />
          <meshBasicMaterial color="#c8ced9" fog={false} />
        </mesh>
        <mesh position={[-9, -8, 1]}>
          <boxGeometry args={[7, 7, 8]} />
          <meshBasicMaterial color="#c8ced9" fog={false} />
        </mesh>
        <mesh position={[0, 0, -2]}>
          <boxGeometry args={[56, 56, 4]} />
          <meshBasicMaterial color="#aebadd" transparent opacity={0.28} fog={false} />
        </mesh>
      </group>
    </group>
  )
}

export default function Sky({
  zenith = '#3f9ef2',
  mid = '#a8d8fb',
  horizon = SKY_HORIZON,
  clouds: cloudCount = CLOUD_COUNT,
  night = false,
  sunElev = 55,
}: SkyProps) {
  // The sky is meant to read as infinitely far away, but the dome is a
  // 520-unit sphere and you only see a BackSide sphere from inside it. On a
  // long course the racers travel further than that and leave the sky behind,
  // taking the sun and clouds with it. Anchoring the whole group to the camera
  // keeps the viewer at its centre wherever the race goes.
  const skyRef = useRef<THREE.Group>(null)
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
  useFrame(({ camera }, delta) => {
    if (cloudsRef.current) cloudsRef.current.rotation.y += delta * 0.004
    // Follow on the ground plane only: riding the camera's height too would
    // drag the horizon up and down with every camera move.
    if (skyRef.current) skyRef.current.position.set(camera.position.x, 0, camera.position.z)
  })

  return (
    <group ref={skyRef}>
      <Dome zenith={zenith} mid={mid} horizon={horizon} />
      {night ? <NightLights /> : <Sun elevDeg={sunElev} />}
      <group ref={cloudsRef}>
        {clouds.map((c) => (
          <group key={c.seed} position={c.pos} rotation={[0, c.rotY, 0]}>
            <Cloud seed={c.seed} color={night ? '#2a3350' : '#ffffff'} />
          </group>
        ))}
      </group>
    </group>
  )
}
