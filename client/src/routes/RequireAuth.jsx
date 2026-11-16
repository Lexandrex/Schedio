import { useEffect } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router-dom'
import { useAuth } from '../context/AuthContext.jsx'
import { esquecerDestino, lembrarDestino } from './destino.js'

export default function RequireAuth() {
  const { user, isLoading } = useAuth()
  const location = useLocation()

  // Chegou logado a uma rota protegida: o destino guardado (se havia) já foi usado.
  useEffect(() => {
    if (user) esquecerDestino()
  }, [user])

  if (isLoading) {
    return null
  }

  if (!user) {
    lembrarDestino(location.pathname)
    return <Navigate to="/login" replace />
  }

  return <Outlet />
}
