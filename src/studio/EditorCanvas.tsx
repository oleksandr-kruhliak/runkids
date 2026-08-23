import { Canvas } from '@react-three/fiber'
import { Grid, OrbitControls } from '@react-three/drei'
import { AnimParams, Block, Clip } from './model'
import AnimalView from './AnimalView'

interface Props {
  blocks: Block[]
  anim: AnimParams
  clip: Clip
  playing: boolean
  selectedId: string | null
  onSelect: (id: string | null) => void
}

/** The Studio viewport: lit stage, ground grid, orbit controls, and the animal. */
export default function EditorCanvas({
  blocks,
  anim,
  clip,
  playing,
  selectedId,
  onSelect,
}: Props) {
  return (
    <Canvas
      shadows
      camera={{ position: [3.2, 2.4, 4.2], fov: 45 }}
      dpr={[1, 2]}
      onPointerMissed={() => onSelect(null)}
    >
      <color attach="background" args={['#dfeffb']} />
      <hemisphereLight args={['#ffffff', '#9db4c0', 0.95]} />
      <directionalLight
        position={[5, 8, 4]}
        intensity={1.5}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.02, 0]} receiveShadow>
        <planeGeometry args={[60, 60]} />
        <meshStandardMaterial color="#7ed957" />
      </mesh>
      <Grid
        position={[0, -1.02, 0]}
        args={[60, 60]}
        cellSize={0.5}
        cellColor="#74cc4e"
        sectionSize={2}
        sectionColor="#5fb83c"
        fadeDistance={26}
        infiniteGrid
      />

      <AnimalView
        blocks={blocks}
        anim={anim}
        clip={clip}
        playing={playing}
        selectedId={selectedId}
        onSelect={onSelect}
      />

      <OrbitControls makeDefault enableDamping maxPolarAngle={Math.PI / 2.02} minDistance={1.5} maxDistance={20} target={[0, 0.2, 0]} />
    </Canvas>
  )
}
