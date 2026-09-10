import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import PrototypePlayer from '../canvas/PrototypePlayer.jsx'

export default function ProjectReaderPage() {
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
        <p className="home-status">Carregando leitura...</p>
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

  const conteudo = project.conteudo || {}

  return (
    <PrototypePlayer
      elements={conteudo.elements || []}
      connections={conteudo.connections || []}
      startScreenId={conteudo.startScreen || null}
      showArrows
      exitLabel="Sair da leitura (Esc)"
      emptyMessage="Este projeto ainda não tem telas para navegar."
      onClose={() => navigate(`/projeto/${id}`)}
    />
  )
}
