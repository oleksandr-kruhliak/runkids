import { useEffect, useState } from 'react'
import App from './App'
import AnimalStudio from './studio/AnimalStudio'

type View = 'race' | 'studio'

function viewFromHash(): View {
  return window.location.hash.replace(/^#\/?/, '') === 'studio' ? 'studio' : 'race'
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
    window.location.hash = v === 'studio' ? '#/studio' : '#/'
  }

  return view === 'studio' ? (
    <AnimalStudio onExit={() => go('race')} />
  ) : (
    <App onOpenStudio={() => go('studio')} />
  )
}
