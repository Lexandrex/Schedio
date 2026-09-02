import { useEffect } from 'react'
import { useAuth } from '../context/AuthContext.jsx'

export default function ThemeSync() {
  const { user } = useAuth()

  useEffect(() => {
    const root = document.documentElement
    if (user?.cor) {
      root.style.setProperty('--bg-page', user.cor)
    } else {
      root.style.removeProperty('--bg-page')
    }
  }, [user?.cor])

  return null
}
