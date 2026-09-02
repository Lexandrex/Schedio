import { useEffect, useMemo, useRef, useState } from 'react'
import { apiRequest } from '../api.js'
import { useAuth } from '../context/AuthContext.jsx'
import UserIcon from '../components/UserIcon.jsx'

export default function HomePage() {
  const { user, logout } = useAuth()
  const [projects, setProjects] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('Todos')
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef(null)

  useEffect(() => {
    apiRequest('/api/projects')
      .then((data) => setProjects(data.projects))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [])

  useEffect(() => {
    if (!menuOpen) return undefined

    function handleClickOutside(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setMenuOpen(false)
      }
    }

    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [menuOpen])

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

        <div className="avatar-menu" ref={menuRef}>
          <button
            className="avatar-button"
            type="button"
            onClick={() => setMenuOpen((open) => !open)}
            aria-haspopup="true"
            aria-expanded={menuOpen}
            aria-label="Menu da conta"
          >
            <UserIcon />
          </button>

          {menuOpen && (
            <div className="avatar-dropdown" role="menu">
              <p className="avatar-dropdown-email">{user.email}</p>
              <button type="button" onClick={logout}>
                Sair
              </button>
            </div>
          )}
        </div>
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
