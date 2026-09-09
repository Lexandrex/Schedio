export const TOOLS = {
  select: 'select',
  rect: 'rect',
  ellipse: 'ellipse',
  text: 'text',
}

export const DEFAULT_FILL = '#6f6880'
export const DEFAULT_STROKE = '#aaa1b5'
export const DEFAULT_TEXT_FILL = '#f4f2f5'

let counter = 0

export function createId() {
  counter += 1
  return `el-${Date.now().toString(36)}-${counter}`
}

export function createShape(type, x, y, width, height) {
  return {
    id: createId(),
    type,
    x,
    y,
    width,
    height,
    fill: DEFAULT_FILL,
    stroke: DEFAULT_STROKE,
    strokeWidth: 1,
    radius: type === 'rect' ? 8 : 0,
    opacity: 1,
  }
}

export function createText(x, y) {
  return {
    id: createId(),
    type: 'text',
    x,
    y,
    text: 'Novo texto',
    fontSize: 24,
    fill: DEFAULT_TEXT_FILL,
    opacity: 1,
  }
}

/** Normaliza um retângulo arrastado em qualquer direção para x/y no canto superior esquerdo. */
export function normalizeRect(startX, startY, endX, endY) {
  return {
    x: Math.min(startX, endX),
    y: Math.min(startY, endY),
    width: Math.abs(endX - startX),
    height: Math.abs(endY - startY),
  }
}

export function isShape(element) {
  return element.type === TOOLS.rect || element.type === TOOLS.ellipse
}
