import { useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

const TARGET_HEIGHT = 1.7 // world units the tallest dimension is scaled to

/**
 * Loads a .glb model, clones it per rider (skeleton-safe so rigged/skinned
 * meshes render correctly), and auto-centers/scales it so it sits on the track
 * at a consistent size. `faceY` spins the model to face along the track (+Z)
 * if the source model faces another way. If the model ships an idle animation
 * we play it so the animal looks alive.
 */
export default function Animal3D({ url, faceY = 0 }: { url: string; faceY?: number }) {
  const gltf = useGLTF(url)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)

  const object = useMemo(() => {
    // SkeletonUtils.clone rebinds SkinnedMesh bones to the cloned skeleton —
    // plain Object3D.clone(true) leaves them pointing at the original.
    const model = cloneSkeleton(gltf.scene as THREE.Object3D)
    model.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.frustumCulled = false
      }
    })

    const box = new THREE.Box3().setFromObject(model)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = TARGET_HEIGHT / (Math.max(size.x, size.y, size.z) || 1)

    // Recenter horizontally and drop feet to y=0.
    model.position.set(-center.x, -box.min.y, -center.z)

    const inner = new THREE.Group()
    inner.add(model)
    inner.rotation.y = faceY

    const outer = new THREE.Group()
    outer.add(inner)
    outer.scale.setScalar(scale)

    // Wire up an idle animation if the model has one.
    mixerRef.current = null
    const clips = gltf.animations
    if (clips && clips.length) {
      const idle =
        clips.find((c) => /idle|stand|graz/i.test(c.name)) ?? clips[0]
      const mixer = new THREE.AnimationMixer(model)
      mixer.clipAction(idle).play()
      mixerRef.current = mixer
    }
    return outer
  }, [gltf.scene, gltf.animations, faceY])

  useFrame((_, delta) => {
    mixerRef.current?.update(delta)
  })

  useEffect(() => {
    return () => {
      mixerRef.current?.stopAllAction()
      mixerRef.current = null
    }
  }, [object])

  return <primitive object={object} />
}
