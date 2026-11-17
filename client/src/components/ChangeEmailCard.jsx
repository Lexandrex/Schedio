import { useState } from 'react'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import CodeInput from './CodeInput.jsx'

/**
 * Trocar o e-mail da conta (RF-04), em duas etapas, como o cadastro:
 * 1. novo e-mail + senha atual → o servidor manda um código para o novo;
 * 2. o código → o novo e-mail passa a valer (inclusive para entrar).
 *
 * Até a confirmação nada muda: a conta continua entrando com o e-mail atual.
 * Uma troca pendente sobrevive a recarregar a página (`user.email_novo`).
 */
export default function ChangeEmailCard() {
  const { user, updateUser } = useAuth()
  const [aberto, setAberto] = useState(false)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [codigo, setCodigo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [retorno, setRetorno] = useState(null)

  const pendente = user.email_novo

  async function enviar(acao) {
    setEnviando(true)
    setRetorno(null)
    try {
      await acao()
    } catch (error) {
      setRetorno({ tipo: 'error', mensagem: error.message })
    } finally {
      setEnviando(false)
    }
  }

  const pedirCodigo = (event) => {
    event.preventDefault()
    return enviar(async () => {
      const data = await apiRequest('/api/users/me/email', { method: 'POST', json: { email, password: senha } })
      updateUser({ email_novo: data.email_novo })
      setSenha('')
      setCodigo('')
      setRetorno({ tipo: 'success', mensagem: data.message })
    })
  }

  const confirmar = (event) => {
    event.preventDefault()
    return enviar(async () => {
      const data = await apiRequest('/api/users/me/email/confirmar', { method: 'POST', json: { code: codigo } })
      updateUser({ ...data.user, email_novo: null })
      setAberto(false)
      setEmail('')
      setCodigo('')
      setRetorno({ tipo: 'success', mensagem: data.message })
    })
  }

  const cancelar = () =>
    enviar(async () => {
      await apiRequest('/api/users/me/email', { method: 'DELETE' })
      updateUser({ email_novo: null })
      setAberto(false)
      setCodigo('')
    })

  return (
    <section className="account-card" aria-labelledby="titulo-email">
      <h2 id="titulo-email">E-mail da conta</h2>
      <p className="subtitle">
        Atual: <strong>{user.email}</strong>
      </p>

      {pendente ? (
        <form className="auth-form" onSubmit={confirmar}>
          <p className="subtitle">
            Digite o código que enviamos para <strong>{pendente}</strong>. Até lá, você continua entrando com o e-mail
            atual.
          </p>
          <CodeInput value={codigo} onChange={setCodigo} ariaLabel="Código de confirmação do novo e-mail" />
          <div className="account-danger-actions">
            <button className="text-button" type="button" onClick={cancelar} disabled={enviando}>
              Cancelar troca
            </button>
            <button className="primary-button" type="submit" disabled={enviando || codigo.length < 6}>
              {enviando ? 'Confirmando...' : 'Confirmar novo e-mail'}
            </button>
          </div>
        </form>
      ) : !aberto ? (
        <button className="text-button terms-read" type="button" onClick={() => setAberto(true)}>
          Alterar e-mail
        </button>
      ) : (
        <form className="auth-form" onSubmit={pedirCodigo}>
          <label>
            <span>Novo e-mail</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </label>
          <label>
            <span>Senha atual</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
          </label>
          <div className="account-danger-actions">
            <button className="text-button" type="button" onClick={() => setAberto(false)}>
              Cancelar
            </button>
            <button className="primary-button" type="submit" disabled={enviando}>
              {enviando ? 'Enviando...' : 'Enviar código'}
            </button>
          </div>
        </form>
      )}

      {retorno && (
        <p className="feedback" role="status" data-type={retorno.tipo}>
          {retorno.mensagem}
        </p>
      )}
    </section>
  )
}
