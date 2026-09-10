import { createId } from './elements.js'

export const TRANSITIONS = [
  { value: 'instant', label: 'Instantânea' },
  { value: 'dissolve', label: 'Dissolver' },
  { value: 'slide-left', label: 'Deslizar ←' },
  { value: 'slide-right', label: 'Deslizar →' },
  { value: 'slide-up', label: 'Deslizar ↑' },
  { value: 'slide-down', label: 'Deslizar ↓' },
]

export const DEFAULT_TRANSITION = 'dissolve'
export const DEFAULT_DURATION = 300

export function createConnection(from, to) {
  return {
    id: `cx-${createId()}`,
    from,
    to,
    trigger: 'click',
    transition: DEFAULT_TRANSITION,
    duration: DEFAULT_DURATION,
  }
}

/**
 * Ponto onde a reta centro-a-centro cruza a borda da caixa, para a seta
 * encostar na borda em vez de sumir dentro do elemento.
 */
function edgePoint(box, towardX, towardY) {
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  const dx = towardX - centerX
  const dy = towardY - centerY

  if (Math.abs(dx) < 1e-6 && Math.abs(dy) < 1e-6) {
    return { x: centerX, y: centerY }
  }

  const scaleX = Math.abs(dx) > 1e-6 ? box.width / 2 / Math.abs(dx) : Infinity
  const scaleY = Math.abs(dy) > 1e-6 ? box.height / 2 / Math.abs(dy) : Infinity
  const scale = Math.min(scaleX, scaleY)

  return { x: centerX + dx * scale, y: centerY + dy * scale }
}

/** Extremidades da seta entre duas caixas. */
export function connectionAnchors(fromBox, toBox) {
  const fromCenter = { x: fromBox.x + fromBox.width / 2, y: fromBox.y + fromBox.height / 2 }
  const toCenter = { x: toBox.x + toBox.width / 2, y: toBox.y + toBox.height / 2 }

  return {
    start: edgePoint(fromBox, toCenter.x, toCenter.y),
    end: edgePoint(toBox, fromCenter.x, fromCenter.y),
  }
}

/** Conexões que partem de um elemento (usado na simulação para saber o que é clicável). */
export function connectionsFrom(connections, elementId) {
  return connections.filter((connection) => connection.from === elementId)
}

/** Remove conexões que apontam para elementos que não existem mais (RN-12). */
export function pruneConnections(connections, elements) {
  const ids = new Set(elements.map((element) => element.id))
  return connections.filter((connection) => ids.has(connection.from) && ids.has(connection.to))
}
