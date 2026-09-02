import { useState } from 'react'
import { Link, useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'

export default function LoginPage() {
  const { setFeedback } = useOutletContext()
  const { login } = useAuth()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    try {
      const data = await authRequest('login', { email, password })
      await login(data.token)
      navigate('/')
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
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
