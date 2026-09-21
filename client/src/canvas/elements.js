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

/** Rótulo de cada tipo, usado no painel de propriedades e na lista de camadas. */
export const TYPE_LABEL = {
  [TOOLS.screen]: 'Tela',
  [TOOLS.rect]: 'Retângulo',
  [TOOLS.ellipse]: 'Elipse',
  [TOOLS.text]: 'Texto',
  [TOOLS.image]: 'Imagem',
  [TOOLS.icon]: 'Ícone',
}

/**
 * Nome exibido na lista de camadas. `name` é o apelido dado pelo usuário; sem
 * ele o elemento se identifica pelo próprio conteúdo (o texto digitado, o nome
 * do ícone) e, em último caso, pelo tipo. Telas já nascem com `name`.
 */
export function elementLabel(element) {
  if (element.name) return element.name
  if (element.type === TOOLS.text) {
    const primeira = String(element.text || '').split('\n')[0].trim()
    return primeira ? primeira.slice(0, 28) : 'Texto'
  }
  if (isIcon(element)) return element.nome || 'Ícone'
  return TYPE_LABEL[element.type] || element.type
}

export function isHidden(element) {
  return element.hidden === true
}

export function isLocked(element) {
  return element.locked === true
}

/** O que entra no desenho: oculto some do mapa, da simulação e da leitura. */
export function visibleElements(elements) {
  return elements.filter((element) => !isHidden(element))
}

/**
 * Irmãos na ordem de desenho: telas se ordenam entre telas, e os demais entre
 * os que estão na mesma tela — reordenar dentro de uma tela não pode mexer na
 * ordem de outra.
 */
function siblingIndexes(elements, element) {
  const dono = isScreen(element) ? null : screenContaining(elements, element)?.id ?? null
  const indexes = []

  elements.forEach((item, index) => {
    if (isScreen(item) !== isScreen(element)) return
    if (!isScreen(element) && (screenContaining(elements, item)?.id ?? null) !== dono) return
    indexes.push(index)
  })

  return indexes
}

export const REORDER = {
  frente: 'frente',
  tras: 'tras',
  topo: 'topo',
  fundo: 'fundo',
}

/**
 * Move o elemento na ordem de desenho — quem vem depois no array desenha por
 * cima. 'frente'/'tras' andam uma posição; 'topo'/'fundo' vão até a ponta.
 * Devolve o mesmo array quando não há para onde ir.
 */
export function reorderElement(elements, id, direction) {
  const element = elements.find((item) => item.id === id)
  if (!element) return elements

  const indexes = siblingIndexes(elements, element)
  const atual = indexes.indexOf(elements.indexOf(element))
  const ultimo = indexes.length - 1
  const destino = {
    [REORDER.frente]: atual + 1,
    [REORDER.tras]: atual - 1,
    [REORDER.topo]: ultimo,
    [REORDER.fundo]: 0,
  }[direction]

  if (destino === undefined || destino === atual || destino < 0 || destino > ultimo) return elements

  const irmaos = indexes.map((index) => elements[index])
  const [movido] = irmaos.splice(atual, 1)
  irmaos.splice(destino, 0, movido)

  const proximo = [...elements]
  indexes.forEach((index, posicao) => {
    proximo[index] = irmaos[posicao]
  })
  return proximo
}

/**
 * Cópias de um elemento, deslocadas para não nascerem em cima do original.
 * Duplicar uma tela leva junto o conteúdo dela (mesmo deslocamento, para a
 * geometria relativa se manter) — senão a cópia nasceria vazia.
 */
export function duplicateElement(elements, id, offset = 16) {
  const original = elements.find((item) => item.id === id)
  if (!original) return []

  const copiar = (element) => {
    const copia = { ...element, id: createId(), x: element.x + offset, y: element.y + offset }
    if (element.name) copia.name = `${element.name} cópia`
    return copia
  }

  const novo = copiar(original)
  if (!isScreen(original)) return [novo]
  return [novo, ...childrenOfScreen(elements, original).map(copiar)]
}
