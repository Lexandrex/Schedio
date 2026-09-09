import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'

export default function HomePage() {
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')

  useEffect(() => {
    apiRequest('/api/projects')
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

  const categories = useMemo(() => {
    const unique = [...new Set(projects.map((project) => project.categoria).filter(Boolean))]
    return ['Todos', ...unique]
  }, [projects])

  const visibleProjects = useMemo(() => {
    const term = search.trim().toLowerCase()
    return projects.filter((project) => {
      const matchesCategory = activeCategory === 'Todos' || project.categoria === activeCategory
      const matchesSearch =
        !term ||
        project.titulo.toLowerCase().includes(term) ||
        (project.autor_nome || project.autor_email || '').toLowerCase().includes(term)
      return matchesCategory && matchesSearch
    })
  }, [projects, search, activeCategory])

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
          <article className="project-card" key={project.id}>
            <div
              className="project-cover"
              style={project.capa ? { backgroundImage: `url(${project.capa})` } : undefined}
            />
            <h2 className="project-title">{project.titulo}</h2>
            <p className="project-author">{project.autor_nome || project.autor_email}</p>
          </article>
        ))}
      </div>
    </div>
  )
}
