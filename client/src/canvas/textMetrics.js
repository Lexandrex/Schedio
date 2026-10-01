export const FONT_FAMILIES = [
  { value: 'Inter, system-ui, sans-serif', label: 'Inter' },
  { value: 'Arial, Helvetica, sans-serif', label: 'Arial' },
  { value: 'Georgia, serif', label: 'Georgia' },
  { value: '"Times New Roman", Times, serif', label: 'Times New Roman' },
  { value: '"Courier New", Courier, monospace', label: 'Courier New' },
  { value: 'Verdana, Geneva, sans-serif', label: 'Verdana' },
]

export const DEFAULT_FONT_FAMILY = FONT_FAMILIES[0].value
export const DEFAULT_LINE_HEIGHT = 1.3

/**
 * Propriedades que valem por caractere, como no Word. As demais (alinhamento,
 * altura da linha) são do parágrafo — do elemento inteiro.
 */
export const CHAR_KEYS = ['fill', 'fontSize', 'fontFamily', 'fontWeight', 'fontStyle', 'textDecoration']

let measureContext = null
let currentFont = ''
const fontMetricsCache = new Map()
// Medida de cada elemento, pela identidade do objeto: elementos são imutáveis
// (toda edição cria um objeto novo), então o mesmo objeto mede sempre igual.
let measureCache = new WeakMap()
// Largura por fonte + trecho. Ao refluir, cada linha candidata soma de novo os
// trechos que já mediu na candidata anterior; e, a cada tecla, as linhas que
// não mudaram repetem os mesmos trechos.
const widthCache = new Map()
const WIDTH_CACHE_LIMIT = 20000

function getMeasureContext() {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d')
    // Medidas tiradas com a fonte de reserva, antes da web font chegar, ficariam
    // presas no cache para sempre. E o canvas só troca para a fonte carregada
    // quando `font` é atribuída de novo — daí esquecer a atual também.
    document.fonts?.addEventListener?.('loadingdone', () => {
      fontMetricsCache.clear()
      measureCache = new WeakMap()
      widthCache.clear()
      currentFont = ''
    })
  }
  return measureContext
}

/**
 * Avisa quando uma web font termina de carregar: o que foi medido antes usou
 * a fonte de reserva e precisa ser medido de novo. Devolve o cancelamento.
 */
export function onFontsLoaded(callback) {
  const fonts = document.fonts
  if (!fonts?.addEventListener) return () => {}
  fonts.addEventListener('loadingdone', callback)
  return () => fonts.removeEventListener('loadingdone', callback)
}

function setFont(context, font) {
  // Atribuir `font` faz o navegador reinterpretar a string; num texto com muitos
  // trechos isso pesa, então só troca quando muda de fato.
  if (font !== currentFont) {
    context.font = font
    currentFont = font
  }
}

/** Valores padrão para textos criados antes das opções de formatação existirem. */
export function textStyle(element) {
  return {
    fontFamily: element.fontFamily || DEFAULT_FONT_FAMILY,
    fontWeight: element.fontWeight || 'normal',
    fontStyle: element.fontStyle || 'normal',
    textDecoration: element.textDecoration || 'none',
    textAlign: element.textAlign || 'left',
    verticalAlign: element.verticalAlign || 'top',
    lineHeight: element.lineHeight || DEFAULT_LINE_HEIGHT,
  }
}

/**
 * Deslocamento vertical do conteúdo dentro da caixa. Mora aqui para o desenho
 * no mapa e a edição no lugar usarem a mesma conta — senão o texto salta ao
 * entrar em edição.
 */
export function verticalOffset(metrics, style) {
  const sobra = metrics.height - metrics.contentHeight
  if (style.verticalAlign === 'middle') return sobra / 2
  if (style.verticalAlign === 'bottom') return sobra
  return 0
}

/** Estilo de caractere do elemento: o que vale onde nenhum trecho diz outra coisa. */
export function charBase(element) {
  const style = textStyle(element)
  return {
    fill: element.fill,
    fontSize: element.fontSize,
    fontFamily: style.fontFamily,
    fontWeight: style.fontWeight,
    fontStyle: style.fontStyle,
    textDecoration: style.textDecoration,
  }
}

export function fontOf(style) {
  return `${style.fontStyle} ${style.fontWeight} ${style.fontSize}px ${style.fontFamily}`
}

/**
 * Métricas verticais da fonte. `hanging` é onde o SVG põe a linha de base
 * "pendurada": desenhar com a base alfabética em `topo + hanging` dá o mesmo
 * resultado de `dominant-baseline="hanging"` no topo — conferido no navegador —,
 * e é o que deixa letras de tamanhos diferentes dividirem a mesma linha de base.
 */
export function fontMetrics(style) {
  const font = fontOf(style)
  let metrics = fontMetricsCache.get(font)
  if (!metrics) {
    const context = getMeasureContext()
    setFont(context, font)
    const medida = context.measureText('H')
    const ascent = medida.fontBoundingBoxAscent ?? style.fontSize * 0.95
    const descent = medida.fontBoundingBoxDescent ?? style.fontSize * 0.25
    metrics = {
      ascent,
      descent,
      hanging: Math.abs(medida.hangingBaseline ?? ascent * 0.8),
    }
    fontMetricsCache.set(font, metrics)
  }
  return metrics
}

/** Trechos válidos de `element.runs`: ordenados, dentro do texto e sem sobreposição. */
export function validRuns(runs, length) {
  if (!Array.isArray(runs)) return []
  const ordenados = runs
    .filter((run) => run && Number.isFinite(run.start) && Number.isFinite(run.end))
    .map((run) => ({ ...run, start: Math.max(0, run.start), end: Math.min(length, run.end) }))
    .sort((a, b) => a.start - b.start)

  const validos = []
  let cursor = 0
  for (const run of ordenados) {
    const start = Math.max(run.start, cursor)
    if (run.end <= start) continue
    validos.push({ ...run, start })
    cursor = run.end
  }
  return validos
}

/** O que um trecho sobrescreve do estilo base. */
export function overridesOf(run) {
  const overrides = {}
  for (const key of CHAR_KEYS) {
    if (run[key] !== undefined && run[key] !== null) overrides[key] = run[key]
  }
  return overrides
}

/**
 * Divide o texto em trechos de estilo uniforme que o cobrem inteiro, cada um
 * com o estilo completo (base + o que o trecho sobrescreve). Texto sem `runs`
 * vira um trecho só, com o estilo do elemento.
 */
export function styledRanges(element) {
  const text = String(element.text ?? '')
  const base = charBase(element)
  const ranges = []
  let cursor = 0

  for (const run of validRuns(element.runs, text.length)) {
    if (run.start > cursor) ranges.push({ start: cursor, end: run.start, style: base })
    ranges.push({ start: run.start, end: run.end, style: { ...base, ...overridesOf(run) } })
    cursor = run.end
  }
  if (cursor < text.length || !ranges.length) ranges.push({ start: cursor, end: text.length, style: base })
  return ranges
}

/** Estilo do caractere em `index` (ou do último, se passar do fim). */
function styleAt(ranges, index) {
  for (const range of ranges) {
    if (index >= range.start && index < range.end) return range.style
  }
  return ranges[ranges.length - 1].style
}

function pieceWidth(context, font, piece) {
  const key = `${font}\u0000${piece}`
  let width = widthCache.get(key)
  if (width === undefined) {
    setFont(context, font)
    width = context.measureText(piece).width
    if (widthCache.size >= WIDTH_CACHE_LIMIT) widthCache.clear()
    widthCache.set(key, width)
  }
  return width
}

/** Largura de `text[start, end)`, medindo cada trecho com a fonte dele. */
function widthOf(context, text, ranges, start, end) {
  let total = 0
  for (const range of ranges) {
    if (range.end <= start) continue
    if (range.start >= end) break
    const piece = text.slice(Math.max(start, range.start), Math.min(end, range.end))
    total += pieceWidth(context, range.font, piece)
  }
  return total
}

/** Quebra uma palavra que sozinha já é mais larga que a caixa. */
function breakLongWord(measure, text, start, end, maxWidth) {
  const chunks = []
  let chunkStart = start
  let index = start

  while (index < end) {
    // Anda por ponto de código, não por unidade UTF-16, para não partir um emoji.
    const next = index + (text.codePointAt(index) > 0xffff ? 2 : 1)
    if (index > chunkStart && measure(chunkStart, next) > maxWidth) {
      chunks.push([chunkStart, index])
      chunkStart = index
    }
    index = next
  }

  if (end > chunkStart) chunks.push([chunkStart, end])
  return chunks
}

/**
 * Reflui uma linha lógica (`text[from, to)`) em quantas linhas visuais
 * couberem na largura. Trabalha com posições no texto, não com cópias das
 * palavras, para cada linha saber de quais caracteres — e estilos — é feita.
 */
function wrapLine(measure, text, from, to, maxWidth) {
  if (from === to) return [[from, to]]

  const lines = []
  // Linha em construção; vazia quando start === end.
  let current = [from, from]
  let position = from

  while (position <= to) {
    let wordEnd = text.indexOf(' ', position)
    if (wordEnd === -1 || wordEnd > to) wordEnd = to

    const hasCurrent = current[1] > current[0]
    const candidate = hasCurrent ? [current[0], wordEnd] : [position, wordEnd]

    if (measure(candidate[0], candidate[1]) <= maxWidth) {
      current = candidate
    } else {
      if (hasCurrent) lines.push(current)

      if (measure(position, wordEnd) > maxWidth) {
        const chunks = breakLongWord(measure, text, position, wordEnd, maxWidth)
        lines.push(...chunks.slice(0, -1))
        current = chunks[chunks.length - 1]
      } else {
        current = [position, wordEnd]
      }
    }

    // O espaço entre as palavras some na quebra, como antes.
    position = wordEnd + 1
  }

  lines.push(current)
  return lines
}

/**
 * Mede o bloco de texto. Sem largura definida a caixa acompanha o conteúdo;
 * com largura definida o texto é refluido para caber nela.
 *
 * Cada linha visual (`rows`) sabe seus trechos de estilo, a própria altura
 * (a do maior caractere nela, como no Word) e onde fica a linha de base.
 *
 * O resultado fica em cache pelo objeto do elemento — e é compartilhado:
 * quem recebe não deve alterá-lo. Sem o cache, cada render remedia cada texto
 * várias vezes (desenho, caixa, tela dona, recorte...): num projeto com 25
 * textos formatados eram ~75 mil chamadas a `measureText` do canvas e ~300 ms
 * por render — o mapa travava até ao mover o mouse.
 */
export function measureText(element) {
  let metrics = measureCache.get(element)
  if (!metrics) {
    metrics = computeMeasure(element)
    measureCache.set(element, metrics)
  }
  return metrics
}

function computeMeasure(element) {
  const style = textStyle(element)
  const context = getMeasureContext()
  const text = String(element.text ?? '')
  const ranges = styledRanges(element).map((range) => ({ ...range, font: fontOf(range.style) }))
  const measure = (start, end) => widthOf(context, text, ranges, start, end)

  const maxWidth = element.width > 0 ? element.width : null
  const spans = []
  let lineStart = 0
  for (;;) {
    const quebra = text.indexOf('\n', lineStart)
    const lineEnd = quebra === -1 ? text.length : quebra
    if (maxWidth) spans.push(...wrapLine(measure, text, lineStart, lineEnd, maxWidth))
    else spans.push([lineStart, lineEnd])
    if (quebra === -1) break
    lineStart = quebra + 1
  }

  let top = 0
  const rows = spans.map(([start, end]) => {
    const segments = []
    for (const range of ranges) {
      const segStart = Math.max(start, range.start)
      const segEnd = Math.min(end, range.end)
      if (segEnd > segStart) segments.push({ start: segStart, end: segEnd, text: text.slice(segStart, segEnd), style: range.style })
    }

    // Linha vazia tem a altura do caractere que a encerra (a quebra de linha),
    // como a marca de parágrafo no Word.
    const estilos = segments.length ? segments.map((segment) => segment.style) : [styleAt(ranges, start)]
    const size = Math.max(...estilos.map((item) => item.fontSize))
    const hanging = Math.max(...estilos.map((item) => fontMetrics(item).hanging))
    const height = style.lineHeight * size

    const row = {
      start,
      end,
      text: text.slice(start, end),
      segments,
      styles: estilos,
      width: measure(start, end),
      top,
      height,
      baseline: top + hanging,
    }
    top += height
    return row
  })

  const contentWidth = Math.max(0, ...rows.map((row) => row.width))
  const contentHeight = top

  return {
    rows,
    lines: rows.map((row) => row.text),
    lineWidths: rows.map((row) => row.width),
    lineHeight: style.lineHeight * element.fontSize,
    contentWidth,
    contentHeight,
    width: maxWidth ?? contentWidth,
    height: element.height > 0 ? element.height : contentHeight,
    isAutoSize: !maxWidth && !(element.height > 0),
  }
}
