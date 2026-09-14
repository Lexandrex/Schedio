import { Fragment } from 'react'
import { TOOLS } from './elements.js'

const ICONS = {
  [TOOLS.select]: <path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor" stroke="none" />,
  [TOOLS.screen]: (
    <>
      <rect x="6" y="3" width="12" height="18" rx="2" />
      <path d="M10 6h4" />
    </>
  ),
  [TOOLS.rect]: <rect x="4" y="6" width="16" height="12" rx="3" />,
  [TOOLS.ellipse]: <ellipse cx="12" cy="12" rx="8" ry="6" />,
  [TOOLS.image]: (
    <>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="M5 17l4.5-5 3.5 4 2.5-2.5L19 17" />
    </>
  ),
  [TOOLS.connect]: (
    <>
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="18" r="2.5" />
      <path d="M8 7.5 C 13 10, 14 12, 16 16" />
    </>
  ),
}

const TOOL_LIST = [
  { tool: TOOLS.select, label: 'Selecionar', hint: 'V' },
  { tool: TOOLS.screen, label: 'Tela', hint: 'F' },
  { tool: TOOLS.rect, label: 'Retângulo', hint: 'R' },
  { tool: TOOLS.ellipse, label: 'Elipse', hint: 'E' },
  { tool: TOOLS.text, label: 'Texto', hint: 'T' },
  { tool: TOOLS.connect, label: 'Ligação', hint: 'C' },
]

/** Imagem é ação, não modo: abre o seletor de arquivo em vez de armar uma ferramenta. */
function ImageButton({ onAddImage, isUploading }) {
  return (
    <button
      type="button"
      className="canvas-tool"
      onClick={onAddImage}
      disabled={isUploading}
      title={isUploading ? 'Enviando imagem...' : 'Inserir imagem'}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        aria-hidden="true"
      >
        {ICONS[TOOLS.image]}
      </svg>
      <span className="sr-only">Inserir imagem</span>
    </button>
  )
}

export default function CanvasToolbar({ tool, onToolChange, onAddImage, isUploading }) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Ferramentas">
      {TOOL_LIST.map((item) => (
        <Fragment key={item.tool}>
          {item.tool === TOOLS.connect && (
            <ImageButton onAddImage={onAddImage} isUploading={isUploading} />
          )}
          <button
            type="button"
            className={`canvas-tool${tool === item.tool ? ' active' : ''}`}
            onClick={() => onToolChange(item.tool)}
            aria-pressed={tool === item.tool}
            title={`${item.label} (${item.hint})`}
          >
            {item.tool === TOOLS.text ? (
              <span className="canvas-tool-text" aria-hidden="true">
                T
              </span>
            ) : (
              <svg
                width="24"
                height="24"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                aria-hidden="true"
              >
                {ICONS[item.tool]}
              </svg>
            )}
            <span className="sr-only">{item.label}</span>
          </button>
        </Fragment>
      ))}
    </div>
  )
}
