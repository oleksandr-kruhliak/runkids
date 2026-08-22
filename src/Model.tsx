import { useEffect, useMemo } from 'react'
import { useLoader, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { STLLoader } from 'three/examples/jsm/loaders/STLLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'

export type ModelFormat = 'gltf' | 'glb' | 'obj' | 'stl' | 'fbx'

export function formatFromUrl(url: string): ModelFormat | null {
  const clean = url.split('?')[0].split('#')[0].toLowerCase()
  if (clean.endsWith('.glb')) return 'glb'
  if (clean.endsWith('.gltf')) return 'gltf'
  if (clean.endsWith('.obj')) return 'obj'
  if (clean.endsWith('.stl')) return 'stl'
  if (clean.endsWith('.fbx')) return 'fbx'
  return null
}

const loaderFor = {
  gltf: GLTFLoader,
  glb: GLTFLoader,
  obj: OBJLoader,
  stl: STLLoader,
  fbx: FBXLoader,
} as const

/**
 * Normalizes any loaded result into a single THREE.Object3D, centered at the
 * origin and uniformly scaled so its largest dimension is `targetSize` units.
 */
function normalize(object: THREE.Object3D, targetSize = 2): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(object)
  const size = box.getSize(new THREE.Vector3())
  const center = box.getCenter(new THREE.Vector3())

  const maxDim = Math.max(size.x, size.y, size.z) || 1
  const scale = targetSize / maxDim

  const group = new THREE.Group()
  object.position.sub(center) // recenter to origin
  group.add(object)
  group.scale.setScalar(scale)
  return group
}

interface ModelProps {
  url: string
  format: ModelFormat
}

export default function Model({ url, format }: ModelProps) {
  const Loader = loaderFor[format]
  const result = useLoader(Loader as any, url)
  const { camera, controls } = useThree()

  const object = useMemo(() => {
    let obj: THREE.Object3D
    if (format === 'gltf' || format === 'glb') {
      obj = (result as any).scene as THREE.Object3D
    } else if (format === 'stl') {
      // STLLoader returns a BufferGeometry, not an Object3D.
      const geometry = result as unknown as THREE.BufferGeometry
      geometry.computeVertexNormals()
      const material = new THREE.MeshStandardMaterial({
        color: 0xbfc4cc,
        metalness: 0.1,
        roughness: 0.6,
      })
      obj = new THREE.Mesh(geometry, material)
    } else {
      obj = result as THREE.Object3D
    }

    obj.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        child.castShadow = true
        child.receiveShadow = true
      }
    })

    return normalize(obj)
  }, [result, format])

  // Frame the model each time it changes.
  useEffect(() => {
    camera.position.set(3, 2, 4)
    camera.lookAt(0, 0, 0)
    const orbit = controls as unknown as { target: THREE.Vector3; update: () => void } | undefined
    if (orbit?.target) {
      orbit.target.set(0, 0, 0)
      orbit.update()
    }
  }, [object, camera, controls])

  return <primitive object={object} />
}
