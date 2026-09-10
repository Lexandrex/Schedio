import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { screensOf } from '../canvas/elements.js'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()

  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest(`/api/projects/${id}/leitura`)
      .then((data) => setProject(data.project))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [id])

  if (isLoading) {
    return (
      <div className="detail-page">
        <p className="home-status">Carregando projeto...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="detail-page">
        <p className="home-status home-status--error">{error || 'Projeto não encontrado.'}</p>
        <p>
          <Link to="/">← Voltar para o início</Link>
        </p>
      </div>
    )
  }

  const telas = screensOf(project.conteudo?.elements || [])
  const autor = project.autor_nome || project.autor_email
  const publicadoEm = new Date(project.criado).toLocaleDateString('pt-BR')

  return (
    <div className="detail-page">
      <header className="detail-header">
        <Link className="back-button detail-back" to="/">
          ← Início
        </Link>
      </header>

      <article className="detail-card">
        <div
          className="detail-cover"
          style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
        />

        <div className="detail-info">
          <h1>{project.titulo}</h1>
          <p className="detail-author">{autor}</p>

          <div className="detail-meta">
            {project.categoria && <span className="status-chip">{project.categoria}</span>}
            <span className="detail-date">Publicado em {publicadoEm}</span>
          </div>

          <p className="detail-synopsis">
            {project.descricao || 'Este projeto ainda não tem uma descrição.'}
          </p>

          {telas.length > 0 ? (
            <>
              <button
                className="primary-button detail-read"
                type="button"
                onClick={() => navigate(`/projeto/${id}/ler`)}
              >
                Ler
              </button>
              <p className="detail-hint">
                {telas.length} {telas.length === 1 ? 'tela' : 'telas'} para navegar.
              </p>
            </>
          ) : (
            <p className="detail-hint">
              O autor ainda não montou telas neste projeto, então não há o que navegar.
            </p>
          )}
        </div>
      </article>
    </div>
  )
}
