import { useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { apiRequest, authRequest } from '../api.js'
import TermsDialog from '../components/TermsDialog.jsx'

export default function RegisterPage() {
  const { setFeedback } = useOutletContext()
  const navigate = useNavigate()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [terms, setTerms] = useState(null)
  const [showTerms, setShowTerms] = useState(false)
  // Versão aceita, e não um booleano: é ela que vai para o servidor e fica
  // registrada, então precisa ser a versão do texto que estava na tela.
  const [acceptedVersion, setAcceptedVersion] = useState(null)

  async function openTerms() {
    try {
      // Sempre relê: se o texto mudou desde a última abertura, é o novo que vale.
      const data = await apiRequest('/api/termos')
      if (acceptedVersion && acceptedVersion !== data.versao) setAcceptedVersion(null)
      setTerms(data)
      setShowTerms(true)
    } catch {
      setFeedback({ message: 'Não foi possível carregar os Termos de Uso. Tente novamente.', type: 'error' })
    }
  }

  function handleAccept() {
    setAcceptedVersion(terms.versao)
    setShowTerms(false)
  }

  async function handleSubmit(event) {
    event.preventDefault()

    if (password !== confirmation) {
      setFeedback({ message: 'As senhas informadas não coincidem.', type: 'error' })
      return
    }
    if (!acceptedVersion) {
      setFeedback({ message: 'Leia e aceite os Termos de Uso para criar a conta.', type: 'error' })
      return
    }

    try {
      const data = await authRequest('register', { email, password, termsVersion: acceptedVersion })
      navigate('/verify-email', {
        state: { email: data.user.email, feedback: data.message, feedbackType: 'success' },
      })
    } catch (error) {
      // O servidor recusa versão desatualizada: obriga a ler a nova.
      setAcceptedVersion(null)
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

        <div className="terms-consent" data-accepted={acceptedVersion ? 'true' : 'false'}>
          <span className="terms-check" aria-hidden="true">{acceptedVersion ? '✓' : ''}</span>
          <p>
            {acceptedVersion ? (
              <>Você aceitou os </>
            ) : (
              <>Para criar a conta, leia e aceite os </>
            )}
            <button className="terms-link" type="button" onClick={openTerms}>
              Termos de Uso e Política de Privacidade
            </button>
            {acceptedVersion && <> (versão {acceptedVersion})</>}.
          </p>
        </div>

        <button
          className="primary-button"
          type="submit"
          disabled={!acceptedVersion}
          title={acceptedVersion ? undefined : 'Aceite os Termos de Uso para continuar'}
        >
          Criar conta
        </button>
      </form>

      {showTerms && (
        <TermsDialog terms={terms} onAccept={handleAccept} onClose={() => setShowTerms(false)} />
      )}
    </div>
  )
}
