import { useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import UserIcon from '../components/UserIcon.jsx'

const DEFAULT_COLOR = '#19181a'
const BIO_LIMIT = 280

export default function AccountPage() {
  const { user, updateUser, logout } = useAuth()

  const [nome, setNome] = useState(user.nome || '')
  const [bio, setBio] = useState(user.bio || '')
  const [cor, setCor] = useState(user.cor || DEFAULT_COLOR)
  const [feedback, setFeedback] = useState({ message: '', type: 'info' })
  const [isSaving, setIsSaving] = useState(false)

  const [showDeleteForm, setShowDeleteForm] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [isDeleting, setIsDeleting] = useState(false)

  async function handleSave(event) {
    event.preventDefault()
    setIsSaving(true)
    setFeedback({ message: '', type: 'info' })

    try {
      const data = await apiRequest('/api/users/me', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome, bio, cor }),
      })
      updateUser(data.user)
      setFeedback({ message: 'Perfil atualizado com sucesso.', type: 'success' })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  async function handleDelete(event) {
    event.preventDefault()
    setIsDeleting(true)
    setFeedback({ message: '', type: 'info' })

    try {
      await apiRequest('/api/users/me', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: deletePassword }),
      })
      sessionStorage.setItem('schedio.accountDeleted', '1')
      logout()
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
      setIsDeleting(false)
    }
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <Link className="back-button account-back" to="/">
          ← Voltar
        </Link>
        <span className="brand-mark">S</span>
      </header>

      <div className="account-layout">
        <section className="account-card">
          <div className="account-profile-row">
            <span className="account-avatar" aria-hidden="true">
              <UserIcon size={34} />
            </span>
            <div>
              <h1>{user.nome || user.email}</h1>
              <p className="subtitle">{user.email}</p>
            </div>
          </div>

          <form className="auth-form" onSubmit={handleSave}>
            <label>
              <span>Nome de usuário</span>
              <input
                type="text"
                maxLength={80}
                required
                value={nome}
                onChange={(event) => setNome(event.target.value)}
              />
            </label>

            <label>
              <span>Descrição</span>
              <textarea
                className="bio-textarea"
                maxLength={BIO_LIMIT}
                placeholder="Fale um pouco sobre você..."
                value={bio}
                onChange={(event) => setBio(event.target.value)}
              />
              <span className="char-counter">{bio.length}/{BIO_LIMIT}</span>
            </label>

            <label>
              <span>Cor de fundo</span>
              <div className="color-row">
                <input
                  className="color-input"
                  type="color"
                  value={cor}
                  onChange={(event) => setCor(event.target.value)}
                />
                <span className="color-value">{cor}</span>
              </div>
            </label>

            <button className="primary-button" type="submit" disabled={isSaving}>
              {isSaving ? 'Salvando...' : 'Salvar alterações'}
            </button>
          </form>

          {feedback.message && (
            <p className="feedback" role="status" data-type={feedback.type}>
              {feedback.message}
            </p>
          )}
        </section>

        <section className="account-card account-danger">
          <h2>Excluir conta</h2>
          <p className="subtitle">
            Essa ação é permanente e remove seus dados e projetos da plataforma.
          </p>

          {!showDeleteForm ? (
            <button className="danger-button" type="button" onClick={() => setShowDeleteForm(true)}>
              Excluir conta
            </button>
          ) : (
            <form className="auth-form" onSubmit={handleDelete}>
              <label>
                <span>Confirme sua senha para continuar</span>
                <input
                  type="password"
                  required
                  autoComplete="current-password"
                  value={deletePassword}
                  onChange={(event) => setDeletePassword(event.target.value)}
                />
              </label>

              <div className="account-danger-actions">
                <button className="text-button" type="button" onClick={() => setShowDeleteForm(false)}>
                  Cancelar
                </button>
                <button className="danger-button" type="submit" disabled={isDeleting}>
                  {isDeleting ? 'Excluindo...' : 'Confirmar exclusão'}
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
    </div>
  )
}
