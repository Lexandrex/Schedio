import { TOOLS } from './elements.js'
import { BACKDROP_OPACITY } from './playerFrame.js'

/**
 * Transição inteligente (o "Smart Animate" do Figma): em vez de trocar a tela
 * inteira, pareia os elementos da origem com os do destino e interpola cada
 * par — posição, tamanho, cor, opacidade, raio. Quem não tem par aparece ou
 * some esmaecendo.
 *
 * Também é o motor de toda transição **dentro da mesma tela** (aproximar a
 * câmera num objeto, abrir uma sobreposição): aí o pareamento é pelo próprio
 * id, então o conteúdo fica parado e só a câmera e a sobreposição se mexem.
 */

export function easeInOutCubic(t) {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2
}

const lerp = (a, b, t) => a + (b - a) * t

function parseHex(cor) {
  if (typeof cor !== 'string') return null
  const hex = cor.trim().replace('#', '')
  const cheio = hex.length === 3 ? hex.replace(/./g, '$&$&') : hex
  if (!/^[0-9a-f]{6}$/i.test(cheio)) return null
  return [0, 2, 4].map((inicio) => parseInt(cheio.slice(inicio, inicio + 2), 16))
}

/** Cor intermediária. O que não é hexadecimal (`none`, `transparent`) troca na metade. */
function mixColor(a, b, t) {
  if (a === b) return b
  const origem = parseHex(a)
  const destino = parseHex(b)
  if (!origem || !destino) return t < 0.5 ? a : b
  const canais = origem.map((valor, index) => Math.round(lerp(valor, destino[index], t)))
  return `#${canais.map((valor) => valor.toString(16).padStart(2, '0')).join('')}`
}

const NUMEROS = ['x', 'y', 'width', 'height', 'radius', 'strokeWidth', 'fontSize', 'lineHeight']
const CORES = ['fill', 'stroke']

/** Campos que não dá para interpolar: quando mudam, o par troca por esmaecimento cruzado. */
const CONTEUDO = {
  [TOOLS.text]: ['text', 'runs', 'fontFamily', 'fontWeight', 'fontStyle', 'textDecoration'],
  [TOOLS.icon]: ['path'],
  [TOOLS.image]: ['src'],
}

const opacidade = (element) => (Number.isFinite(element.opacity) ? element.opacity : 1)

/**
 * Um par em t. Devolve um elemento, ou dois quando o conteúdo muda (texto
 * diferente, outro ícone, outra imagem): os dois ocupam a geometria
 * interpolada, um sumindo e outro surgindo.
 */
function mixPair(a, b, t) {
  const mistura = { ...b }

  NUMEROS.forEach((campo) => {
    const de = a[campo]
    const para = b[campo]
    if (typeof de === 'number' && typeof para === 'number') mistura[campo] = lerp(de, para, t)
    // Texto sem largura acompanha o conteúdo (null); entre "solto" e "com
    // caixa" não há meio-termo, então troca na metade.
    else if (de !== para) mistura[campo] = t < 0.5 ? de : para
  })
  CORES.forEach((campo) => {
    mistura[campo] = mixColor(a[campo], b[campo], t)
  })
  mistura.opacity = lerp(opacidade(a), opacidade(b), t)

  const campos = CONTEUDO[b.type] || []
  // `runs` (formatação por caractere) é uma lista: compara pelo conteúdo, não
  // pela referência, senão duas telas com a mesma formatação esmaeceriam.
  const mudou = campos.some((campo) =>
    campo === 'runs' ? JSON.stringify(a.runs ?? null) !== JSON.stringify(b.runs ?? null) : a[campo] !== b[campo],
  )
  if (!mudou) return [{ key: b.id, element: mistura }]

  const antigo = { ...mistura, opacity: mistura.opacity * (1 - t) }
  campos.forEach((campo) => {
    antigo[campo] = a[campo]
  })
  return [
    { key: `de:${a.id}`, element: antigo },
    { key: b.id, element: { ...mistura, opacity: mistura.opacity * t } },
  ]
}

/**
 * Pareia os itens de dois quadros. Entre telas diferentes:
 * 1. pelo **nome** da camada (o critério do Figma, e a intenção explícita do usuário);
 * 2. pela **origem de duplicação** (`origemId`) — duplicar a tela e mexer já anima.
 * Um critério só vale quando aponta um único elemento de cada lado e do mesmo
 * tipo; na dúvida, não pareia, e os dois esmaecem.
 *
 * Na mesma tela o conteúdo é literalmente o mesmo, então pareia por id.
 */
function pairItems(de, para, mesmaTela) {
  const pares = new Map()
  const usados = new Set()

  const porChave = (chaveDe) => {
    const contar = (lista, ignorar) => {
      const contagem = new Map()
      lista.forEach((item, index) => {
        if (ignorar(index)) return
        const chave = chaveDe(item)
        if (chave) contagem.set(chave, (contagem.get(chave) || 0) + 1)
      })
      return contagem
    }
    const naOrigem = contar(de, (index) => usados.has(index))
    const noDestino = contar(para, (index) => pares.has(index))

    para.forEach((item, index) => {
      if (pares.has(index)) return
      const chave = chaveDe(item)
      if (!chave || naOrigem.get(chave) !== 1 || noDestino.get(chave) !== 1) return
      const achado = de.findIndex(
        (candidato, indice) => !usados.has(indice) && chaveDe(candidato) === chave,
      )
      if (achado < 0 || de[achado].element.type !== item.element.type) return
      pares.set(index, achado)
      usados.add(achado)
    })
  }

  // Sobreposição só pareia consigo mesma: abrir outra é trocar de conteúdo.
  const naCamada = (camada, chave) => (item) => (item.layer === camada ? chave(item.element) : null)

  if (mesmaTela) {
    porChave(naCamada('screen', (element) => element.id))
  } else {
    porChave(naCamada('screen', (element) => element.name?.trim() || null))
    porChave(naCamada('screen', (element) => element.origemId || element.id))
  }
  porChave(naCamada('overlay', (element) => element.id))

  return { pares, usados }
}

/** De onde vem quem entra num deslize (e para onde vai quem sai, com o sinal trocado). */
function slideOffset(transition, camera) {
  return (
    {
      'slide-left': { dx: camera.width, dy: 0 },
      'slide-right': { dx: -camera.width, dy: 0 },
      'slide-up': { dx: 0, dy: camera.height },
      'slide-down': { dx: 0, dy: -camera.height },
    }[transition] || null
  )
}

/**
 * Quadro intermediário entre `de` e `para` (quadros de `composeFrame`) em t
 * (0 a 1, já com easing). Devolve a mesma forma de `flattenFrame`.
 */
export function mixFrames(de, para, t, transition) {
  const mesmaTela = de.screen.id === para.screen.id
  const { pares, usados } = pairItems(de.items, para.items, mesmaTela)

  const camera = {
    x: lerp(de.camera.x, para.camera.x, t),
    y: lerp(de.camera.y, para.camera.y, t),
    width: lerp(de.camera.width, para.camera.width, t),
    height: lerp(de.camera.height, para.camera.height, t),
  }

  // Deslize só existe para a sobreposição: o conteúdo da tela, na mesma tela,
  // está parado, e entre telas diferentes o deslize é feito pelo CSS.
  const deslize = slideOffset(transition, camera)

  const saindo = (item) => {
    const element = item.element
    if (item.layer === 'overlay' && deslize) {
      return { ...element, x: element.x - deslize.dx * t, y: element.y - deslize.dy * t }
    }
    return { ...element, opacity: opacidade(element) * (1 - t) }
  }
  const entrando = (item) => {
    const element = item.element
    if (item.layer === 'overlay' && deslize) {
      return { ...element, x: element.x + deslize.dx * (1 - t), y: element.y + deslize.dy * (1 - t) }
    }
    return { ...element, opacity: opacidade(element) * t }
  }

  const camada = (nome) => {
    const lista = []
    // Quem sai desenha por baixo de quem fica e de quem chega.
    de.items.forEach((item, index) => {
      if (item.layer !== nome || usados.has(index)) return
      lista.push({ key: `de:${item.element.id}`, element: saindo(item) })
    })
    para.items.forEach((item, index) => {
      if (item.layer !== nome) return
      if (pares.has(index)) lista.push(...mixPair(de.items[pares.get(index)].element, item.element, t))
      else lista.push({ key: item.element.id, element: entrando(item) })
    })
    return lista
  }

  return {
    screen: {
      id: para.screen.id,
      width: lerp(de.screen.width, para.screen.width, t),
      height: lerp(de.screen.height, para.screen.height, t),
      fill: mixColor(de.screen.fill, para.screen.fill, t),
      radius: lerp(de.screen.radius || 0, para.screen.radius || 0, t),
    },
    camera,
    below: camada('screen'),
    backdrop: lerp(de.overlayId ? BACKDROP_OPACITY : 0, para.overlayId ? BACKDROP_OPACITY : 0, t),
    above: camada('overlay'),
  }
}
