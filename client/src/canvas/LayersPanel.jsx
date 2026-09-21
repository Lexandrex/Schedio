import { useMemo, useState } from 'react'
import {
  REORDER,
  TOOLS,
  elementLabel,
  isScreen,
  screenContaining,
  screensOf,
} from './elements.js'

/** Miniatura do tipo. Ícone desenha o próprio traço — o catálogo já vem no elemento. */
const GLYPHS = {
  [TOOLS.screen]: 'M7 3h10v18H7z M10 6h4',
  [TOOLS.rect]: 'M4 6h16v12H4z',
  [TOOLS.ellipse]: 'M12 12m-8 0a8 6 0 1 0 16 0a8 6 0 1 0-16 0',
  [TOOLS.text]: 'M5 6h14 M12 6v13 M9 19h6',
  [TOOLS.image]: 'M3 5h18v14H3z M7 11a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3 M5 17l4.5-5 3.5 4 2.5-2.5L21 17',
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}

/**
 * Agrupa os elementos pela tela que os contém. A lista é lida de cima para
 * baixo com quem desenha por cima primeiro — o inverso da ordem do array, que
 * é a ordem de desenho.
 */
function montarCamadas(elements) {
  const telas = screensOf(elements)
  const donoDe = new Map()

  for (const element of elements) {
    if (isScreen(element)) continue
    donoDe.set(element.id, screenContaining(elements, element)?.id || null)
  }

  const grupos = [...telas].reverse().map((tela) => ({
    tela,
    filhos: elements.filter((element) => donoDe.get(element.id) === tela.id).reverse(),
  }))

  const soltos = elements.filter((element) => donoDe.get(element.id) === null).reverse()
  return { grupos, soltos }
}

function Glyph({ element }) {
  const path = element.type === TOOLS.icon ? element.path : GLYPHS[element.type]
  return (
    <svg
      className="layer-glyph"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={path} />
    </svg>
  )
}

function LayerRow({
  element,
  nested,
  isSelected,
  isStart,
  isEditing,
  rascunho,
  onRascunho,
  onEdit,
  onConfirm,
  onCancel,
  onSelect,
  onUpdate,
  onReorder,
  onFocus,
}) {
  const oculto = element.hidden === true
  const travado = element.locked === true
  const nome = elementLabel(element)

  const classes = ['layer-row']
  if (nested) classes.push('layer-row--filho')
  if (isSelected) classes.push('selected')
  if (oculto) classes.push('oculto')

  return (
    <div className={classes.join(' ')}>
      <button
        type="button"
        className={`layer-toggle${oculto ? ' on' : ''}`}
        onClick={() => onUpdate(element.id, { hidden: !oculto })}
        title={oculto ? 'Mostrar no mapa' : 'Ocultar do mapa e da simulação'}
        aria-pressed={oculto}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          {oculto ? (
            <path d="M4 4l16 16 M10.5 6.3A9 9 0 0 1 12 6c5 0 9 6 9 6a15 15 0 0 1-3 3.3 M6.2 8.1A15 15 0 0 0 3 12s4 6 9 6a9 9 0 0 0 3.3-.6" />
          ) : (
            <path d="M3 12s4-6 9-6 9 6 9 6-4 6-9 6-9-6-9-6 M12 14.2a2.2 2.2 0 1 0 0-4.4 2.2 2.2 0 0 0 0 4.4" />
          )}
        </svg>
        <span className="sr-only">{oculto ? 'Mostrar' : 'Ocultar'}</span>
      </button>

      <button
        type="button"
        className={`layer-toggle${travado ? ' on' : ''}`}
        onClick={() => onUpdate(element.id, { locked: !travado })}
        title={travado ? 'Destravar para mover pelo mapa' : 'Travar a posição no mapa'}
        aria-pressed={travado}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true">
          {travado ? (
            <path d="M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3" />
          ) : (
            <path d="M6 11h12v9H6z M9 11V8a3 3 0 0 1 5.8-1" />
          )}
        </svg>
        <span className="sr-only">{travado ? 'Destravar' : 'Travar'}</span>
      </button>

      {isEditing ? (
        <input
          className="layer-rename"
          type="text"
          maxLength={60}
          value={rascunho}
          autoFocus
          onChange={(event) => onRascunho(event.target.value)}
          onBlur={onConfirm}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault()
              onConfirm()
            }
            if (event.key === 'Escape') {
              event.preventDefault()
              onCancel()
            }
          }}
        />
      ) : (
        <button
          type="button"
          className="layer-name"
          onClick={() => onSelect(element.id)}
          onDoubleClick={() => onEdit(element)}
          title={nome + ' — duplo clique para renomear'}
        >
          <Glyph element={element} />
          <span className="layer-text">{nome}</span>
          {isStart && (
            <span className="layer-start" title="Tela inicial da simulação">
              ▶
            </span>
          )}
        </button>
      )}

      <span className="layer-actions">
        <button type="button" onClick={() => onFocus(element.id)} title="Centralizar o mapa aqui">
          ⌖
        </button>
        <button
          type="button"
          onClick={() => onReorder(element.id, REORDER.frente)}
          title="Trazer para frente"
        >
          ↑
        </button>
        <button
          type="button"
          onClick={() => onReorder(element.id, REORDER.tras)}
          title="Enviar para trás"
        >
          ↓
        </button>
      </span>
    </div>
  )
}

/**
 * Lista de camadas do mapa: mostra em que tela cada elemento está e em que
 * ordem eles se desenham. É por aqui que se renomeia, oculta, trava e reordena
 * — inclusive o que está escondido atrás de outro e não dá para clicar no mapa.
 */
export default function LayersPanel({
  elements,
  selectedId,
  startScreenId,
  aberta,
  onAbrir,
  onFechar,
  onSelect,
  onUpdate,
  onReorder,
  onDuplicate,
  onDelete,
  onFocus,
}) {
  const [busca, setBusca] = useState('')
  const [editandoId, setEditandoId] = useState(null)
  const [rascunho, setRascunho] = useState('')

  const { grupos, soltos } = useMemo(() => montarCamadas(elements), [elements])

  const alvo = normalizar(busca)
  const combina = (element) => !alvo || normalizar(elementLabel(element)).includes(alvo)

  const gruposFiltrados = grupos
    .map(({ tela, filhos }) => ({
      tela,
      // Tela que casa com a busca continua mostrando todo o conteúdo dela.
      visivel: combina(tela),
      filhos: combina(tela) ? filhos : filhos.filter(combina),
    }))
    .filter((grupo) => grupo.visivel || grupo.filhos.length > 0)

  const soltosFiltrados = soltos.filter(combina)
  const vazio = gruposFiltrados.length === 0 && soltosFiltrados.length === 0

  function iniciarEdicao(element) {
    onSelect(element.id)
    setEditandoId(element.id)
    setRascunho(element.name || elementLabel(element))
  }

  function confirmarEdicao() {
    if (!editandoId) return
    const element = elements.find((item) => item.id === editandoId)
    const nome = rascunho.trim()
    // Apagar o nome devolve o rótulo automático — mas tela não tem rótulo para
    // onde cair: é o nome dela que aparece no mapa e no simulador.
    if (element) onUpdate(editandoId, { name: nome || (isScreen(element) ? 'Tela' : null) })
    setEditandoId(null)
  }

  const linhaProps = (element, nested) => ({
    element,
    nested,
    isSelected: element.id === selectedId,
    isStart: element.id === startScreenId,
    isEditing: element.id === editandoId,
    rascunho,
    onRascunho: setRascunho,
    onEdit: iniciarEdicao,
    onConfirm: confirmarEdicao,
    onCancel: () => setEditandoId(null),
    onSelect,
    onUpdate,
    onReorder,
    onFocus,
  })

  if (!aberta) {
    return (
      <button className="rail-closed" type="button" onClick={onAbrir} title="Abrir camadas">
        <span>Camadas</span>
        <span aria-hidden="true">›</span>
      </button>
    )
  }

  return (
    <aside className="layers-panel">
      <header className="library-header">
        <h2>Camadas</h2>
        <button className="library-toggle" type="button" onClick={onFechar} title="Fechar camadas">
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

      <div className="library-scroll layers-scroll">
        {vazio && (
          <p className="library-vazio">
            {elements.length
              ? 'Nenhuma camada com esse nome.'
              : 'O mapa está vazio. Crie uma tela para começar.'}
          </p>
        )}

        {gruposFiltrados.map(({ tela, filhos }) => (
          <section key={tela.id} className="layer-group">
            <LayerRow key={tela.id} {...linhaProps(tela, false)} />
            {filhos.map((element) => (
              <LayerRow key={element.id} {...linhaProps(element, true)} />
            ))}
            {filhos.length === 0 && <p className="layer-vazia">Tela sem conteúdo</p>}
          </section>
        ))}

        {soltosFiltrados.length > 0 && (
          <section className="layer-group">
            <h3>Fora das telas</h3>
            {soltosFiltrados.map((element) => (
              <LayerRow key={element.id} {...linhaProps(element, false)} />
            ))}
          </section>
        )}
      </div>

      {selectedId && (
        <div className="layer-footer">
          <button type="button" className="text-button" onClick={() => onDuplicate(selectedId)}>
            Duplicar
          </button>
          <button type="button" className="text-button" onClick={() => onDelete(selectedId)}>
            Excluir
          </button>
        </div>
      )}

      <p className="library-total">{elements.length} elemento(s) · duplo clique renomeia</p>
    </aside>
  )
}
