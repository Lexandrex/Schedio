import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'
import TrashIcon from '../components/TrashIcon.jsx'

const STATUS_LABEL = {
  publicado: 'Publicado',
  privado: 'Privado',
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  const [showNewProject, setShowNewProject] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [categoria, setCategoria] = useState('')
  const [descricao, setDescricao] = useState('')
  const [isCreating, setIsCreating] = useState(false)
  const [formError, setFormError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  useEffect(() => {
    apiRequest('/api/projects/mine')
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    if (!term) return projects
    return projects.filter((project) => project.titulo.toLowerCase().includes(term))
  }, [projects, search])

  const selectedProject = projects.find((project) => project.id === selectedId) || null

  function closeNewProject() {
    setShowNewProject(false)
    setTitulo('')
    setCategoria('')
    setDescricao('')
    setFormError('')
  }

  async function handleCreate(event) {
    event.preventDefault()
    setIsCreating(true)
    setFormError('')

    try {
      const data = await apiRequest('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titulo, categoria, descricao }),
      })
      setProjects((current) => [data.project, ...current])
      closeNewProject()
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setIsCreating(false)
    }
  }

  async function handleDelete() {
    if (!selectedProject) return
    setIsDeleting(true)

    try {
      await apiRequest(`/api/projects/${selectedProject.id}`, { method: 'DELETE' })
      setProjects((current) => current.filter((project) => project.id !== selectedProject.id))
      setSelectedId(null)
      setConfirmDelete(false)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsDeleting(false)
    }
  }

  return (
    <div className="editor-page">
      <header className="editor-header">
        <span className="brand-mark">S</span>

        <input
          className="search-input"
          type="search"
          placeholder="Pesquisar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <button className="new-project-button" type="button" onClick={() => setShowNewProject(true)}>
          <span aria-hidden="true">+</span> Novo projeto
        </button>

        <AccountMenu>
          <Link to="/">Início</Link>
          <Link to="/conta">Conta</Link>
        </AccountMenu>
      </header>

      {isLoading && <p className="home-status">Carregando projetos...</p>}
      {error && <p className="home-status home-status--error">{error}</p>}
      {!isLoading && !error && visibleProjects.length === 0 && (
        <p className="home-status">
          {projects.length === 0
            ? 'Você ainda não criou nenhum projeto.'
            : 'Nenhum projeto encontrado para essa busca.'}
        </p>
      )}

      <div className="editor-grid">
        {visibleProjects.map((project) => (
          <article
            className={`editor-card${project.id === selectedId ? ' selected' : ''}`}
            key={project.id}
          >
            <h2 className="editor-card-title">{project.titulo}</h2>
            <button
              className="editor-card-cover"
              type="button"
              aria-pressed={project.id === selectedId}
              title="Clique para selecionar, duplo clique para abrir"
              onClick={() => {
                setConfirmDelete(false)
                setSelectedId((current) => (current === project.id ? null : project.id))
              }}
              onDoubleClick={() => navigate(`/editor/${project.id}`)}
              style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
            />
            <div className="editor-card-footer">
              <p className="editor-card-status">{STATUS_LABEL[project.status] || project.status}</p>
              {project.id === selectedId && (
                <Link className="editor-card-open" to={`/editor/${project.id}`}>
                  Abrir
                </Link>
              )}
            </div>
          </article>
        ))}
      </div>

      <div className="trash-area">
        {confirmDelete && selectedProject && (
          <div className="trash-confirm">
            <p>
              Excluir <strong>{selectedProject.titulo}</strong>?
            </p>
            <div className="trash-confirm-actions">
              <button className="text-button" type="button" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </button>
              <button className="danger-button" type="button" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? 'Excluindo...' : 'Excluir'}
              </button>
            </div>
          </div>
        )}

        <button
          className="trash-fab"
          type="button"
          disabled={!selectedProject}
          onClick={() => setConfirmDelete(true)}
          aria-label={
            selectedProject ? `Excluir projeto ${selectedProject.titulo}` : 'Selecione um projeto para excluir'
          }
          title={selectedProject ? 'Excluir projeto selecionado' : 'Selecione um projeto para excluir'}
        >
          <TrashIcon />
        </button>
      </div>

      {showNewProject && (
        <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Novo projeto">
          <div className="modal-card">
            <h2>Novo projeto</h2>

            <form className="auth-form" onSubmit={handleCreate}>
              <label>
                <span>Título</span>
                <input
                  type="text"
                  maxLength={160}
                  required
                  autoFocus
                  value={titulo}
                  onChange={(event) => setTitulo(event.target.value)}
                />
              </label>

              <label>
                <span>Categoria</span>
                <input
                  type="text"
                  maxLength={60}
                  placeholder="Aventura, Artigos..."
                  value={categoria}
                  onChange={(event) => setCategoria(event.target.value)}
                />
              </label>

              <label>
                <span>Descrição</span>
                <textarea
                  className="bio-textarea"
                  placeholder="Sobre o que é esse projeto?"
                  value={descricao}
                  onChange={(event) => setDescricao(event.target.value)}
                />
              </label>

              {formError && (
                <p className="feedback" role="status" data-type="error">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button className="text-button" type="button" onClick={closeNewProject}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={isCreating}>
                  {isCreating ? 'Criando...' : 'Criar projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
