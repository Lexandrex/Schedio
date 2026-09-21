import { useEffect, useRef, useState } from 'react'
import {
  TOOLS,
  boxOf,
  childrenOfScreen,
  createScreen,
  createShape,
  createText,
  isHidden,
  isLocked,
  isScreen,
  normalizeRect,
} from './elements.js'
import { connectionAnchors } from './connections.js'
import { measureText, textStyle, verticalOffset } from './textMetrics.js'
import CanvasElement from './CanvasElement.jsx'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 4
const MIN_SIZE = 4
const HANDLES = ['nw', 'ne', 'se', 'sw']
const DEFAULT_SCREEN = { width: 360, height: 640 }

export default function CanvasStage({
  elements,
  connections,
  selectedId,
  selectedConnectionId,
  startScreenId,
  tool,
  view,
  pendingFrom,
  onViewChange,
  onSelect,
  onSelectConnection,
  onCreate,
  onUpdate,
  onUpdateMany,
  onConnectPick,
  onPointerCoords,
  onDropIcon,
}) {
  const svgRef = useRef(null)
  const editorRef = useRef(null)
  const dragRef = useRef(null)
  // Último elemento clicado. O `dblclick` não serve para descobrir isso: a
  // captura de ponteiro do arraste redireciona esse evento para o <svg>.
  const lastHitRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [cursorPoint, setCursorPoint] = useState(null)
  const [editingId, setEditingId] = useState(null)

  const selected = elements.find((element) => element.id === selectedId) || null
  const editing = elements.find((element) => element.id === editingId && element.type === TOOLS.text) || null

  // Ao entrar em edição, foca e seleciona tudo — como o Figma faz.
  useEffect(() => {
    if (!editingId) return
    const campo = editorRef.current
    if (!campo) return
    campo.focus()
    campo.select()
  }, [editingId])

  // Escape na janela, não só no campo: se o foco escapar (troca de janela, por
  // exemplo), a tecla precisa encerrar a edição mesmo assim.
  useEffect(() => {
    if (!editingId) return undefined
    function aoTeclar(event) {
      if (event.key === 'Escape') setEditingId(null)
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [editingId])

  /** Converte coordenadas de tela para coordenadas do canvas. */
  function toCanvasPoint(event) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    }
  }

  function handlePointerDown(event) {
    if (event.button !== 0) return

    // Clicar no mapa encerra a edição. Não dependemos só do `blur`: se o foco
    // sair por outro caminho (troca de janela), o editor ficaria aberto.
    if (editingId) setEditingId(null)

    const point = toCanvasPoint(event)
    const targetId = event.target.getAttribute?.('data-el')
    const connectionId = event.target.getAttribute?.('data-cx')
    const handle = event.target.getAttribute?.('data-handle')

    lastHitRef.current = targetId || null

    try {
      svgRef.current.setPointerCapture(event.pointerId)
    } catch {
      // Alguns navegadores recusam a captura; o arrasto segue funcionando sem ela.
    }

    // Ferramenta de ligação: primeiro clique escolhe a origem, segundo o destino.
    if (tool === TOOLS.connect) {
      if (targetId) onConnectPick(targetId)
      else onConnectPick(null)
      return
    }

    if (handle && selected) {
      const origin = { ...selected, ...boxOf(selected) }
      dragRef.current = { mode: 'resize', handle, origin, start: point }
      return
    }

    if (tool === TOOLS.screen || tool === TOOLS.rect || tool === TOOLS.ellipse) {
      const rect = normalizeRect(point.x, point.y, point.x, point.y)
      dragRef.current = { mode: 'create', start: point, type: tool, rect }
      setDraft({ ...rect, type: tool })
      return
    }

    if (tool === TOOLS.text) {
      // O `mousedown` de compatibilidade disparado logo depois do `pointerdown`
      // move o foco para o <svg>. Como o editor já abriu e foi focado aqui, esse
      // foco roubado virava `blur` e fechava a edição no mesmo clique — o texto
      // nascia fora de edição. Cancelar o padrão do `pointerdown` suprime o
      // evento de compatibilidade e o foco fica onde deve.
      event.preventDefault()

      // Texto novo já entra em edição, com o texto padrão selecionado.
      const novo = createText(Math.round(point.x), Math.round(point.y))
      onCreate(novo)
      setEditingId(novo.id)
      return
    }

    if (connectionId) {
      onSelectConnection(connectionId)
      return
    }

    if (targetId) {
      const element = elements.find((item) => item.id === targetId)
      onSelect(targetId)

      // Arrastar uma tela leva junto o que está dentro dela — menos o que está
      // travado, que é justamente o que o usuário pediu para ficar parado.
      const carried = isScreen(element)
        ? childrenOfScreen(elements, element)
            .filter((child) => !isLocked(child))
            .map((child) => ({ id: child.id, x: child.x, y: child.y }))
        : []

      dragRef.current = { mode: 'move', origin: { ...element }, start: point, carried }
      return
    }

    onSelect(null)
    dragRef.current = { mode: 'pan', start: { x: event.clientX, y: event.clientY }, origin: { ...view } }
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    const point = toCanvasPoint(event)

    if (tool === TOOLS.connect && pendingFrom) setCursorPoint(point)

    if (!drag) {
      onPointerCoords(point)
      return
    }

    if (drag.mode === 'pan') {
      onViewChange({
        ...view,
        x: drag.origin.x + (event.clientX - drag.start.x),
        y: drag.origin.y + (event.clientY - drag.start.y),
      })
      return
    }

    onPointerCoords(point)

    if (drag.mode === 'create') {
      drag.rect = normalizeRect(drag.start.x, drag.start.y, point.x, point.y)
      setDraft({ ...drag.rect, type: drag.type })
      return
    }

    const deltaX = point.x - drag.start.x
    const deltaY = point.y - drag.start.y

    if (drag.mode === 'move') {
      // Shift trava o movimento no eixo em que a mão foi mais longe — alinhar
      // dois elementos deixa de depender do pulso.
      let moveX = deltaX
      let moveY = deltaY
      if (event.shiftKey) {
        if (Math.abs(deltaX) >= Math.abs(deltaY)) moveY = 0
        else moveX = 0
      }

      const patches = {
        [drag.origin.id]: {
          x: Math.round(drag.origin.x + moveX),
          y: Math.round(drag.origin.y + moveY),
        },
      }
      drag.carried.forEach((child) => {
        patches[child.id] = { x: Math.round(child.x + moveX), y: Math.round(child.y + moveY) }
      })
      onUpdateMany(patches)
      return
    }

    if (drag.mode === 'resize') {
      const { handle, origin } = drag
      let { x, y, width, height } = origin

      if (handle.includes('e')) width = origin.width + deltaX
      if (handle.includes('s')) height = origin.height + deltaY
      if (handle.includes('w')) {
        width = origin.width - deltaX
        x = origin.x + deltaX
      }
      if (handle.includes('n')) {
        height = origin.height - deltaY
        y = origin.y + deltaY
      }

      // Shift mantém a proporção original. Manda a dimensão que mais variou,
      // para o arrasto responder na direção em que a mão está indo.
      if (event.shiftKey && origin.width > 0 && origin.height > 0) {
        const proporcao = origin.width / origin.height
        if (Math.abs(width - origin.width) >= Math.abs(height - origin.height) * proporcao) {
          height = width / proporcao
        } else {
          width = height * proporcao
        }
        // A âncora é o canto oposto ao que está sendo arrastado.
        if (handle.includes('w')) x = origin.x + origin.width - width
        if (handle.includes('n')) y = origin.y + origin.height - height
      }

      if (width < MIN_SIZE) {
        width = MIN_SIZE
        x = origin.x
      }
      if (height < MIN_SIZE) {
        height = MIN_SIZE
        y = origin.y
      }

      onUpdate(origin.id, {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height),
      })
    }
  }

  function handlePointerUp(event) {
    const drag = dragRef.current
    dragRef.current = null
    svgRef.current.releasePointerCapture?.(event.pointerId)

    if (drag?.mode === 'create') {
      const { rect, type } = drag
      const width = Math.max(Math.round(rect.width), 0)
      const height = Math.max(Math.round(rect.height), 0)
      const tooSmall = width < MIN_SIZE || height < MIN_SIZE
      const x = Math.round(rect.x)
      const y = Math.round(rect.y)

      if (type === TOOLS.screen) {
        // Clique simples cria uma tela no formato de celular.
        onCreate(
          tooSmall
            ? createScreen(x, y, DEFAULT_SCREEN.width, DEFAULT_SCREEN.height)
            : createScreen(x, y, width, height),
        )
      } else {
        onCreate(
          tooSmall ? createShape(type, x, y, 160, 100) : createShape(type, x, y, width, height),
        )
      }
    }

    setDraft(null)
  }

  /** Duplo clique num texto abre a edição direto na caixa. */
  function handleDoubleClick() {
    const targetId = lastHitRef.current
    if (!targetId) return
    const alvo = elements.find((item) => item.id === targetId)
    if (alvo?.type === TOOLS.text) {
      dragRef.current = null
      setEditingId(targetId)
    }
  }

  function handleDragOver(event) {
    if (!event.dataTransfer.types.includes('application/x-schedio-icon')) return
    event.preventDefault()
    event.dataTransfer.dropEffect = 'copy'
  }

  function handleDrop(event) {
    const dados = event.dataTransfer.getData('application/x-schedio-icon')
    if (!dados) return
    event.preventDefault()
    try {
      onDropIcon(JSON.parse(dados), toCanvasPoint(event))
    } catch {
      // Arraste de outra origem: ignora em silêncio.
    }
  }

  // Zoom com a roda do mouse, ancorado no ponteiro.
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return undefined

    function handleWheel(event) {
      event.preventDefault()
      const rect = svg.getBoundingClientRect()
      const pointerX = event.clientX - rect.left
      const pointerY = event.clientY - rect.top
      const factor = event.deltaY < 0 ? 1.1 : 1 / 1.1
      const zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, view.zoom * factor))
      const ratio = zoom / view.zoom

      onViewChange({
        zoom,
        x: pointerX - (pointerX - view.x) * ratio,
        y: pointerY - (pointerY - view.y) * ratio,
      })
    }

    svg.addEventListener('wheel', handleWheel, { passive: false })
    return () => svg.removeEventListener('wheel', handleWheel)
  }, [view, onViewChange])

  // Camada oculta não desenha — nem ela, nem as ligações que passam por ela.
  const visiveis = elements.filter((element) => !isHidden(element))
  const byId = new Map(visiveis.map((element) => [element.id, element]))
  // Telas ficam atrás; o resto desenha por cima.
  const screens = visiveis.filter(isScreen)
  const others = visiveis.filter((element) => !isScreen(element))
  // Travado continua visível, mas sem área de clique: o mapa não o seleciona
  // nem o arrasta; ele se edita pela lista de camadas.
  const hitOf = (element) => (isLocked(element) ? null : element.id)
  const pendingElement = pendingFrom ? byId.get(pendingFrom) : null
  const cursor = tool === TOOLS.select ? 'default' : 'crosshair'

  return (
    <>
    <svg
      ref={svgRef}
      className="canvas-stage"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onDoubleClick={handleDoubleClick}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
    >
      <defs>
        <pattern
          id="grid-cell"
          width={20 * view.zoom}
          height={20 * view.zoom}
          patternUnits="userSpaceOnUse"
          x={view.x}
          y={view.y}
        >
          <path
            d={`M ${20 * view.zoom} 0 L 0 0 0 ${20 * view.zoom}`}
            fill="none"
            stroke="#332f38"
            strokeWidth="1"
          />
        </pattern>
        <pattern
          id="grid-block"
          width={100 * view.zoom}
          height={100 * view.zoom}
          patternUnits="userSpaceOnUse"
          x={view.x}
          y={view.y}
        >
          <rect width={100 * view.zoom} height={100 * view.zoom} fill="url(#grid-cell)" />
          <path
            d={`M ${100 * view.zoom} 0 L 0 0 0 ${100 * view.zoom}`}
            fill="none"
            stroke="#413c47"
            strokeWidth="1"
          />
        </pattern>
        <marker id="cx-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#8f7fd4" />
        </marker>
        <marker id="cx-arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
          <path d="M 0 0 L 10 5 L 0 10 z" fill="#c3b5ff" />
        </marker>
      </defs>

      <rect width="100%" height="100%" fill="url(#grid-block)" />

      {/* Eixos X e Y na origem do mapa */}
      <line x1="0" y1={view.y} x2="100%" y2={view.y} stroke="#7d6f92" strokeWidth="1.5" />
      <line x1={view.x} y1="0" x2={view.x} y2="100%" stroke="#7d6f92" strokeWidth="1.5" />

      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {screens.map((screen) => (
          <g key={screen.id}>
            <CanvasElement element={screen} hitId={hitOf(screen)} />
            <text
              x={screen.x}
              y={screen.y - 8 / view.zoom}
              fill={screen.id === startScreenId ? '#c3b5ff' : '#b9b1c4'}
              fontSize={12 / view.zoom}
              pointerEvents="none"
              style={{ userSelect: 'none' }}
            >
              {screen.id === startScreenId ? `▶ ${screen.name}` : screen.name}
            </text>
          </g>
        ))}

        {others.map((element) =>
          // Em edição, quem desenha o conteúdo é o textarea sobreposto.
          element.id === editingId ? null : (
            <CanvasElement key={element.id} element={element} hitId={hitOf(element)} />
          ),
        )}

        {/* Ligações de protótipo */}
        {connections.map((connection) => {
          const from = byId.get(connection.from)
          const to = byId.get(connection.to)
          if (!from || !to) return null

          const { start, end } = connectionAnchors(boxOf(from), boxOf(to))
          const active = connection.id === selectedConnectionId

          return (
            <g key={connection.id}>
              {/* Traço largo invisível: alvo de clique confortável na linha fina. */}
              <line
                data-cx={connection.id}
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke="transparent"
                strokeWidth={12 / view.zoom}
                style={{ cursor: 'pointer' }}
              />
              <line
                x1={start.x}
                y1={start.y}
                x2={end.x}
                y2={end.y}
                stroke={active ? '#c3b5ff' : '#8f7fd4'}
                strokeWidth={(active ? 2.5 : 1.75) / view.zoom}
                markerEnd={`url(#${active ? 'cx-arrow-active' : 'cx-arrow'})`}
                pointerEvents="none"
              />
              <circle
                cx={start.x}
                cy={start.y}
                r={3.5 / view.zoom}
                fill={active ? '#c3b5ff' : '#8f7fd4'}
                pointerEvents="none"
              />
            </g>
          )
        })}

        {/* Ligação em construção seguindo o cursor */}
        {pendingElement && cursorPoint && (
          <g pointerEvents="none">
            <rect
              {...boxOf(pendingElement)}
              fill="none"
              stroke="#c3b5ff"
              strokeWidth={1.5 / view.zoom}
            />
            <line
              x1={boxOf(pendingElement).x + boxOf(pendingElement).width / 2}
              y1={boxOf(pendingElement).y + boxOf(pendingElement).height / 2}
              x2={cursorPoint.x}
              y2={cursorPoint.y}
              stroke="#c3b5ff"
              strokeWidth={1.5 / view.zoom}
              strokeDasharray={`${5 / view.zoom} ${5 / view.zoom}`}
            />
          </g>
        )}

        {draft && draft.width > 0 && draft.height > 0 && (
          <rect
            x={draft.x}
            y={draft.y}
            width={draft.width}
            height={draft.height}
            fill="none"
            stroke="#aaa1b5"
            strokeWidth={1 / view.zoom}
            strokeDasharray={`${4 / view.zoom} ${4 / view.zoom}`}
          />
        )}

        {selected && (
          <g pointerEvents="none">
            <rect
              {...boxOf(selected)}
              fill="none"
              stroke={isLocked(selected) ? '#e0c58a' : '#aaa1b5'}
              strokeWidth={1.5 / view.zoom}
              strokeDasharray={isLocked(selected) ? `${5 / view.zoom} ${4 / view.zoom}` : undefined}
            />
            {!isLocked(selected) && HANDLES.map((handle) => {
              const box = boxOf(selected)
              const size = 8 / view.zoom
              const positions = {
                nw: { x: box.x, y: box.y },
                ne: { x: box.x + box.width, y: box.y },
                se: { x: box.x + box.width, y: box.y + box.height },
                sw: { x: box.x, y: box.y + box.height },
              }
              const position = positions[handle]
              return (
                <rect
                  key={handle}
                  data-handle={handle}
                  x={position.x - size / 2}
                  y={position.y - size / 2}
                  width={size}
                  height={size}
                  fill="#19181a"
                  stroke="#aaa1b5"
                  strokeWidth={1 / view.zoom}
                  pointerEvents="all"
                  style={{ cursor: `${handle}-resize` }}
                />
              )
            })}
          </g>
        )}
      </g>
    </svg>

    {/*
      Edição no lugar: um textarea posicionado por cima do texto, com a mesma
      fonte, tamanho e alinhamento, para o que se digita parecer o próprio
      elemento. Fica fora do <svg> porque HTML dentro de SVG (foreignObject)
      tem suporte irregular.
    */}
    {editing && (() => {
      const estilo = textStyle(editing)
      const metrics = measureText(editing)
      // O editor cobre o conteúdo, não a caixa: começa na linha em que o
      // <text> desenha (respeitando o alinhamento vertical) e tem a altura do
      // texto, não a da caixa. Assim nada salta ao entrar em edição e um texto
      // mais alto que a altura fixa transborda — como no mapa — em vez de ser
      // cortado pelo `overflow` do campo.
      const deslocamentoY = verticalOffset(metrics, estilo)
      const alturaConteudo = Math.max(metrics.contentHeight, editing.fontSize)
      // Com largura definida o texto reflui dentro dela, igual ao mapa; sem
      // largura a caixa acompanha o conteúdo e nada deve quebrar.
      const reflui = editing.width > 0
      return (
        <textarea
          ref={editorRef}
          className="canvas-text-editor"
          value={editing.text}
          onChange={(event) => onUpdate(editing.id, { text: event.target.value })}
          onBlur={() => setEditingId(null)}
          style={{
            left: editing.x * view.zoom + view.x,
            top: (editing.y + deslocamentoY) * view.zoom + view.y,
            width: Math.max(metrics.width, 24) * view.zoom,
            height: alturaConteudo * view.zoom,
            whiteSpace: reflui ? 'pre-wrap' : 'pre',
            // Casa com a quebra por caractere de `breakLongWord`.
            overflowWrap: reflui ? 'anywhere' : 'normal',
            fontSize: editing.fontSize * view.zoom,
            lineHeight: `${metrics.lineHeight * view.zoom}px`,
            fontFamily: estilo.fontFamily,
            fontWeight: estilo.fontWeight,
            fontStyle: estilo.fontStyle,
            textDecoration: estilo.textDecoration,
            textAlign: estilo.textAlign,
            color: editing.fill,
          }}
        />
      )
    })()}
    </>
  )
}
