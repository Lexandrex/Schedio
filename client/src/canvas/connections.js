import { createId, isScreen, screenContaining } from './elements.js'

export const TRANSITIONS = [
  { value: 'instant', label: 'Instantânea' },
  { value: 'dissolve', label: 'Dissolver' },
  { value: 'smart', label: 'Inteligente' },
  { value: 'slide-left', label: 'Deslizar ←' },
  { value: 'slide-right', label: 'Deslizar →' },
  { value: 'slide-up', label: 'Deslizar ↑' },
  { value: 'slide-down', label: 'Deslizar ↓' },
]

export const DEFAULT_TRANSITION = 'dissolve'
export const DEFAULT_DURATION = 300

/**
 * Gatilhos. `hover` é o "enquanto passar o mouse" do Figma: sair de cima do
 * elemento desfaz a navegação; `mouseenter` vai e fica.
 */
export const TRIGGERS = [
  { value: 'click', label: 'Ao clicar' },
  { value: 'mouseenter', label: 'Ao passar o mouse' },
  { value: 'hover', label: 'Enquanto o mouse estiver em cima' },
  { value: 'scroll', label: 'Ao rolar' },
  { value: 'delay', label: 'Após um tempo' },
]

export const SCROLL_DIRECTIONS = [
  { value: 'down', label: 'Para baixo' },
  { value: 'up', label: 'Para cima' },
]

export const DEFAULT_DELAY = 1000

/** Ligações antigas não têm gatilho gravado além de `click`; os campos novos nascem no padrão. */
export function triggerOf(connection) {
  return connection.trigger || 'click'
}

export function directionOf(connection) {
  return connection.direction || 'down'
}

export function delayOf(connection) {
  return Number.isFinite(connection.delay) ? connection.delay : DEFAULT_DELAY
}

/**
 * O que a ligação faz com o destino:
 * - `screen`: navega para a tela;
 * - `focus`: o destino é um objeto dentro de uma tela — vai até ela e aproxima a câmera nele;
 * - `overlay`: o destino é um objeto fora de qualquer tela — abre por cima da tela atual.
 */
export function destinationKind(elements, target) {
  if (!target) return null
  if (isScreen(target)) return 'screen'
  return screenContaining(elements, target) ? 'focus' : 'overlay'
}

/** Transição usada ao voltar: o deslize anda no sentido contrário, o resto é simétrico. */
export function reverseTransition(transition) {
  return (
    {
      'slide-left': 'slide-right',
      'slide-right': 'slide-left',
      'slide-up': 'slide-down',
      'slide-down': 'slide-up',
    }[transition] || transition
  )
}

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

/** Conexões que partem de um elemento. */
export function connectionsFrom(connections, elementId) {
  return connections.filter((connection) => connection.from === elementId)
}

/** Remove conexões que apontam para elementos que não existem mais (RN-12). */
export function pruneConnections(connections, elements) {
  const ids = new Set(elements.map((element) => element.id))
  return connections.filter((connection) => ids.has(connection.from) && ids.has(connection.to))
}
