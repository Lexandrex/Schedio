import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { TOOLS, createShape, createText, isShape, normalizeRect } from './elements.js'

const MIN_ZOOM = 0.15
const MAX_ZOOM = 4
const MIN_SIZE = 4
const HANDLES = ['nw', 'ne', 'se', 'sw']

export default function CanvasStage({
  elements,
  selectedId,
  tool,
  view,
  onViewChange,
  onSelect,
  onCreate,
  onUpdate,
  onPointerCoords,
}) {
  const svgRef = useRef(null)
  const dragRef = useRef(null)
  const [draft, setDraft] = useState(null)
  const [textBoxes, setTextBoxes] = useState({})

  const selected = elements.find((element) => element.id === selectedId) || null

  /** Converte coordenadas de tela para coordenadas do canvas. */
  function toCanvasPoint(event) {
    const rect = svgRef.current.getBoundingClientRect()
    return {
      x: (event.clientX - rect.left - view.x) / view.zoom,
      y: (event.clientY - rect.top - view.y) / view.zoom,
    }
  }

  // Mede os textos renderizados para desenhar o contorno de seleção no tamanho certo.
  useLayoutEffect(() => {
    const svg = svgRef.current
    if (!svg) return

    const measured = {}
    elements.forEach((element) => {
      if (element.type !== TOOLS.text) return
      const node = svg.querySelector(`[data-el="${element.id}"]`)
      if (!node) return
      const box = node.getBBox()
      measured[element.id] = { width: box.width, height: box.height }
    })
    setTextBoxes(measured)
  }, [elements])

  function handlePointerDown(event) {
    if (event.button !== 0) return
    const point = toCanvasPoint(event)
    const targetId = event.target.getAttribute?.('data-el')
    const handle = event.target.getAttribute?.('data-handle')

    try {
      svgRef.current.setPointerCapture(event.pointerId)
    } catch {
      // Alguns navegadores recusam a captura; o arrasto segue funcionando sem ela.
    }

    if (handle && selected) {
      dragRef.current = { mode: 'resize', handle, origin: { ...selected }, start: point }
      return
    }

    if (tool === TOOLS.rect || tool === TOOLS.ellipse) {
      const rect = normalizeRect(point.x, point.y, point.x, point.y)
      dragRef.current = { mode: 'create', start: point, type: tool, rect }
      setDraft({ ...rect, type: tool })
      return
    }

    if (tool === TOOLS.text) {
      onCreate(createText(Math.round(point.x), Math.round(point.y)))
      return
    }

    if (targetId) {
      const element = elements.find((item) => item.id === targetId)
      onSelect(targetId)
      dragRef.current = { mode: 'move', origin: { ...element }, start: point }
      return
    }

    onSelect(null)
    dragRef.current = { mode: 'pan', start: { x: event.clientX, y: event.clientY }, origin: { ...view } }
  }

  function handlePointerMove(event) {
    const drag = dragRef.current
    if (!drag) {
      onPointerCoords(toCanvasPoint(event))
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

    const point = toCanvasPoint(event)
    onPointerCoords(point)

    if (drag.mode === 'create') {
      drag.rect = normalizeRect(drag.start.x, drag.start.y, point.x, point.y)
      setDraft({ ...drag.rect, type: drag.type })
      return
    }

    const deltaX = point.x - drag.start.x
    const deltaY = point.y - drag.start.y

    if (drag.mode === 'move') {
      onUpdate(drag.origin.id, {
        x: Math.round(drag.origin.x + deltaX),
        y: Math.round(drag.origin.y + deltaY),
      })
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
      // Um clique simples (sem arrastar) cria uma forma com tamanho padrão.
      const shape =
        width < MIN_SIZE || height < MIN_SIZE
          ? createShape(type, Math.round(rect.x), Math.round(rect.y), 160, 100)
          : createShape(type, Math.round(rect.x), Math.round(rect.y), width, height)
      onCreate(shape)
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

  function selectionBox(element) {
    if (isShape(element)) {
      return { x: element.x, y: element.y, width: element.width, height: element.height }
    }
    const measured = textBoxes[element.id]
    return {
      x: element.x,
      y: element.y,
      width: measured?.width || 0,
      height: measured?.height || element.fontSize,
    }
  }

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
      </defs>

      <rect width="100%" height="100%" fill="url(#grid-block)" />

      {/* Eixos X e Y na origem do mapa */}
      <line x1="0" y1={view.y} x2="100%" y2={view.y} stroke="#7d6f92" strokeWidth="1.5" />
      <line x1={view.x} y1="0" x2={view.x} y2="100%" stroke="#7d6f92" strokeWidth="1.5" />

      <g transform={`translate(${view.x} ${view.y}) scale(${view.zoom})`}>
        {elements.map((element) => {
          if (element.type === TOOLS.rect) {
            return (
              <rect
                key={element.id}
                data-el={element.id}
                x={element.x}
                y={element.y}
                width={element.width}
                height={element.height}
                rx={element.radius}
                fill={element.fill}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                opacity={element.opacity}
              />
            )
          }

          if (element.type === TOOLS.ellipse) {
            return (
              <ellipse
                key={element.id}
                data-el={element.id}
                cx={element.x + element.width / 2}
                cy={element.y + element.height / 2}
                rx={element.width / 2}
                ry={element.height / 2}
                fill={element.fill}
                stroke={element.stroke}
                strokeWidth={element.strokeWidth}
                opacity={element.opacity}
              />
            )
          }

          return (
            <text
              key={element.id}
              data-el={element.id}
              x={element.x}
              y={element.y}
              fill={element.fill}
              fontSize={element.fontSize}
              opacity={element.opacity}
              dominantBaseline="hanging"
              style={{ userSelect: 'none' }}
            >
              {element.text}
            </text>
          )
        })}

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
              {...selectionBox(selected)}
              fill="none"
              stroke="#aaa1b5"
              strokeWidth={1.5 / view.zoom}
            />
            {isShape(selected) &&
              HANDLES.map((handle) => {
                const box = selectionBox(selected)
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
