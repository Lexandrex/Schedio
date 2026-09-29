import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'
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
        <p className="home-status">Nenhum projeto publicado ainda.</p>
      )}

      <div className="project-grid">
        {visibleProjects.map((project) => (
          <Link className="project-card" key={project.id} to={`/projeto/${project.id}`}>
            <div
              className="project-cover"
              style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
            />
            <h2 className="project-title">{project.titulo}</h2>
            <p className="project-author">{project.autor_nome || project.autor_email}</p>
          </Link>
        ))}
      </div>
    </div>
  )
}
