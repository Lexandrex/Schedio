import { useEffect, useRef, useState } from 'react'
import {
  TOOLS,
  boxOf,
  childrenOfScreen,
  createScreen,
  createShape,
  createText,
  isScreen,
  normalizeRect,
} from './elements.js'
import { connectionAnchors } from './connections.js'
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
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [cursorPoint, setCursorPoint] = useState(null)

  const selected = elements.find((element) => element.id === selectedId) || null

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
    const point = toCanvasPoint(event)
    const targetId = event.target.getAttribute?.('data-el')
    const connectionId = event.target.getAttribute?.('data-cx')
    const handle = event.target.getAttribute?.('data-handle')

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
      onCreate(createText(Math.round(point.x), Math.round(point.y)))
      return
    }

    if (connectionId) {
      onSelectConnection(connectionId)
      return
    }

    if (targetId) {
      const element = elements.find((item) => item.id === targetId)
      onSelect(targetId)

      // Arrastar uma tela leva junto o que está dentro dela.
      const carried = isScreen(element)
        ? childrenOfScreen(elements, element).map((child) => ({ id: child.id, x: child.x, y: child.y }))
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
      const patches = {
        [drag.origin.id]: {
          x: Math.round(drag.origin.x + deltaX),
          y: Math.round(drag.origin.y + deltaY),
        },
      }
      drag.carried.forEach((child) => {
        patches[child.id] = { x: Math.round(child.x + deltaX), y: Math.round(child.y + deltaY) }
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

  const byId = new Map(elements.map((element) => [element.id, element]))
  // Telas ficam atrás; o resto desenha por cima.
  const screens = elements.filter(isScreen)
  const others = elements.filter((element) => !isScreen(element))
  const pendingElement = pendingFrom ? byId.get(pendingFrom) : null
  const cursor = tool === TOOLS.select ? 'default' : 'crosshair'

  return (
    <svg
      ref={svgRef}
      className="canvas-stage"
      style={{ cursor }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
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
            <CanvasElement element={screen} hitId={screen.id} />
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

        {others.map((element) => (
          <CanvasElement key={element.id} element={element} hitId={element.id} />
        ))}

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
            <rect {...boxOf(selected)} fill="none" stroke="#aaa1b5" strokeWidth={1.5 / view.zoom} />
            {HANDLES.map((handle) => {
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
  )
}
