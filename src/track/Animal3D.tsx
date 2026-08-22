import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

const TARGET_SIZE = 1.7 // world units the largest dimension is scaled to

/**
 * Loads a .glb model, clones it per rider (skeleton-safe so rigged/skinned
 * meshes render correctly), and auto-centers/scales it so it sits on the track
 * at a consistent size. `faceY` spins the model to face along the track (+Z)
 * if the source model faces another way. If the model ships an idle animation
 * we play it so the animal looks alive.
 *
 * Sizing is done in two stages: an initial guess measured from the loaded
 * source, then a one-time self-correction on the first rendered frame that
 * measures the actually-mounted model in world space and rescales it to
 * TARGET_SIZE. The correction makes the size robust to skinned-mesh /
 * clone-timing quirks where the up-front measurement can be wildly off (which
 * previously scaled the animals down to an invisible speck).
 */
export default function Animal3D({ url, faceY = 0 }: { url: string; faceY?: number }) {
  const gltf = useGLTF(url)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)

  const built = useMemo(() => {
    const source = gltf.scene as THREE.Object3D

    // Initial guess from the source (loader has set its matrices up).
    source.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(source)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const guess = TARGET_SIZE / maxDim

    // SkeletonUtils.clone rebinds SkinnedMesh bones to the cloned skeleton —
    // plain Object3D.clone(true) leaves them pointing at the original.
    const model = cloneSkeleton(source)
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.frustumCulled = false
      }
    })
    model.position.set(-center.x, -box.min.y, -center.z)

    const inner = new THREE.Group()
    inner.add(model)
    inner.rotation.y = faceY

    const outer = new THREE.Group()
    outer.add(inner)
    outer.scale.setScalar(guess)

    // Play an idle animation if the model ships one.
    mixerRef.current = null
    const clips = gltf.animations
    if (clips && clips.length) {
      const idle = clips.find((c) => /idle|stand|graz/i.test(c.name)) ?? clips[0]
      const mixer = new THREE.AnimationMixer(model)
      mixer.clipAction(idle).play()
      mixerRef.current = mixer
    }
    return { outer, inner, model }
  }, [gltf.scene, gltf.animations, faceY])

  // One-time size correction once the model is mounted and its world matrices
  // are real. Keep trying until we get a valid (non-degenerate) measurement.
  const corrected = useRef(false)
  useEffect(() => {
    corrected.current = false
  }, [built])

  const boxHelper = useRef(new THREE.Box3())
  const sizeHelper = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)

    if (!corrected.current) {
      const { outer, model } = built
      model.updateWorldMatrix(true, true)
      boxHelper.current.setFromObject(model)
      if (!boxHelper.current.isEmpty()) {
        boxHelper.current.getSize(sizeHelper.current)
        const maxDim = Math.max(
          sizeHelper.current.x,
          sizeHelper.current.y,
          sizeHelper.current.z,
        )
        if (maxDim > 1e-5) {
          // Rescale so the largest world dimension equals TARGET_SIZE. This
          // scales the whole `outer` (model offset included), so centering
          // stays correct too.
          outer.scale.multiplyScalar(TARGET_SIZE / maxDim)
          corrected.current = true
        }
      }
    }
  })

  useEffect(() => {
    return () => {
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
    }
  }, [built])

  return <primitive object={built.outer} />
}
