import { Link } from 'react-router-dom'
import { useProjectFilter } from '../projectFilter.js'
import { parseTags } from '../tags.js'

// No perfil o autor é sempre o mesmo, então a pesquisa olha título e tags.
function searchFields(project) {
  return [project.titulo, ...parseTags(project.categoria)]
}

/**
 * Obras de um criador, com a mesma pesquisa e abas de tag da tela inicial.
 *
 * Com `isOwner`, a lista inclui as privadas: elas levam ao editor (a leitura
 * só abre projetos publicados) e ganham um selo para não se confundirem com
 * as que outras pessoas já podem ver.
 */
export default function ProfileWorks({ projects, isOwner, isLoading, error }) {
  const { search, setSearch, categories, activeCategory, setActiveCategory, visibleProjects } =
    useProjectFilter(projects, searchFields)

  const total = projects.length
  const emptyMessage =
    total === 0
      ? isOwner
        ? 'Você ainda não criou nenhuma obra.'
        : 'Este criador ainda não publicou nenhuma obra.'
      : 'Nenhuma obra encontrada.'

  return (
    <section className="profile-works" aria-labelledby="profile-works-title">
      <header className="profile-works-header">
        <h2 id="profile-works-title">
          Obras {!isLoading && !error && <span className="profile-works-count">{total}</span>}
        </h2>
        <input
          className="search-input"
          type="search"
          placeholder="Pesquisar obras"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />
      </header>

      {categories.length > 1 && (
        <nav className="category-tabs" aria-label="Tags das obras">
          {categories.map((category) => (
            <button
              key={category}
              type="button"
              className={`category-tab${category === activeCategory ? ' active' : ''}`}
              onClick={() => setActiveCategory(category)}
            >
              {category}
            </button>
          ))}
        </nav>
      )}

      {isLoading && <p className="home-status">Carregando obras...</p>}
      {error && <p className="home-status home-status--error">{error}</p>}
      {!isLoading && !error && visibleProjects.length === 0 && (
        <p className="home-status">{emptyMessage}</p>
      )}

      <div className="project-grid">
        {visibleProjects.map((project) => {
          const isPublished = project.status === 'publicado'
          return (
            <Link
              className="project-card"
              key={project.id}
              to={isPublished ? `/projeto/${project.id}` : `/editor/${project.id}`}
              title={isPublished ? undefined : 'Privado — abre no editor'}
            >
              <div
                className="project-cover"
                style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
              >
                {isOwner && !isPublished && <span className="status-chip project-cover-chip">Privado</span>}
              </div>
              <h3 className="project-title">{project.titulo}</h3>
              <p className="project-author">
                {new Date(project.criado).toLocaleDateString('pt-BR')}
              </p>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
