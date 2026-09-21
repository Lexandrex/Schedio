import { DEFAULT_FONT_FAMILY, DEFAULT_LINE_HEIGHT, measureText } from './textMetrics.js'

export const TOOLS = {
  select: 'select',
  screen: 'screen',
  rect: 'rect',
  ellipse: 'ellipse',
  text: 'text',
  image: 'image',
  icon: 'icon',
  connect: 'connect',
}

export const DEFAULT_FILL = '#6f6880'
export const DEFAULT_STROKE = '#aaa1b5'
export const DEFAULT_TEXT_FILL = '#f4f2f5'
export const DEFAULT_SCREEN_FILL = '#2a2731'
export const DEFAULT_SCREEN_STROKE = '#655d6f'

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
    // Sem largura/altura o texto se ajusta ao conteúdo; ao redimensionar, ele reflui na caixa.
    width: null,
    height: null,
    fontSize: 24,
    fontFamily: DEFAULT_FONT_FAMILY,
    fontWeight: 'normal',
    fontStyle: 'normal',
    textDecoration: 'none',
    textAlign: 'left',
    verticalAlign: 'top',
    lineHeight: DEFAULT_LINE_HEIGHT,
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

export function createScreen(x, y, width, height, name) {
  return {
    id: createId(),
    type: TOOLS.screen,
    x,
    y,
    width,
    height,
    name: name || 'Tela',
    fill: DEFAULT_SCREEN_FILL,
    stroke: DEFAULT_SCREEN_STROKE,
    strokeWidth: 1,
    radius: 4,
    opacity: 1,
  }
}

/**
 * `imageId` aponta para a linha em `imagens`, guardada para que o arquivo no
 * Cloudinary possa ser rastreado; `src` é a URL pública já otimizada.
 */
export function createImage(x, y, width, height, src, imageId) {
  return {
    id: createId(),
    type: TOOLS.image,
    x,
    y,
    width,
    height,
    src,
    imageId,
    opacity: 1,
  }
}

/**
 * Ícone da biblioteca. O `path` é copiado para dentro do elemento para que o
 * desenho não dependa do catálogo continuar igual no futuro.
 */
export function createIcon(x, y, size, nome, path) {
  return {
    id: createId(),
    type: TOOLS.icon,
    x,
    y,
    width: size,
    height: size,
    nome,
    path,
    fill: DEFAULT_TEXT_FILL,
    strokeWidth: 1.6,
    opacity: 1,
  }
}

export function isScreen(element) {
  return element.type === TOOLS.screen
}

export function isImage(element) {
  return element.type === TOOLS.image
}

export function isIcon(element) {
  return element.type === TOOLS.icon
}

export function isShape(element) {
  return element.type === TOOLS.rect || element.type === TOOLS.ellipse
}

/** Elementos com caixa explícita (x/y/width/height editáveis). */
export function hasBox(element) {
  return isScreen(element) || isShape(element) || isImage(element) || isIcon(element)
}

/** Caixa de qualquer elemento — texto é medido, o resto já tem as dimensões. */
export function boxOf(element) {
  if (hasBox(element)) {
    return { x: element.x, y: element.y, width: element.width, height: element.height }
  }
  const metrics = measureText(element)
  return { x: element.x, y: element.y, width: metrics.width, height: metrics.height }
}

/**
 * Um elemento pertence à tela cujo centro o contém. Usar o centro (em vez de
 * exigir contenção total) evita que algo levemente para fora deixe de pertencer.
 */
export function isInsideScreen(element, screen) {
  const box = boxOf(element)
  const centerX = box.x + box.width / 2
  const centerY = box.y + box.height / 2
  return (
    centerX >= screen.x &&
    centerX <= screen.x + screen.width &&
    centerY >= screen.y &&
    centerY <= screen.y + screen.height
  )
}

export function screensOf(elements) {
  return elements.filter(isScreen)
}

/** Conteúdo de uma tela, na ordem de desenho. */
export function childrenOfScreen(elements, screen) {
  return elements.filter((element) => !isScreen(element) && isInsideScreen(element, screen))
}

/** Tela que contém o elemento, se houver (a última vence, respeitando a ordem de desenho). */
export function screenContaining(elements, element) {
  return screensOf(elements)
    .filter((screen) => screen.id !== element.id && isInsideScreen(element, screen))
    .pop() || null
}
