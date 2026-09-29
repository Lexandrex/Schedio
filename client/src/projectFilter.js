import { useMemo, useState } from 'react'
import { parseTags, tagKey } from './tags.js'

export const ALL_TAGS = 'Todos'

/**
 * Pesquisa + abas de tag sobre uma lista de projetos — o mesmo sistema da tela
 * inicial, reaproveitado no perfil.
 *
 * `searchFields(project)` devolve os textos em que a pesquisa procura: na tela
 * inicial entram título e autor; no perfil, onde o autor é sempre o mesmo,
 * entram título e tags.
 */
export function useProjectFilter(projects, searchFields) {
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState(ALL_TAGS)

  // Cada tag vira um filtro próprio: um projeto "Aventura, Ação" aparece nos dois.
  // "Aventura" e "aventura" são a mesma aba — vale a primeira grafia encontrada.
  const categories = useMemo(() => {
    const unique = new Map()
    for (const project of projects) {
      for (const tag of parseTags(project.categoria)) {
        if (!unique.has(tagKey(tag))) unique.set(tagKey(tag), tag)
      }
    }
    return [ALL_TAGS, ...unique.values()]
  }, [projects])

  const visibleProjects = useMemo(() => {
    const term = tagKey(search.trim())
    return projects.filter((project) => {
      const matchesCategory =
        activeCategory === ALL_TAGS ||
        parseTags(project.categoria).some((tag) => tagKey(tag) === tagKey(activeCategory))
      const matchesSearch =
        !term || searchFields(project).some((field) => tagKey(field).includes(term))
      return matchesCategory && matchesSearch
    })
  }, [projects, search, activeCategory, searchFields])

  return { search, setSearch, categories, activeCategory, setActiveCategory, visibleProjects }
}
