import { createContext, useContext, useEffect, useState } from 'react'
import { apiRequest, clearToken, getToken, setToken } from '../api.js'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const token = getToken()
    if (!token) {
      setIsLoading(false)
      return
    }

    apiRequest('/api/auth/me')
      .then((data) => setUser(data.user))
      .catch(() => clearToken())
      .finally(() => setIsLoading(false))
  }, [])

  async function login(token) {
    setToken(token)
    const data = await apiRequest('/api/auth/me')
    setUser(data.user)
  }

  function updateUser(patch) {
    setUser((current) => (current ? { ...current, ...patch } : current))
  }

  function logout() {
    clearToken()
    setUser(null)
  }

  return (
    <AuthContext.Provider value={{ user, isLoading, login, updateUser, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de um AuthProvider.')
  }
  return context
}
