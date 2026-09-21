import { TOOLS } from './elements.js'
import { measureText, textStyle, verticalOffset } from './textMetrics.js'

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

  if (element.type === TOOLS.icon) {
    return (
      <g opacity={element.opacity}>
        {/* svg aninhado: o viewBox escala o desenho de 24x24 para a caixa do elemento. */}
        <svg
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          viewBox="0 0 24 24"
          overflow="visible"
        >
          <path
            d={element.path}
            fill="none"
            stroke={element.fill}
            strokeWidth={element.strokeWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            pointerEvents="none"
          />
        </svg>
        <rect
          data-el={hitId || undefined}
          className={hitClassName}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="transparent"
        />
      </g>
    )
  }

  if (element.type === TOOLS.image) {
    return (
      <g opacity={element.opacity}>
        <image
          href={element.src}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          preserveAspectRatio="xMidYMid slice"
          pointerEvents="none"
        />
        {/* Área de clique própria: <image> com href quebrado não recebe eventos. */}
        <rect
          data-el={hitId || undefined}
          className={hitClassName}
          x={element.x}
          y={element.y}
          width={element.width}
          height={element.height}
          fill="transparent"
        />
      </g>
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

  const offsetY = verticalOffset(metrics, style)

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
