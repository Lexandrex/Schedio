import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import Avatar from './Avatar.jsx'
import { AlertIcon } from './InteractionIcons.jsx'

/**
 * Aba da conta com o que o usuário denunciou — projetos e criadores, cada
 * grupo do mais recente ao mais antigo. Começa fechada (é consulta, não
 * tarefa) e mostra o total no cabeçalho para dizer se vale abrir.
 *
 * A denúncia não se desfaz, então a lista é só de leitura. Um projeto que
 * voltou a ser privado continua nela, mas sem link: a leitura não o abre.
 */
export default function MyReports() {
  const [reports, setReports] = useState({ projects: [], creators: [] })
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    apiRequest('/api/users/me/denuncias')
      .then((data) => setReports({ projects: data.projects, creators: data.creators }))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

  const { projects, creators } = reports
  const total = projects.length + creators.length

  return (
    <section className="account-card reported-card">
      <button
        className="reported-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="reported-list"
        onClick={() => setIsOpen((open) => !open)}
      >
        <AlertIcon size={17} />
        <h2>Denúncias feitas</h2>
        {!isLoading && !error && <span className="profile-works-count">{total}</span>}
        <span className={`reported-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div id="reported-list" className="reported-body">
          {isLoading && <p className="subtitle">Carregando...</p>}
          {error && <p className="home-status home-status--error">{error}</p>}
          {!isLoading && !error && total === 0 && (
            <p className="subtitle">
              Você ainda não fez nenhuma denúncia. Projetos se denunciam na apresentação da obra, e
              criadores, no perfil deles.
            </p>
          )}

          {projects.length > 0 && (
            <ReportGroup title="Projetos" count={projects.length}>
              {projects.map((project) => (
                <ReportedProject key={project.id} project={project} />
              ))}
            </ReportGroup>
          )}

          {creators.length > 0 && (
            <ReportGroup title="Criadores" count={creators.length}>
              {creators.map((creator) => (
                <li key={creator.id}>
                  <Link className="reported-item" to={`/perfil/${creator.id}`}>
                    <span className="reported-avatar" aria-hidden="true">
                      <Avatar foto={creator.foto} size={18} />
                    </span>
                    <span className="reported-info">
                      <span className="reported-title">{creator.nome || creator.email}</span>
                      <span className="reported-author">Criador</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ReportGroup>
          )}
        </div>
      )}
    </section>
  )
}

function ReportGroup({ title, count, children }) {
  return (
    <div className="reported-group">
      <h3 className="reported-group-title">
        {title} <span className="profile-works-count">{count}</span>
      </h3>
      <ul className="reported-list">{children}</ul>
    </div>
  )
}

function ReportedProject({ project }) {
  const isPublished = project.status === 'publicado'
  const content = (
    <>
      <span
        className="reported-cover"
        style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
        aria-hidden="true"
      />
      <span className="reported-info">
        <span className="reported-title">{project.titulo}</span>
        <span className="reported-author">{project.autor_nome || project.autor_email}</span>
      </span>
      {!isPublished && <span className="status-chip">Indisponível</span>}
    </>
  )

  return (
    <li>
      {isPublished ? (
        <Link className="reported-item" to={`/projeto/${project.id}`}>
          {content}
        </Link>
      ) : (
        <div className="reported-item" title="O autor tornou este projeto privado.">
          {content}
        </div>
      )}
    </li>
  )
}
