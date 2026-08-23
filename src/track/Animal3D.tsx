import { MutableRefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { useGLTF } from '@react-three/drei'
import * as THREE from 'three'
import { clone as cloneSkeleton } from 'three/examples/jsm/utils/SkeletonUtils.js'

const TARGET_SIZE = 1.7 // world units the largest dimension is scaled to
const RUN_REF_SPEED = 8 // speed at which the run clip plays at natural rate

/** Pick the first clip whose name matches one of the patterns (in order). */
function pickClip(clips: THREE.AnimationClip[], patterns: RegExp[]) {
  for (const p of patterns) {
    const c = clips.find((cl) => p.test(cl.name))
    if (c) return c
  }
  return null
}

interface Animal3DProps {
  url: string
  faceY?: number
  laneIndex?: number
  /** Per-lane current forward speed; drives run-vs-idle animation. */
  speedRef?: MutableRefObject<number[]>
  /** Local Y offset so the model's feet sit on the road (not floating). */
  groundDrop?: number
}

/**
 * Loads a .glb model, clones it per rider (skeleton-safe so rigged/skinned
 * meshes render correctly), auto-centers/scales it to a consistent size, and
 * plays its animations: it blends between an idle clip and a run/gallop/walk
 * clip based on how fast the animal is actually moving, so the animals walk
 * while racing and stand still when held up. Models that only ship an idle
 * clip (no walk) simply idle.
 */
export default function Animal3D({
  url,
  faceY = 0,
  laneIndex = 0,
  speedRef,
  groundDrop = 0,
}: Animal3DProps) {
  const gltf = useGLTF(url)
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const runRef = useRef<THREE.AnimationAction | null>(null)
  const idleRef = useRef<THREE.AnimationAction | null>(null)
  const hasRun = useRef(false)

  const built = useMemo(() => {
    const source = gltf.scene as THREE.Object3D

    // Initial size guess from the loaded source.
    source.updateMatrixWorld(true)
    const box = new THREE.Box3().setFromObject(source)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z) || 1
    const guess = TARGET_SIZE / maxDim

    // Skeleton-safe clone so rigged meshes bind to their own skeleton.
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
    // Drop the model so its feet rest on the road instead of floating at the
    // rider group's lifted origin.
    outer.position.y = groundDrop

    // Set up idle + locomotion animation actions on this clone.
    mixerRef.current = null
    runRef.current = null
    idleRef.current = null
    hasRun.current = false
    const clips = gltf.animations ?? []
    if (clips.length) {
      const mixer = new THREE.AnimationMixer(model)
      const idleClip = pickClip(clips, [/(^|\|)idle$/i, /idle/i]) ?? clips[0]
      const runClip = pickClip(clips, [
        /(^|\|)gallop$/i,
        /(^|\|)run$/i,
        /(^|\|)walk$/i,
        /walk/i,
        /gallop/i,
      ])

      const idle = mixer.clipAction(idleClip)
      idle.play()
      idleRef.current = idle

      if (runClip && runClip !== idleClip) {
        const run = mixer.clipAction(runClip)
        run.play()
        run.setEffectiveWeight(0)
        runRef.current = run
        hasRun.current = true
      }
      mixerRef.current = mixer
    }
    return { outer, model }
  }, [gltf.scene, gltf.animations, faceY, groundDrop])

  // One-time size self-correction once the model is really mounted.
  const corrected = useRef(false)
  useEffect(() => {
    corrected.current = false
  }, [built])
  const boxHelper = useRef(new THREE.Box3())
  const sizeHelper = useRef(new THREE.Vector3())

  useFrame((_, delta) => {
    const mixer = mixerRef.current

    // Blend idle <-> run based on the lane's current speed.
    if (mixer && hasRun.current && runRef.current && idleRef.current) {
      const speed = Math.abs(speedRef?.current?.[laneIndex] ?? 0)
      const moving = speed > 0.2 ? 1 : 0
      const run = runRef.current
      const idle = idleRef.current
      const w = run.getEffectiveWeight()
      const nw = THREE.MathUtils.lerp(w, moving, Math.min(1, delta * 10))
      run.setEffectiveWeight(nw)
      idle.setEffectiveWeight(1 - nw)
      // Speed the run cycle up/down a little with actual velocity.
      run.setEffectiveTimeScale(
        THREE.MathUtils.clamp(speed / RUN_REF_SPEED, 0.6, 1.8),
      )
    }
    mixer?.update(delta)

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
