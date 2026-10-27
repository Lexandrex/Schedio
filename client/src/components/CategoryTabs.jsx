/** Abas de tag do `useProjectFilter`; com uma tag só (a "Todos") não há o que escolher. */
export default function CategoryTabs({ categories, active, onChange, label }) {
  if (categories.length <= 1) return null

  return (
    <nav className="category-tabs" aria-label={label}>
      {categories.map((category) => (
        <button
          key={category}
          type="button"
          className={`category-tab${category === active ? ' active' : ''}`}
          onClick={() => onChange(category)}
        >
          {category}
        </button>
      ))}
    </nav>
  )
}
