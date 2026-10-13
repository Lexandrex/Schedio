import { useEffect, useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import { AlertIcon, BookmarkIcon, HeartIcon } from '../components/InteractionIcons.jsx'
import { screensOf } from '../canvas/elements.js'
import { parseTags } from '../tags.js'

export default function ProjectDetailPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const { user } = useAuth()

  const [project, setProject] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  // Qual marca está indo ao servidor: trava só o botão dela contra clique duplo.
  const [pending, setPending] = useState(null)
  const [actionError, setActionError] = useState('')
  const [confirmReport, setConfirmReport] = useState(false)

  useEffect(() => {
    apiRequest(`/api/projects/${id}/leitura`)
      .then((data) => setProject(data.project))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [id])

  /** Envia uma marca e aplica na tela o que o servidor devolveu. */
  async function sendMark(mark, path, method) {
    setPending(mark)
    setActionError('')
    try {
      const data = await apiRequest(`/api/projects/${id}/${path}`, { method })
      setProject((current) => ({ ...current, ...data }))
      return true
    } catch (requestError) {
      setActionError(requestError.message)
      return false
    } finally {
      setPending(null)
    }
  }

  const toggleLike = () => sendMark('like', 'like', project.curtido ? 'DELETE' : 'PUT')
  const toggleSave = () => sendMark('salvo', 'salvo', project.salvo ? 'DELETE' : 'PUT')

  async function report() {
    if (await sendMark('denuncia', 'denuncia', 'POST')) setConfirmReport(false)
  }

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
  const tags = parseTags(project.categoria)
  const autor = project.autor_nome || project.autor_email
  const publicadoEm = new Date(project.criado).toLocaleDateString('pt-BR')
  const isOwn = project.autor_id === user.id
  // Voltando da leitura, quem ainda não curtiu ganha um convite junto do botão.
  const cameFromReading = location.state?.fromReading && !project.curtido

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
          <p className="detail-author">
            <Link className="detail-author-link" to={`/perfil/${project.autor_id}`}>
              {autor}
            </Link>
          </p>

          <div className="detail-actions">
            <button
              className={`detail-action${project.salvo ? ' active' : ''}`}
              type="button"
              aria-pressed={project.salvo}
              disabled={pending === 'salvo'}
              title={project.salvo ? 'Tirar dos salvos' : 'Salvar para ler depois'}
              onClick={toggleSave}
            >
              <BookmarkIcon filled={project.salvo} />
              {project.salvo ? 'Salvo' : 'Salvar'}
            </button>

            <button
              className={`detail-action detail-action--like${project.curtido ? ' active' : ''}`}
              type="button"
              aria-pressed={project.curtido}
              disabled={pending === 'like'}
              title={project.curtido ? 'Desfazer like' : 'Dar like'}
              onClick={toggleLike}
            >
              <HeartIcon filled={project.curtido} />
              Like
              <span className="detail-action-count" aria-label={`${project.likes} likes`}>
                {project.likes}
              </span>
            </button>

            {/* O botão fica visível para o autor, mas desligado, com o motivo —
                a mesma ideia do "Editar" de projeto publicado. */}
            <button
              className={`detail-action detail-action--report${project.denunciado ? ' active' : ''}`}
              type="button"
              disabled={isOwn || project.denunciado || pending === 'denuncia'}
              title={
                isOwn
                  ? 'Você não pode denunciar o próprio projeto.'
                  : project.denunciado
                    ? 'Você já denunciou este projeto. Veja a lista na sua conta.'
                    : 'Denunciar este projeto'
              }
              onClick={() => setConfirmReport(true)}
            >
              <AlertIcon />
              {project.denunciado ? 'Denunciado' : 'Denunciar'}
            </button>
          </div>

          {cameFromReading && <p className="detail-hint detail-like-hint">Gostou da leitura? Deixe seu like.</p>}

          {confirmReport && !project.denunciado && (
            <div className="detail-report-confirm" role="alertdialog" aria-label="Confirmar denúncia">
              <p>
                Denunciar <strong>{project.titulo}</strong>? A denúncia não pode ser desfeita e o
                projeto será avaliado depois.
              </p>
              <div className="detail-report-actions">
                <button className="text-button" type="button" onClick={() => setConfirmReport(false)}>
                  Cancelar
                </button>
                <button
                  className="danger-button"
                  type="button"
                  disabled={pending === 'denuncia'}
                  onClick={report}
                >
                  {pending === 'denuncia' ? 'Denunciando...' : 'Denunciar'}
                </button>
              </div>
            </div>
          )}

          {actionError && <p className="home-status home-status--error">{actionError}</p>}

          <div className="detail-meta">
            {tags.map((tag) => (
              <span className="status-chip" key={tag}>
                {tag}
              </span>
            ))}
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
