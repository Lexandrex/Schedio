import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'

export default function RecoverEmailPage() {
  const { setFeedback } = useOutletContext()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')

  async function handleSubmit(event) {
    event.preventDefault()

    const trimmedEmail = email.trim()
    if (!trimmedEmail || !trimmedEmail.includes('@')) {
      setFeedback({ message: 'Informe um e-mail válido.', type: 'error' })
      return
    }

    try {
      const data = await authRequest('password-recovery', { email: trimmedEmail })
      navigate('/recover-code', {
        state: { email: trimmedEmail, feedback: data.message, feedbackType: 'success' },
      })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  return (
    <div className="auth-card auth-card--recovery">
      <button className="back-button" type="button" onClick={() => navigate('/login')}>
        ← Voltar
      </button>

      <div className="avatar" aria-hidden="true">
        <span></span>
      </div>

      <h1>Recuperar senha</h1>
      <p className="subtitle">Informe seu e-mail para receber o código de recuperação.</p>

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

        <button className="primary-button" type="submit">
          Enviar código
        </button>
      </form>
    </div>
  )
}
