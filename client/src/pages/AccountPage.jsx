import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import ProfileWorks from '../components/ProfileWorks.jsx'
import ProfilePhotoField from '../components/ProfilePhotoField.jsx'
import TermsDialog from '../components/TermsDialog.jsx'
import MyReports from '../components/MyReports.jsx'

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

  const [terms, setTerms] = useState(null)
  const [retention, setRetention] = useState(null)

  const [projects, setProjects] = useState([])
  const [projectsLoading, setProjectsLoading] = useState(true)
  const [projectsError, setProjectsError] = useState('')

  useEffect(() => {
    apiRequest(`/api/users/${user.id}/perfil`)
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setProjectsError(requestError.message))
      .finally(() => setProjectsLoading(false))
  }, [user.id])

  async function handleSave(event) {
    event.preventDefault()
    setIsSaving(true)
    setFeedback({ message: '', type: 'info' })

    try {
      const data = await apiRequest('/api/users/me', { method: 'PATCH', json: { nome, bio, cor } })
      updateUser(data.user)
      setFeedback({ message: 'Perfil atualizado com sucesso.', type: 'success' })
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }

  // O prazo de guarda vem dos Termos (fonte única no servidor), lido só
  // quando a pessoa decide excluir. Sem ele o aviso some, mas a exclusão segue.
  async function openDeleteForm() {
    setShowDeleteForm(true)
    if (retention !== null) return
    try {
      const data = await apiRequest('/api/termos')
      setRetention(data.retencaoContaExcluidaMeses)
    } catch {
      // O aviso é informativo; o texto completo continua em "Ler os termos vigentes".
    }
  }

  async function openTerms() {
    try {
      setTerms(await apiRequest('/api/termos'))
    } catch (error) {
      setFeedback({ message: error.message, type: 'error' })
    }
  }

  async function handleDelete(event) {
    event.preventDefault()
    setIsDeleting(true)
    setFeedback({ message: '', type: 'info' })

    try {
      await apiRequest('/api/users/me', { method: 'DELETE', json: { password: deletePassword } })
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

      <div className="profile-layout">
        <div className="account-layout">
          <section className="account-card">
            <div className="account-profile-row">
              <ProfilePhotoField
                foto={user.foto}
                onChange={(foto) => updateUser({ foto })}
                onFeedback={setFeedback}
              />
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

          <MyReports />

          <section className="account-card">
            <h2>Termos de Uso</h2>
            <p className="subtitle terms-status">
              {user.termos_versao ? (
                <>
                  Você aceitou a versão <strong>{user.termos_versao}</strong> em{' '}
                  {formatDateTime(user.termos_aceitos_em)}.
                </>
              ) : (
                <>Esta conta foi criada antes dos Termos de Uso e não tem aceite registrado.</>
              )}
            </p>
            <button className="text-button terms-read" type="button" onClick={openTerms}>
              Ler os termos vigentes
            </button>
          </section>

          <section className="account-card account-danger">
            <h2>Excluir conta</h2>
            <p className="subtitle">
              Essa ação é permanente e remove seus dados e projetos da plataforma.
            </p>

            {showDeleteForm && retention !== null && (
              <p className="subtitle account-retention">
                Como descrito nos Termos de Uso, uma cópia dos seus projetos fica guardada, sem
                acesso pela plataforma, por até <strong>{retention} meses</strong> para apuração
                de denúncias, e depois é apagada definitivamente.
              </p>
            )}

            {!showDeleteForm ? (
              <button className="danger-button" type="button" onClick={openDeleteForm}>
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

        <ProfileWorks
          projects={projects}
          isOwner
          isLoading={projectsLoading}
          error={projectsError}
        />
      </div>

      {terms && <TermsDialog terms={terms} onClose={() => setTerms(null)} />}
    </div>
  )
}

function formatDateTime(iso) {
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
