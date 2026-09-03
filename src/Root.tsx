import { useEffect, useState } from 'react'
import App from './App'
import AnimalStudio from './studio/AnimalStudio'
import EnvStudio from './env/EnvStudio'
import HatchShow from './hatch/HatchShow'
import JumpShow from './jump/JumpShow'
import BowlShow from './bowl/BowlShow'

type View = 'race' | 'studio' | 'env' | 'hatch' | 'jump' | 'bowl'

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'studio') return 'studio'
  if (h === 'env') return 'env'
  if (h === 'hatch') return 'hatch'
  if (h === 'jump') return 'jump'
  if (h === 'bowl') return 'bowl'
  return 'race'
}

/** Tiny hash router so the app can host the Race Builder, the Studios and the
 *  three shows — Egg Hatch, Cloud Climb and Alpine Strike. */
export default function Root() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (v: View) => {
    window.location.hash = v === 'race' ? '#/' : `#/${v}`
  }

  if (view === 'studio') {
    return <AnimalStudio onExit={() => go('race')} onOpenEnv={() => go('env')} />
  }
  if (view === 'env') {
    return <EnvStudio onExit={() => go('race')} onAnimals={() => go('studio')} />
  }
  if (view === 'hatch') {
    return <HatchShow onExit={() => go('race')} />
  }
  if (view === 'jump') {
    return <JumpShow onExit={() => go('race')} />
  }
  if (view === 'bowl') {
    return <BowlShow onExit={() => go('race')} />
  }
  return <App onOpenStudio={() => go('studio')} />
}
