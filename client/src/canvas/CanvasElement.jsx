import { memo } from 'react'
import { TOOLS } from './elements.js'
import { measureText, textStyle, verticalOffset } from './textMetrics.js'

/**
 * Desenha um elemento. É compartilhado entre o editor e o simulador de
 * protótipo para que os dois pintem exatamente a mesma coisa.
 *
 * `hitId` liga a área de clique (usada pelo editor para selecionar e pelo
 * simulador para disparar as conexões); sem ele o elemento é decorativo.
 */
/** Área de clique transparente sobre a caixa — o desenho em si não recebe eventos. */
function HitArea({ hitId, hitClassName, x, y, width, height }) {
  return (
    <rect
      data-el={hitId || undefined}
      className={hitClassName}
      x={x}
      y={y}
      width={width}
      height={height}
      fill="transparent"
    />
  )
}

/** Alinhamento do texto → `text-anchor` do SVG e fração da largura onde a linha ancora. */
const ANCORAS = {
  left: ['start', 0],
  center: ['middle', 0.5],
  right: ['end', 1],
}

function CanvasElement({ element, hitId = null, hitClassName }) {
  const hit = { hitId, hitClassName }

  if (element.type === TOOLS.screen || element.type === TOOLS.rect) {
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
        <HitArea {...hit} x={element.x} y={element.y} width={element.width} height={element.height} />
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
        <HitArea {...hit} x={element.x} y={element.y} width={element.width} height={element.height} />
      </g>
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
  const [anchor, fracao] = ANCORAS[style.textAlign] || ANCORAS.left
  const anchorX = element.x + metrics.width * fracao
  const offsetY = verticalOffset(metrics, style)

  return (
    <g opacity={element.opacity}>
      {/* Área de clique do bloco inteiro, inclusive linhas vazias. */}
      <HitArea
        {...hit}
        x={element.x}
        y={element.y}
        width={Math.max(metrics.width, 8)}
        height={Math.max(metrics.height, element.fontSize)}
      />
      {/*
        Cada linha é uma sequência de trechos com estilo próprio (formatação por
        caractere). Só o primeiro trecho da linha tem x/y: os seguintes
        continuam de onde o anterior parou, e a linha inteira forma um bloco só
        para o `text-anchor` alinhar. A base é a alfabética, posta onde a
        "pendurada" ficava (`row.baseline`), para letras de tamanhos diferentes
        dividirem a mesma linha de base. `white-space: pre` mantém os espaços
        repetidos que a medição conta.
      */}
      <text
        textAnchor={anchor}
        pointerEvents="none"
        style={{ userSelect: 'none', whiteSpace: 'pre' }}
      >
        {metrics.rows.map((row, rowIndex) =>
          row.segments.map((segment, index) => (
            <tspan
              key={`${rowIndex}:${index}`}
              x={index === 0 ? anchorX : undefined}
              y={index === 0 ? element.y + offsetY + row.baseline : undefined}
              fill={segment.style.fill}
              fontSize={segment.style.fontSize}
              fontFamily={segment.style.fontFamily}
              fontWeight={segment.style.fontWeight}
              fontStyle={segment.style.fontStyle}
              textDecoration={segment.style.textDecoration}
            >
              {segment.text}
            </tspan>
          )),
        )}
      </text>
    </g>
  )
}

// Memorizado: digitar num texto cria só aquele objeto de novo, então os outros
// elementos do mapa nem re-renderizam.
export default memo(CanvasElement)
