import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { AlertIcon } from './InteractionIcons.jsx'

/**
 * Aba da conta com os projetos que o usuário denunciou, do mais recente ao
 * mais antigo. Começa fechada (é consulta, não tarefa) e mostra o total no
 * cabeçalho para dizer se vale abrir.
 *
 * A denúncia não se desfaz, então a lista é só de leitura. Um projeto que
 * voltou a ser privado continua nela, mas sem link: a leitura não o abre.
 */
export default function ReportedProjects() {
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  useEffect(() => {
    apiRequest('/api/users/me/denuncias')
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

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
        <h2>Projetos denunciados</h2>
        {!isLoading && !error && <span className="profile-works-count">{projects.length}</span>}
        <span className={`reported-chevron${isOpen ? ' open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>

      {isOpen && (
        <div id="reported-list" className="reported-body">
          {isLoading && <p className="subtitle">Carregando...</p>}
          {error && <p className="home-status home-status--error">{error}</p>}
          {!isLoading && !error && projects.length === 0 && (
            <p className="subtitle">
              Você ainda não denunciou nenhum projeto. Para denunciar, use o botão Denunciar na
              apresentação da obra.
            </p>
          )}

          {projects.length > 0 && (
            <ul className="reported-list">
              {projects.map((project) => (
                <ReportedItem key={project.id} project={project} />
              ))}
            </ul>
          )}
        </div>
      )}
    </section>
  )
}

function ReportedItem({ project }) {
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
