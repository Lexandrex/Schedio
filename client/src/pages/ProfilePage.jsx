import { useEffect, useState } from 'react'
import { Link, Navigate, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import ProfileWorks from '../components/ProfileWorks.jsx'
import UserIcon from '../components/UserIcon.jsx'

const NO_PROJECTS = []

/**
 * Perfil de um criador visto por outra pessoa: apresentação e obras publicadas.
 * O próprio perfil mora em `/conta`, que tem as mesmas obras e ainda a edição.
 */
export default function ProfilePage() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()

  // O resultado guarda o id que carregou: trocar de perfil (ex.: voltar no
  // histórico) já conta como carregando, sem zerar estado dentro do efeito.
  const [result, setResult] = useState(null)

  const isSelf = id === user.id
  const isLoading = result?.id !== id
  const profile = isLoading ? null : result.profile
  const projects = isLoading ? NO_PROJECTS : result.projects
  const error = isLoading ? '' : result.error

  useEffect(() => {
    if (isSelf) return
    apiRequest(`/api/users/${id}/perfil`)
      .then((data) => setResult({ id, profile: data.user, projects: data.projects, error: '' }))
      .catch((requestError) =>
        setResult({ id, profile: null, projects: [], error: requestError.message }),
      )
  }, [id, isSelf])

  if (isSelf) return <Navigate to="/conta" replace />

  // Volta para onde a pessoa estava (normalmente a apresentação da obra);
  // aberto direto pelo link, não há histórico e o início é o destino natural.
  function handleBack() {
    if (window.history.state?.idx > 0) navigate(-1)
    else navigate('/')
  }

  return (
    <div className="account-page">
      <header className="account-header">
        <button className="back-button account-back" type="button" onClick={handleBack}>
          ← Voltar
        </button>
        <span className="brand-mark">S</span>
      </header>

      {!isLoading && !profile ? (
        <>
          <p className="home-status home-status--error">{error || 'Perfil não encontrado.'}</p>
          <p>
            <Link to="/">← Voltar para o início</Link>
          </p>
        </>
      ) : (
        <div className="profile-layout">
          <div className="account-layout">
            <section className="account-card">
              <div className="account-profile-row">
                <span className="account-avatar" aria-hidden="true">
                  <UserIcon size={34} />
                </span>
                <div>
                  <h1>{profile ? profile.nome || profile.email : 'Carregando...'}</h1>
                  <p className="subtitle">Criador</p>
                </div>
              </div>
              {profile && (
                <p className="profile-bio">
                  {profile.bio || 'Este criador ainda não escreveu uma descrição.'}
                </p>
              )}
            </section>
          </div>

          <ProfileWorks projects={projects} isOwner={false} isLoading={isLoading} error={error} />
        </div>
      )}
    </div>
  )
}
