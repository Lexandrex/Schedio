import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'
import TrashIcon from '../components/TrashIcon.jsx'
import { MAX_TAGS_LENGTH, TAGS_HINT, formatTags, parseTags } from '../tags.js'

const STATUS_LABEL = {
  publicado: 'Público',
  privado: 'Privado',
}

export default function EditorPage() {
  const navigate = useNavigate()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [selectedId, setSelectedId] = useState(null)

  // Um formulário só para criar e editar: null quando fechado, e `id` null
  // enquanto é um projeto novo.
  const [form, setForm] = useState(null)
  const [isSaving, setIsSaving] = useState(false)
  const [formError, setFormError] = useState('')

  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)

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

  // Prévia do que o campo vira: o usuário vê as tags já separadas enquanto digita.
  const tagsDoForm = useMemo(() => parseTags(form?.tags), [form])

  function openNewProject() {
    setForm({ id: null, titulo: '', tags: '', descricao: '' })
    setFormError('')
  }

  function openEditProject(project) {
    setForm({
      id: project.id,
      titulo: project.titulo,
      tags: project.categoria || '',
      descricao: project.descricao || '',
    })
    setFormError('')
  }

  function closeForm() {
    setForm(null)
    setFormError('')
  }

  /** Remove uma tag da lista sem mexer nas outras (o campo é um texto só). */
  function removeTag(alvo) {
    setForm((current) => ({
      ...current,
      tags: formatTags(parseTags(current.tags).filter((tag) => tag !== alvo)),
    }))
  }

  async function handleSubmit(event) {
    event.preventDefault()

    const categoria = formatTags(tagsDoForm)
    if (categoria.length > MAX_TAGS_LENGTH) {
      setFormError(
        `As tags devem somar até ${MAX_TAGS_LENGTH} caracteres. Use menos tags ou tags mais curtas.`,
      )
      return
    }

    setIsSaving(true)
    setFormError('')

    const corpo = JSON.stringify({ titulo: form.titulo, categoria, descricao: form.descricao })

    try {
      if (form.id) {
        const data = await apiRequest(`/api/projects/${form.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: corpo,
        })
        setProjects((current) =>
          current.map((project) => (project.id === form.id ? data.project : project)),
        )
      } else {
        const data = await apiRequest('/api/projects', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: corpo,
        })
        setProjects((current) => [data.project, ...current])
      }
      closeForm()
    } catch (requestError) {
      setFormError(requestError.message)
    } finally {
      setIsSaving(false)
    }
  }

  async function toggleStatus(project) {
    const status = project.status === 'publicado' ? 'privado' : 'publicado'
    setIsPublishing(true)
    setError('')

    try {
      const data = await apiRequest(`/api/projects/${project.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setProjects((current) =>
        current.map((item) => (item.id === project.id ? { ...item, status: data.project.status } : item)),
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsPublishing(false)
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

        <button className="new-project-button" type="button" onClick={openNewProject}>
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
        {visibleProjects.map((project) => {
          const tags = parseTags(project.categoria)

          return (
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
              {tags.length > 0 && (
                <ul className="tag-list" aria-label={`Tags de ${project.titulo}`}>
                  {tags.map((tag) => (
                    <li className="status-chip" key={tag}>
                      {tag}
                    </li>
                  ))}
                </ul>
              )}
              <div className="editor-card-footer">
                <span className={`status-chip status-chip--${project.status}`}>
                  {STATUS_LABEL[project.status] || project.status}
                </span>
                {project.id === selectedId && (
                  <div className="editor-card-actions">
                    <button
                      className="editor-card-open"
                      type="button"
                      disabled={isPublishing}
                      onClick={() => toggleStatus(project)}
                    >
                      {project.status === 'publicado' ? 'Tornar privado' : 'Publicar'}
                    </button>
                    {/* Publicado o projeto já está na mão do leitor: o botão fica
                        visível, mas desligado, para a regra ficar explícita. */}
                    <button
                      className="editor-card-open"
                      type="button"
                      disabled={project.status === 'publicado'}
                      title={
                        project.status === 'publicado'
                          ? 'Torne o projeto privado para editar os dados dele.'
                          : 'Editar título, descrição e tags'
                      }
                      onClick={() => openEditProject(project)}
                    >
                      Editar
                    </button>
                    <Link className="editor-card-open" to={`/editor/${project.id}`}>
                      Abrir
                    </Link>
                  </div>
                )}
              </div>
            </article>
          )
        })}
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

      {form && (
        <div
          className="modal-overlay"
          role="dialog"
          aria-modal="true"
          aria-label={form.id ? 'Editar projeto' : 'Novo projeto'}
        >
          <div className="modal-card">
            <h2>{form.id ? 'Editar projeto' : 'Novo projeto'}</h2>

            <form className="auth-form" onSubmit={handleSubmit}>
              <label>
                <span>Título</span>
                <input
                  type="text"
                  maxLength={160}
                  required
                  autoFocus
                  value={form.titulo}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, titulo: event.target.value }))
                  }
                />
              </label>

              <label>
                <span>Tags</span>
                <input
                  type="text"
                  placeholder="Aventura, Ação, Mistério"
                  value={form.tags}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, tags: event.target.value }))
                  }
                  aria-describedby="tags-hint"
                />
              </label>
              <p className="field-hint" id="tags-hint">
                {TAGS_HINT}
              </p>
              {tagsDoForm.length > 0 && (
                <ul className="tag-list tag-list--editavel" aria-label="Tags do projeto">
                  {tagsDoForm.map((tag) => (
                    <li className="status-chip" key={tag}>
                      {tag}
                      <button
                        className="tag-remove"
                        type="button"
                        aria-label={`Remover a tag ${tag}`}
                        title={`Remover a tag ${tag}`}
                        onClick={() => removeTag(tag)}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                </ul>
              )}

              <label>
                <span>Descrição</span>
                <textarea
                  className="bio-textarea"
                  placeholder="Sobre o que é esse projeto?"
                  value={form.descricao}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, descricao: event.target.value }))
                  }
                />
              </label>

              {formError && (
                <p className="feedback" role="status" data-type="error">
                  {formError}
                </p>
              )}

              <div className="modal-actions">
                <button className="text-button" type="button" onClick={closeForm}>
                  Cancelar
                </button>
                <button className="primary-button" type="submit" disabled={isSaving}>
                  {isSaving
                    ? 'Salvando...'
                    : form.id
                      ? 'Salvar alterações'
                      : 'Criar projeto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
