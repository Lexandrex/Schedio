import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'
import { BookmarkIcon, LikeCount } from '../components/InteractionIcons.jsx'
import { useProjectFilter } from '../projectFilter.js'

// Na tela inicial a pesquisa acha tanto pelo título quanto pelo autor.
function searchFields(project) {
  return [project.titulo, project.autor_nome || project.autor_email || '']
}

export default function HomePage() {
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    apiRequest('/api/projects')
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

  const { search, setSearch, categories, activeCategory, setActiveCategory, visibleProjects } =
    useProjectFilter(projects, searchFields)

  // Os salvos sobem para o topo, mas passam pelo mesmo filtro: numa pesquisa
  // ou aba de tag, o salvo que não casa some em vez de atrapalhar a busca.
  const savedProjects = visibleProjects.filter((project) => project.salvo)
  const otherProjects = visibleProjects.filter((project) => !project.salvo)

  return (
    <div className="home-page">
      <header className="home-header">
        <span className="brand-mark">S</span>

        <input
          className="search-input"
          type="search"
          placeholder="Pesquisar"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
        />

        <AccountMenu>
          <Link to="/editor">Editor</Link>
          <Link to="/conta">Conta</Link>
        </AccountMenu>
      </header>

      {categories.length > 1 && (
        <nav className="category-tabs" aria-label="Categorias">
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

      {isLoading && <p className="home-status">Carregando projetos...</p>}
      {error && <p className="home-status home-status--error">{error}</p>}
      {!isLoading && !error && visibleProjects.length === 0 && (
        <p className="home-status">
          {projects.length === 0 ? 'Nenhum projeto publicado ainda.' : 'Nenhum projeto encontrado.'}
        </p>
      )}

      {savedProjects.length > 0 && (
        <section className="home-section home-section--saved" aria-labelledby="home-saved-title">
          <h2 className="home-section-title" id="home-saved-title">
            <BookmarkIcon size={16} filled />
            Salvos
          </h2>
          <ProjectGrid projects={savedProjects} />
        </section>
      )}

      {otherProjects.length > 0 && (
        <section className="home-section" aria-labelledby={savedProjects.length > 0 ? 'home-others-title' : undefined}>
          {/* O título só existe para separar dos salvos; sozinha a lista dispensa. */}
          {savedProjects.length > 0 && (
            <h2 className="home-section-title" id="home-others-title">
              Da comunidade
            </h2>
          )}
          <ProjectGrid projects={otherProjects} />
        </section>
      )}
    </div>
  )
}

function ProjectGrid({ projects }) {
  return (
    <div className="project-grid">
      {projects.map((project) => (
        <Link
          className={`project-card${project.salvo ? ' project-card--saved' : ''}`}
          key={project.id}
          to={`/projeto/${project.id}`}
        >
          <div
            className="project-cover"
            style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
          />
          <h3 className="project-title">{project.titulo}</h3>
          <p className="project-author">{project.autor_nome || project.autor_email}</p>
          <LikeCount likes={project.likes} />
        </Link>
      ))}
    </div>
  )
}
