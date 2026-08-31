import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'

export default function ResetPasswordPage() {
  const { setFeedback } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email
  const code = location.state?.code
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  if (!email || !code) {
    return <Navigate to="/recover-email" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (password !== confirmation) {
      setFeedback({ message: 'As senhas informadas não coincidem.', type: 'error' })
      return
    }

    try {
      const data = await authRequest('password-recovery/reset', { email, code, password })
      navigate('/login', { state: { feedback: data.message, feedbackType: 'success' } })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  return (
    <div className="auth-card auth-card--recovery">
      <button className="back-button" type="button" onClick={() => navigate('/login')}>
        ← Voltar ao login
      </button>

      <div className="avatar" aria-hidden="true">
        <span></span>
      </div>

      <h1>Nova senha</h1>
      <p className="subtitle">Crie uma senha segura para a sua conta.</p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <label>
          <span>Nova senha</span>
          <input
            type="password"
            placeholder="Nova senha"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          <span>Confirmar nova senha</span>
          <input
            type="password"
            placeholder="Repita a nova senha"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        <input
          className="auth-username"
          type="email"
          autoComplete="username"
          tabIndex={-1}
          aria-hidden="true"
          value={email}
          readOnly
        />

        <button className="primary-button" type="submit">
          Redefinir senha
        </button>
      </form>
    </div>
  )
}
