import { boxOf, childrenOfScreen, isInsideScreen, isScreen, screenContaining } from './elements.js'

/**
 * O que a simulação mostra num instante — uma "parada":
 * - `screenId`: a tela;
 * - `focusId`: objeto da tela em que a câmera está aproximada (ou null);
 * - `overlayId`: objeto de fora das telas aberto por cima (ou null).
 */
export function createParada(screenId) {
  return { screenId, focusId: null, overlayId: null }
}

export function sameParada(a, b) {
  return a.screenId === b.screenId && a.focusId === b.focusId && a.overlayId === b.overlayId
}

/** Maior aproximação da câmera: um ícone pequeno não pode virar a tela inteira. */
const MAX_ZOOM = 4

/** Opacidade do véu escuro atrás de uma sobreposição. */
export const BACKDROP_OPACITY = 0.4

/**
 * Câmera que enquadra o objeto com uma folga em volta, na mesma proporção da
 * tela (para o palco não mudar de formato) e sem sair dos limites dela.
 * Coordenadas relativas à tela, como tudo no quadro.
 */
function cameraFor(screen, box) {
  const W = screen.width
  const H = screen.height
  if (!box) return { x: 0, y: 0, width: W, height: H }

  const folga = Math.max(box.width, box.height) * 0.2 + 16
  const largura = box.width + folga * 2
  const altura = box.height + folga * 2
  const proporcao = W / H

  let width = largura / altura > proporcao ? largura : altura * proporcao
  width = Math.min(W, Math.max(width, W / MAX_ZOOM))
  const height = width / proporcao

  const clamp = (valor, max) => Math.min(Math.max(valor, 0), Math.max(max, 0))
  return {
    x: clamp(box.x + box.width / 2 - width / 2, W - width),
    y: clamp(box.y + box.height / 2 - height / 2, H - height),
    width,
    height,
  }
}

/**
 * O que abre junto com um objeto de sobreposição: ele próprio e o que estiver
 * empilhado por cima dele (fora das telas, desenhado depois, com o centro
 * dentro da caixa dele). Assim um cartão com texto e botão abre inteiro,
 * pelo mesmo critério de "centro dentro" com que uma tela possui o conteúdo.
 */
export function overlayMembers(elements, target) {
  const indice = elements.indexOf(target)
  const caixa = boxOf(target)
  return [
    target,
    ...elements.filter(
      (element, index) =>
        index > indice &&
        !isScreen(element) &&
        !screenContaining(elements, element) &&
        isInsideScreen(element, caixa),
    ),
  ]
}

/**
 * Monta o quadro de uma parada. Tudo fica em coordenadas **relativas à tela**
 * (canto superior esquerdo = 0,0): as telas moram em lugares diferentes do
 * mapa, e a transição inteligente só consegue comparar posições assim.
 *
 * `items` segue a ordem de desenho, com `layer` separando o conteúdo da tela
 * do que está na sobreposição (desenhado por cima do véu).
 */
export function composeFrame(parada, elements) {
  const byId = new Map(elements.map((element) => [element.id, element]))
  const screen = byId.get(parada.screenId)
  if (!screen || !isScreen(screen)) return null

  const relativo = (element, dx = 0, dy = 0) => ({
    ...element,
    x: element.x - screen.x + dx,
    y: element.y - screen.y + dy,
  })

  const items = childrenOfScreen(elements, screen).map((element) => ({
    element: relativo(element),
    layer: 'screen',
  }))

  const foco = parada.focusId ? byId.get(parada.focusId) : null
  const camera = cameraFor(screen, foco ? boxOf(relativo(foco)) : null)

  const alvo = parada.overlayId ? byId.get(parada.overlayId) : null
  if (alvo) {
    // Centraliza a sobreposição no que está visível, não na tela inteira:
    // com a câmera aproximada, o centro da tela pode estar fora de vista.
    const caixa = boxOf(alvo)
    const dx = camera.x + camera.width / 2 - (caixa.x + caixa.width / 2 - screen.x)
    const dy = camera.y + camera.height / 2 - (caixa.y + caixa.height / 2 - screen.y)
    overlayMembers(elements, alvo).forEach((element) => {
      items.push({ element: relativo(element, dx, dy), layer: 'overlay' })
    })
  }

  return { screen, camera, items, overlayId: alvo ? alvo.id : null }
}

/**
 * Forma desenhável de um quadro parado — a mesma que `mixFrames` produz no
 * meio de uma transição, para um único componente desenhar as duas.
 */
export function flattenFrame(frame) {
  const desenho = (layer) =>
    frame.items
      .filter((item) => item.layer === layer)
      .map((item) => ({ key: item.element.id, element: item.element }))

  return {
    screen: {
      id: frame.screen.id,
      width: frame.screen.width,
      height: frame.screen.height,
      fill: frame.screen.fill,
      radius: frame.screen.radius,
    },
    camera: frame.camera,
    below: desenho('screen'),
    backdrop: frame.overlayId ? BACKDROP_OPACITY : 0,
    above: desenho('overlay'),
  }
}
