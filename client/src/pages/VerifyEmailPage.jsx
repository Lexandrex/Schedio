import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'
import CodeInput from '../components/CodeInput.jsx'

export default function VerifyEmailPage() {
  const { setFeedback } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email
  const [code, setCode] = useState('')

  if (!email) {
    return <Navigate to="/register" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (code.length !== 6) {
      setFeedback({ message: 'Informe os seis dígitos do código.', type: 'error' })
      return
    }

    try {
      const data = await authRequest('email-verification/verify', { email, code })
      navigate('/login', { state: { feedback: data.message, feedbackType: 'success' } })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  async function handleResend() {
    try {
      const data = await authRequest('email-verification/resend', { email })
      setFeedback({ message: data.message, type: 'success' })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  return (
    <div className="auth-card">
      <button className="back-button" type="button" onClick={() => navigate('/login')}>
        ← Voltar
      </button>

      <h1>Confirme seu e-mail</h1>
      <p className="subtitle">
        Enviamos um código de 6 dígitos para <strong>{email}</strong>.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <CodeInput value={code} onChange={setCode} ariaLabel="Código de confirmação de e-mail" />
        <button className="primary-button" type="submit">
          Confirmar e-mail
        </button>
      </form>

      <button className="text-button" type="button" onClick={handleResend}>
        Reenviar código
      </button>
    </div>
  )
}
