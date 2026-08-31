import { useState } from 'react'
import { Link, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { setFeedback } = useOutletContext()
  const { user, isLoading, login, logout } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      const data = await authRequest('login', { email, password })
      login(data.user, data.token)
      setFeedback({ message: `Bem-vindo, ${data.user.email}.`, type: 'success' })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  if (isLoading) {
    return <div className="auth-card" />
  }

  if (user) {
    return (
      <div className="auth-card">
        <div className="avatar" aria-hidden="true">
          <span></span>
        </div>

        <h1>Sessão ativa</h1>
        <p className="subtitle">
          Você está conectado como <strong>{user.email}</strong>.
        </p>

        <button className="primary-button" type="button" onClick={logout}>
          Sair
        </button>
      </div>
    )
  }

  return (
    <div className="auth-card">
      <div className="avatar" aria-hidden="true">
        <span></span>
      </div>

      <h1>Entrar</h1>
      <p className="subtitle">Acesse sua conta para continuar.</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>E-mail</span>
          <input
            type="email"
            placeholder="seuemail@exemplo.com"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
        </label>

        <label>
          <span>Senha</span>
          <input
            type="password"
            placeholder="Sua senha"
            autoComplete="current-password"
            required
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <button className="primary-button" type="submit">
          Entrar
        </button>
      </form>

      <div className="form-links">
        <Link to="/register">Criar conta</Link>
        <Link to="/recover-email">Esqueci minha senha</Link>
      </div>
    </div>
  )
}
