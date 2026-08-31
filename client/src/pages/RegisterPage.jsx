import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'

export default function RegisterPage() {
  const { setFeedback } = useOutletContext()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    if (password !== confirmation) {
      setFeedback({ message: 'As senhas informadas não coincidem.', type: 'error' })
      return
    }

    try {
      const data = await authRequest('register', { email, password })
      navigate('/verify-email', {
        state: { email: data.user.email, feedback: data.message, feedbackType: 'success' },
      })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  return (
    <div className="auth-card auth-card--register">
      <button className="back-button" type="button" onClick={() => navigate('/login')}>
        ← Voltar
      </button>

      <div className="avatar" aria-hidden="true">
        <span></span>
      </div>

      <h1>Criar perfil</h1>
      <p className="subtitle">Comece a criar e explorar projetos.</p>

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
            placeholder="Crie uma senha"
            autoComplete="new-password"
            required
            minLength={8}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
          />
        </label>

        <label>
          <span>Confirmar senha</span>
          <input
            type="password"
            placeholder="Repita sua senha"
            autoComplete="new-password"
            required
            minLength={8}
            value={confirmation}
            onChange={(event) => setConfirmation(event.target.value)}
          />
        </label>

        <button className="primary-button" type="submit">
          Criar conta
        </button>
      </form>
    </div>
  )
}
