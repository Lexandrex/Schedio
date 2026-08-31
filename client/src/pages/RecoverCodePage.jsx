import { useState } from 'react'
import { Navigate, useLocation, useNavigate, useOutletContext } from 'react-router-dom'
import { authRequest } from '../api.js'
import CodeInput from '../components/CodeInput.jsx'

export default function RecoverCodePage() {
  const { setFeedback } = useOutletContext()
  const location = useLocation()
  const navigate = useNavigate()
  const email = location.state?.email
  const [code, setCode] = useState('')

  if (!email) {
    return <Navigate to="/recover-email" replace />
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (code.length !== 6) {
      setFeedback({ message: 'Informe os seis dígitos do código.', type: 'error' })
      return
    }

    try {
      await authRequest('password-recovery/verify', { email, code })
      navigate('/reset-password', { state: { email, code } })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  return (
    <div className="auth-card auth-card--recovery">
      <button className="back-button" type="button" onClick={() => navigate('/recover-email')}>
        ← Voltar
      </button>

      <h1>Verifique seu e-mail</h1>
      <p className="subtitle">
        Digite o código de 6 dígitos enviado para <strong>{email}</strong>.
      </p>

      <form className="auth-form" onSubmit={handleSubmit}>
        <CodeInput value={code} onChange={setCode} ariaLabel="Código de recuperação" />
        <button className="primary-button" type="submit">
          Validar código
        </button>
      </form>
    </div>
  )
}
