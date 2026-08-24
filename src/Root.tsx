import { useEffect, useState } from 'react'
import App from './App'
import AnimalStudio from './studio/AnimalStudio'
import EnvStudio from './env/EnvStudio'

type View = 'race' | 'studio' | 'env'

function viewFromHash(): View {
  const h = window.location.hash.replace(/^#\/?/, '')
  if (h === 'studio') return 'studio'
  if (h === 'env') return 'env'
  return 'race'
}

/** Tiny hash router so the app can host both the Race Builder and the Studio. */
export default function Root() {
  const [view, setView] = useState<View>(viewFromHash)

  useEffect(() => {
    const onHash = () => setView(viewFromHash())
    window.addEventListener('hashchange', onHash)
    return () => window.removeEventListener('hashchange', onHash)
  }, [])

  const go = (v: View) => {
    window.location.hash = v === 'studio' ? '#/studio' : v === 'env' ? '#/env' : '#/'
  }

  if (view === 'studio') {
    return <AnimalStudio onExit={() => go('race')} onOpenEnv={() => go('env')} />
  }
  if (view === 'env') {
    return <EnvStudio onExit={() => go('race')} onAnimals={() => go('studio')} />
  }
  return <App onOpenStudio={() => go('studio')} />
}
