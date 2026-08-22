import { useMemo } from 'react'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'

const TARGET_HEIGHT = 1.7 // world units the tallest dimension is scaled to

/**
 * Loads a .glb model, clones it per rider, and auto-centers/scales it so it
 * sits on the track at a consistent size. `faceY` lets us spin the model to
 * face along the track (+Z) if the source model faces another way.
 */
export default function Animal3D({ url, faceY = 0 }: { url: string; faceY?: number }) {
  const gltf = useGLTF(url)

  const object = useMemo(() => {
    const clone = (gltf.scene as THREE.Object3D).clone(true)
    clone.traverse((o) => {
      const mesh = o as THREE.Mesh
      if (mesh.isMesh) {
        mesh.castShadow = true
        mesh.frustumCulled = false
      }
    })

    const box = new THREE.Box3().setFromObject(clone)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const scale = TARGET_HEIGHT / (Math.max(size.x, size.y, size.z) || 1)

    // Recenter horizontally and drop feet to y=0.
    clone.position.set(-center.x, -box.min.y, -center.z)

    const inner = new THREE.Group()
    inner.add(clone)
    inner.rotation.y = faceY

    const outer = new THREE.Group()
    outer.add(inner)
    outer.scale.setScalar(scale)
    return outer
  }, [gltf.scene, faceY])

  return <primitive object={object} />
}
