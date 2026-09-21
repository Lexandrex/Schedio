import { useMemo, useState } from 'react'
import { ICON_LIBRARY, filtrarIcones } from './iconLibrary.js'

/** Agrupa mantendo a ordem em que os grupos aparecem no catálogo. */
function porGrupo(icones) {
  const grupos = new Map()
  for (const icone of icones) {
    if (!grupos.has(icone.grupo)) grupos.set(icone.grupo, [])
    grupos.get(icone.grupo).push(icone)
  }
  return [...grupos.entries()]
}

export default function IconLibrary({ onAddIcon }) {
  const [busca, setBusca] = useState('')
  const [aberta, setAberta] = useState(true)

  const grupos = useMemo(() => porGrupo(filtrarIcones(busca)), [busca])
  const total = useMemo(() => filtrarIcones(busca).length, [busca])

  if (!aberta) {
    return (
      <button
        className="library-toggle library-toggle--fechada"
        type="button"
        onClick={() => setAberta(true)}
        title="Abrir biblioteca de ícones"
      >
        ›
      </button>
    )
  }

  return (
    <aside className="icon-library">
      <header className="library-header">
        <h2>Ícones</h2>
        <button
          className="library-toggle"
          type="button"
          onClick={() => setAberta(false)}
          title="Fechar biblioteca"
        >
          ‹
        </button>
      </header>

      <input
        className="library-search"
        type="search"
        placeholder="Filtrar por nome"
        value={busca}
        onChange={(event) => setBusca(event.target.value)}
      />

      <p className="library-hint">
        Arraste para o mapa — ou clique para soltar no centro.
      </p>

      <div className="library-scroll">
        {total === 0 && <p className="library-vazio">Nenhum ícone encontrado.</p>}

        {grupos.map(([grupo, icones]) => (
          <section key={grupo} className="library-group">
            <h3>{grupo}</h3>
            <div className="library-grid">
              {icones.map((icone) => (
                <button
                  key={icone.nome}
                  type="button"
                  className="library-item"
                  title={icone.nome}
                  draggable
                  onDragStart={(event) => {
                    // O canvas lê isto no drop para saber qual ícone criar.
                    event.dataTransfer.setData(
                      'application/x-schedio-icon',
                      JSON.stringify({ nome: icone.nome, path: icone.path }),
                    )
                    event.dataTransfer.effectAllowed = 'copy'
                  }}
                  onClick={() => onAddIcon(icone)}
                >
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.6"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d={icone.path} />
                  </svg>
                  <span className="sr-only">{icone.nome}</span>
                </button>
              ))}
            </div>
          </section>
        ))}
      </div>

      <p className="library-total">
        {total} de {ICON_LIBRARY.length} ícones
      </p>
    </aside>
  )
}
