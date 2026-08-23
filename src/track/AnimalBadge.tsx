import { Canvas } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import Animal, { AnimalColors } from './Animal'
import RaceAnimal from './RaceAnimal'
import { AnimalDesign } from '../studio/model'

/**
 * A tiny, slowly spinning 3D portrait of a racer for the results podium.
 * Custom designs ride through RaceAnimal (auto-scaled, idling); default lanes
 * show the primitive animal.
 */
export default function AnimalBadge({
  design,
  colors,
}: {
  design?: AnimalDesign | null
  colors: AnimalColors
}) {
  return (
    <Canvas camera={{ position: [2.4, 1.7, 3.1], fov: 40 }} dpr={[1, 1.5]}>
      <ambientLight intensity={0.95} />
      <hemisphereLight args={['#ffffff', '#9db4c0', 0.6]} />
      <directionalLight position={[3, 5, 2]} intensity={1.2} />
      <group position={[0, -0.9, 0]}>
        {design ? <RaceAnimal design={design} /> : <Animal colors={colors} />}
      </group>
      <OrbitControls
        makeDefault
        autoRotate
        autoRotateSpeed={3}
        enableZoom={false}
        enablePan={false}
        enableRotate={false}
        target={[0, 0.1, 0]}
      />
    </Canvas>
  )
}
