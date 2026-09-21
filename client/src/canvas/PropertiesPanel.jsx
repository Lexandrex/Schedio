import { TOOLS, TYPE_LABEL, elementLabel, hasBox, isIcon, isImage, isScreen } from './elements.js'
import { TRANSITIONS } from './connections.js'
import { FONT_FAMILIES, measureText, textStyle } from './textMetrics.js'

function NumberField({ label, value, onChange, min, step }) {
  return (
    <label className="prop-field">
      <span>{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        step={step}
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

function ToggleButton({ active, onClick, label, title, style }) {
  return (
    <button
      type="button"
      className={`format-button${active ? ' active' : ''}`}
      onClick={onClick}
      aria-pressed={active}
      title={title}
      style={style}
    >
      {label}
    </button>
  )
}

function AlignIcon({ lines }) {
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      {lines.map(([x, width], index) => (
        <rect key={index} x={x} y={index * 4} width={width} height="2" rx="1" fill="currentColor" />
      ))}
    </svg>
  )
}

function VerticalAlignIcon({ position }) {
  const y = position === 'top' ? 1 : position === 'middle' ? 6 : 11
  return (
    <svg width="16" height="14" viewBox="0 0 16 14" aria-hidden="true">
      <rect x="3" y={y} width="10" height="2" rx="1" fill="currentColor" />
      <rect x="3" y={y + 3} width="10" height="2" rx="1" fill="currentColor" opacity="0.55" />
    </svg>
  )
}

const VERTICAL_ALIGNMENTS = [
  { value: 'top', title: 'Alinhar ao topo', label: <VerticalAlignIcon position="top" /> },
  { value: 'middle', title: 'Centralizar verticalmente', label: <VerticalAlignIcon position="middle" /> },
  { value: 'bottom', title: 'Alinhar à base', label: <VerticalAlignIcon position="bottom" /> },
]

const ALIGNMENTS = [
  {
    value: 'left',
    title: 'Alinhar à esquerda',
    label: <AlignIcon lines={[[0, 16], [0, 10], [0, 13]]} />,
  },
  {
    value: 'center',
    title: 'Centralizar',
    label: <AlignIcon lines={[[0, 16], [3, 10], [1.5, 13]]} />,
  },
  {
    value: 'right',
    title: 'Alinhar à direita',
    label: <AlignIcon lines={[[0, 16], [6, 10], [3, 13]]} />,
  },
]

function TextFormatSection({ element, update }) {
  const style = textStyle(element)
  const metrics = measureText(element)

  const toggle = (key, onValue) =>
    update({ [key]: style[key] === onValue ? (key === 'textDecoration' ? 'none' : 'normal') : onValue })

  return (
    <>
      <section className="prop-section">
        <h3>Conteúdo</h3>
        <label className="prop-field">
          <span>Texto — Enter quebra a linha</span>
          <textarea
            className="bio-textarea"
            value={element.text}
            onChange={(event) => update({ text: event.target.value })}
          />
        </label>
      </section>

      <section className="prop-section">
        <h3>Dimensões</h3>
        <div className="prop-row">
          <NumberField
            label="Largura"
            value={Math.round(metrics.width)}
            min={1}
            onChange={(width) => update({ width })}
          />
          <NumberField
            label="Altura"
            value={Math.round(metrics.height)}
            min={1}
            onChange={(height) => update({ height })}
          />
        </div>

        <p className="prop-hint">
          {metrics.isAutoSize
            ? 'Ajustando ao conteúdo. Ao definir uma largura, o texto quebra sozinho para caber.'
            : `Conteúdo refluido em ${metrics.lines.length} linha(s).`}
        </p>

        {!metrics.isAutoSize && (
          <button
            className="text-button prop-reset"
            type="button"
            onClick={() => update({ width: null, height: null })}
          >
            Voltar ao ajuste automático
          </button>
        )}

        <div className="prop-field">
          <span>Alinhamento vertical</span>
          <div className="format-group">
            {VERTICAL_ALIGNMENTS.map((item) => (
              <ToggleButton
                key={item.value}
                active={style.verticalAlign === item.value}
                onClick={() => update({ verticalAlign: item.value })}
                label={item.label}
                title={item.title}
              />
            ))}
          </div>
        </div>
      </section>

      <section className="prop-section">
        <h3>Fonte</h3>

        <label className="prop-field">
          <span>Família</span>
          <select
            className="prop-select"
            value={style.fontFamily}
            onChange={(event) => update({ fontFamily: event.target.value })}
          >
            {FONT_FAMILIES.map((font) => (
              <option key={font.value} value={font.value} style={{ fontFamily: font.value }}>
                {font.label}
              </option>
            ))}
          </select>
        </label>

        <div className="prop-row">
          <NumberField
            label="Tamanho"
            value={element.fontSize}
            min={1}
            onChange={(fontSize) => update({ fontSize })}
          />
          <NumberField
            label="Altura da linha"
            value={style.lineHeight}
            min={0.5}
            step={0.1}
            onChange={(lineHeight) => update({ lineHeight })}
          />
        </div>

        <div className="prop-field">
          <span>Estilo</span>
          <div className="format-group">
            <ToggleButton
              active={style.fontWeight === 'bold'}
              onClick={() => toggle('fontWeight', 'bold')}
              label="N"
              title="Negrito"
              style={{ fontWeight: 700 }}
            />
            <ToggleButton
              active={style.fontStyle === 'italic'}
              onClick={() => toggle('fontStyle', 'italic')}
              label="I"
              title="Itálico"
              style={{ fontStyle: 'italic' }}
            />
            <ToggleButton
              active={style.textDecoration === 'underline'}
              onClick={() => toggle('textDecoration', 'underline')}
              label="S"
              title="Sublinhado"
              style={{ textDecoration: 'underline' }}
            />
          </div>
        </div>

        <div className="prop-field">
          <span>Alinhamento</span>
          <div className="format-group">
            {ALIGNMENTS.map((item) => (
              <ToggleButton
                key={item.value}
                active={style.textAlign === item.value}
                onClick={() => update({ textAlign: item.value })}
                label={item.label}
                title={item.title}
              />
            ))}
          </div>
        </div>
      </section>
    </>
  )
}

function ConnectionSection({ connection, elements, onUpdate, onDelete }) {
  // O mesmo nome que a lista de camadas mostra, para os dois painéis falarem
  // do mesmo elemento com a mesma palavra.
  const nomeDe = (id) => {
    const alvo = elements.find((element) => element.id === id)
    return alvo ? elementLabel(alvo) : 'removido'
  }

  const update = (patch) => onUpdate(connection.id, patch)

  return (
    <aside className="properties-panel">
      <h2>Propriedades</h2>
      <p className="properties-type">Ligação</p>

      <section className="prop-section">
        <h3>Percurso</h3>
        <p className="prop-hint">
          De <strong>{nomeDe(connection.from)}</strong> para <strong>{nomeDe(connection.to)}</strong>.
        </p>
      </section>

      <section className="prop-section">
        <h3>Interação</h3>

        <label className="prop-field">
          <span>Gatilho</span>
          <select className="prop-select" value={connection.trigger} disabled>
            <option value="click">Ao clicar</option>
          </select>
        </label>

        <label className="prop-field">
          <span>Transição</span>
          <select
            className="prop-select"
            value={connection.transition}
            onChange={(event) => update({ transition: event.target.value })}
          >
            {TRANSITIONS.map((item) => (
              <option key={item.value} value={item.value}>
                {item.label}
              </option>
            ))}
          </select>
        </label>

        {connection.transition !== 'instant' && (
          <NumberField
            label="Duração (ms)"
            value={connection.duration}
            min={0}
            step={50}
            onChange={(duration) => update({ duration })}
          />
        )}
      </section>

      <button className="danger-button" type="button" onClick={() => onDelete(connection.id)}>
        Excluir ligação
      </button>
    </aside>
  )
}

/** Sem seleção o painel vira o lugar das configurações do projeto. */
function ProjectSection({ capa, isUploading, onChangeCapa }) {
  return (
    <aside className="properties-panel">
      <h2>Propriedades</h2>
      <p className="properties-type">Projeto</p>

      <section className="prop-section">
        <h3>Capa</h3>
        <div
          className="capa-preview"
          style={capa ? { backgroundImage: `url(${capa})` } : undefined}
          aria-label={capa ? 'Capa atual do projeto' : 'Projeto sem capa'}
        />
        <button
          className="text-button prop-reset"
          type="button"
          onClick={onChangeCapa}
          disabled={isUploading}
        >
          {isUploading ? 'Enviando...' : capa ? 'Trocar capa' : 'Enviar capa'}
        </button>
        <p className="prop-hint">A capa aparece na tela inicial e na apresentação para o leitor.</p>
      </section>

      <p className="properties-empty">
        Selecione um elemento ou uma ligação no mapa para editar suas propriedades.
      </p>
    </aside>
  )
}

export default function PropertiesPanel({
  element,
  connection,
  elements = [],
  isStartScreen,
  capa,
  isUploading,
  onChangeCapa,
  onUpdate,
  onDelete,
  onUpdateConnection,
  onDeleteConnection,
  onSetStartScreen,
}) {
  if (connection) {
    return (
      <ConnectionSection
        connection={connection}
        elements={elements}
        onUpdate={onUpdateConnection}
        onDelete={onDeleteConnection}
      />
    )
  }

  if (!element) {
    return <ProjectSection capa={capa} isUploading={isUploading} onChangeCapa={onChangeCapa} />
  }

  const update = (patch) => onUpdate(element.id, patch)

  return (
    <aside className="properties-panel">
      <h2>Propriedades</h2>
      <p className="properties-type">
        {TYPE_LABEL[element.type]}
        {isIcon(element) && element.nome ? ` — ${element.nome}` : ''}
      </p>

      {isScreen(element) && (
        <section className="prop-section">
          <h3>Tela</h3>
          <label className="prop-field">
            <span>Nome</span>
            <input
              type="text"
              maxLength={60}
              value={element.name}
              onChange={(event) => update({ name: event.target.value })}
            />
          </label>

          {isStartScreen ? (
            <p className="prop-hint">▶ É a tela inicial da simulação.</p>
          ) : (
            <button
              className="text-button prop-reset"
              type="button"
              onClick={() => onSetStartScreen(element.id)}
            >
              Definir como tela inicial
            </button>
          )}
        </section>
      )}

      {!isScreen(element) && (
        <section className="prop-section">
          <h3>Camada</h3>
          <label className="prop-field">
            <span>Nome</span>
            <input
              type="text"
              maxLength={60}
              placeholder={elementLabel(element)}
              value={element.name || ''}
              onChange={(event) => update({ name: event.target.value || null })}
            />
          </label>
          <p className="prop-hint">
            Sem nome, a lista de camadas identifica o elemento pelo conteúdo.
          </p>
        </section>
      )}

      <section className="prop-section">
        <h3>Posição</h3>
        <div className="prop-row">
          <NumberField label="X" value={element.x} onChange={(x) => update({ x })} />
          <NumberField label="Y" value={element.y} onChange={(y) => update({ y })} />
        </div>
      </section>

      {hasBox(element) && (
        <section className="prop-section">
          <h3>Dimensões</h3>
          <div className="prop-row">
            <NumberField label="Largura" value={element.width} min={1} onChange={(width) => update({ width })} />
            <NumberField label="Altura" value={element.height} min={1} onChange={(height) => update({ height })} />
          </div>
          {(element.type === TOOLS.rect || isScreen(element)) && (
            <NumberField
              label="Raio da borda"
              value={element.radius}
              min={0}
              onChange={(radius) => update({ radius })}
            />
          )}
        </section>
      )}

      {element.type === TOOLS.text && <TextFormatSection element={element} update={update} />}

      <section className="prop-section">
        <h3>Aparência</h3>

        {/* Imagem não tem preenchimento nem borda: o conteúdo é o próprio arquivo. */}
        {!isImage(element) && (
          <ColorField
            label={element.type === TOOLS.text ? 'Cor do texto' : isIcon(element) ? 'Cor' : 'Preenchimento'}
            value={element.fill}
            onChange={(fill) => update({ fill })}
          />
        )}

        {/* Ícone é só traço: tem espessura, mas não tem cor de borda separada. */}
        {isIcon(element) && (
          <NumberField
            label="Espessura do traço"
            value={element.strokeWidth}
            min={0.5}
            step={0.1}
            onChange={(strokeWidth) => update({ strokeWidth })}
          />
        )}

        {hasBox(element) && !isImage(element) && !isIcon(element) && (
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
