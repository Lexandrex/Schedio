import { TOOLS, isShape } from './elements.js'

const TYPE_LABEL = {
  [TOOLS.rect]: 'Retângulo',
  [TOOLS.ellipse]: 'Elipse',
  [TOOLS.text]: 'Texto',
}

function NumberField({ label, value, onChange, min }) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        onChange={(event) => {
          const next = Number(event.target.value)
          if (!Number.isNaN(next)) onChange(next)
        }}
      />
    </label>
  )
}

function ColorField({ label, value, onChange }) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <div className="prop-color">
        <input type="color" value={value} onChange={(event) => onChange(event.target.value)} />
        <span>{value.toUpperCase()}</span>
      </div>
    </label>
  )
}

export default function PropertiesPanel({ element, onUpdate, onDelete }) {
  if (!element) {
    return (
      <aside className="properties-panel">
        <h2>Propriedades</h2>
        <p className="properties-empty">Selecione um elemento no mapa para editar suas propriedades.</p>
      </aside>
    )
  }

  const update = (patch) => onUpdate(element.id, patch)

  return (
    <aside className="properties-panel">
      <h2>Propriedades</h2>
      <p className="properties-type">{TYPE_LABEL[element.type]}</p>

      <section className="prop-section">
        <h3>Posição</h3>
        <div className="prop-row">
          <NumberField label="X" value={element.x} onChange={(x) => update({ x })} />
          <NumberField label="Y" value={element.y} onChange={(y) => update({ y })} />
        </div>
      </section>

      {isShape(element) && (
        <section className="prop-section">
          <h3>Dimensões</h3>
          <div className="prop-row">
            <NumberField label="Largura" value={element.width} min={1} onChange={(width) => update({ width })} />
            <NumberField label="Altura" value={element.height} min={1} onChange={(height) => update({ height })} />
          </div>
          {element.type === TOOLS.rect && (
            <NumberField
              label="Raio da borda"
              value={element.radius}
              min={0}
              onChange={(radius) => update({ radius })}
            />
          )}
        </section>
      )}

      {element.type === TOOLS.text && (
        <section className="prop-section">
          <h3>Conteúdo</h3>
          <label className="prop-field">
            <span>Texto</span>
            <textarea
              className="bio-textarea"
              value={element.text}
              onChange={(event) => update({ text: event.target.value })}
            />
          </label>
          <NumberField
            label="Tamanho da fonte"
            value={element.fontSize}
            min={1}
            onChange={(fontSize) => update({ fontSize })}
          />
        </section>
      )}

      <section className="prop-section">
        <h3>Aparência</h3>
        <ColorField
          label={element.type === TOOLS.text ? 'Cor do texto' : 'Preenchimento'}
          value={element.fill}
          onChange={(fill) => update({ fill })}
        />

        {isShape(element) && (
          <>
            <ColorField label="Borda" value={element.stroke} onChange={(stroke) => update({ stroke })} />
            <NumberField
              label="Espessura"
              value={element.strokeWidth}
              min={0}
              onChange={(strokeWidth) => update({ strokeWidth })}
            />
          </>
        )}

        <label className="prop-field">
          <span>Opacidade — {Math.round(element.opacity * 100)}%</span>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            value={element.opacity}
            onChange={(event) => update({ opacity: Number(event.target.value) })}
          />
        </label>
      </section>

      <button className="danger-button" type="button" onClick={() => onDelete(element.id)}>
        Excluir elemento
      </button>
    </aside>
  )
}
