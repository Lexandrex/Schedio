import { TOOLS } from './elements.js'
import { measureText, textStyle } from './textMetrics.js'

/**
 * Desenha um elemento. É compartilhado entre o editor e o simulador de
 * protótipo para que os dois pintem exatamente a mesma coisa.
 *
 * `hitId` liga a área de clique (usada pelo editor para selecionar e pelo
 * simulador para disparar as conexões); sem ele o elemento é decorativo.
 */
export default function CanvasElement({ element, hitId = null, hitClassName }) {
  if (element.type === TOOLS.screen) {
    return (
      <rect
        data-el={hitId || undefined}
        className={hitClassName}
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

  if (element.type === TOOLS.rect) {
    return (
      <rect
        data-el={hitId || undefined}
        className={hitClassName}
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
        data-el={hitId || undefined}
        className={hitClassName}
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

  const style = textStyle(element)
  const metrics = measureText(element)
  const anchor = style.textAlign === 'center' ? 'middle' : style.textAlign === 'right' ? 'end' : 'start'
  const anchorX =
    style.textAlign === 'center'
      ? element.x + metrics.width / 2
      : style.textAlign === 'right'
        ? element.x + metrics.width
        : element.x

  const sobra = metrics.height - metrics.contentHeight
  const offsetY =
    style.verticalAlign === 'middle' ? sobra / 2 : style.verticalAlign === 'bottom' ? sobra : 0

  return (
    <g opacity={element.opacity}>
      {/* Área de clique do bloco inteiro, inclusive linhas vazias. */}
      <rect
        data-el={hitId || undefined}
        className={hitClassName}
        x={element.x}
        y={element.y}
        width={Math.max(metrics.width, 8)}
        height={Math.max(metrics.height, element.fontSize)}
        fill="transparent"
      />
      <text
        fill={element.fill}
        fontSize={element.fontSize}
        fontFamily={style.fontFamily}
        fontWeight={style.fontWeight}
        fontStyle={style.fontStyle}
        textDecoration={style.textDecoration}
        textAnchor={anchor}
        dominantBaseline="hanging"
        pointerEvents="none"
        style={{ userSelect: 'none' }}
      >
        {metrics.lines.map((line, index) => (
          <tspan key={index} x={anchorX} y={element.y + offsetY + index * metrics.lineHeight}>
            {line}
          </tspan>
        ))}
      </text>
    </g>
  )
}
