import { TOOLS } from './elements.js'

const ICONS = {
  [TOOLS.select]: (
    <path d="M5 3l14 8-6 1.5L10 19z" fill="currentColor" stroke="none" />
  ),
  [TOOLS.rect]: <rect x="4" y="6" width="16" height="12" rx="3" />,
  [TOOLS.ellipse]: <ellipse cx="12" cy="12" rx="8" ry="6" />,
}

const TOOL_LIST = [
  { tool: TOOLS.select, label: 'Selecionar', hint: 'V' },
  { tool: TOOLS.rect, label: 'Retângulo', hint: 'R' },
  { tool: TOOLS.ellipse, label: 'Elipse', hint: 'E' },
  { tool: TOOLS.text, label: 'Texto', hint: 'T' },
]

export default function CanvasToolbar({ tool, onToolChange }) {
  return (
    <div className="canvas-toolbar" role="toolbar" aria-label="Ferramentas">
      {TOOL_LIST.map((item) => (
        <button
          key={item.tool}
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
              aria-hidden="true"
            >
              {ICONS[item.tool]}
            </svg>
          )}
          <span className="sr-only">{item.label}</span>
        </button>
      ))}
    </div>
  )
}
