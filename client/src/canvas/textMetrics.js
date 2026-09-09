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

let measureContext = null

function getMeasureContext() {
  if (!measureContext) {
    measureContext = document.createElement('canvas').getContext('2d')
  }
  return measureContext
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

/** Quebra uma palavra que sozinha já é mais larga que a caixa. */
function breakLongWord(context, word, maxWidth) {
  const chunks = []
  let current = ''

  for (const char of word) {
    const candidate = current + char
    if (current && context.measureText(candidate).width > maxWidth) {
      chunks.push(current)
      current = char
    } else {
      current = candidate
    }
  }

  if (current) chunks.push(current)
  return chunks
}

/** Reflui uma linha lógica em quantas linhas visuais couberem na largura. */
function wrapLine(context, line, maxWidth) {
  if (!line) return ['']

  const lines = []
  let current = ''

  for (const word of line.split(' ')) {
    const candidate = current ? `${current} ${word}` : word

    if (context.measureText(candidate).width <= maxWidth) {
      current = candidate
      continue
    }

    if (current) {
      lines.push(current)
      current = ''
    }

    if (context.measureText(word).width > maxWidth) {
      const chunks = breakLongWord(context, word, maxWidth)
      lines.push(...chunks.slice(0, -1))
      current = chunks[chunks.length - 1]
    } else {
      current = word
    }
  }

  lines.push(current)
  return lines
}

/**
 * Mede o bloco de texto. Sem largura definida a caixa acompanha o conteúdo;
 * com largura definida o texto é refluido para caber nela.
 */
export function measureText(element) {
  const style = textStyle(element)
  const context = getMeasureContext()
  context.font = `${style.fontStyle} ${style.fontWeight} ${element.fontSize}px ${style.fontFamily}`

  const rawLines = String(element.text ?? '').split('\n')
  const maxWidth = element.width > 0 ? element.width : null
  const lines = maxWidth
    ? rawLines.flatMap((line) => wrapLine(context, line, maxWidth))
    : rawLines

  const lineWidths = lines.map((line) => context.measureText(line).width)
  const lineHeight = style.lineHeight * element.fontSize
  const contentWidth = Math.max(0, ...lineWidths)
  const contentHeight = lines.length * lineHeight

  return {
    lines,
    lineWidths,
    lineHeight,
    contentWidth,
    contentHeight,
    width: maxWidth ?? contentWidth,
    height: element.height > 0 ? element.height : contentHeight,
    isAutoSize: !maxWidth && !(element.height > 0),
  }
}
