import { useEffect, useMemo, useRef, useState } from 'react'
import { childrenOfScreen, screensOf } from './elements.js'
import { connectionsFrom } from './connections.js'
import CanvasElement from './CanvasElement.jsx'

/** Uma tela renderizada com o conteúdo que está dentro dela. */
function ScreenView({ screen, elements, connections, onNavigate, interactive }) {
  const children = childrenOfScreen(elements, screen)

  return (
    <svg
      className="player-screen"
      viewBox={`${screen.x} ${screen.y} ${screen.width} ${screen.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        x={screen.x}
        y={screen.y}
        width={screen.width}
        height={screen.height}
        rx={screen.radius}
        fill={screen.fill}
      />
      {children.map((element) => {
        const saidas = interactive ? connectionsFrom(connections, element.id) : []
        const clicavel = saidas.length > 0

        return (
          <g
            key={element.id}
            className={clicavel ? 'player-hotspot' : undefined}
            onClick={clicavel ? () => onNavigate(saidas[0]) : undefined}
          >
            <CanvasElement element={element} hitId={clicavel ? element.id : null} />
          </g>
        )
      })}
    </svg>
  )
}

export default function PrototypePlayer({
  elements,
  connections,
  startScreenId,
  onClose,
  showArrows = false,
  exitLabel = 'Sair da simulação (Esc)',
  emptyMessage,
}) {
  const screens = useMemo(() => screensOf(elements), [elements])
  const first = screens.find((screen) => screen.id === startScreenId) || screens[0]

  const [currentId, setCurrentId] = useState(first?.id || null)
  const [history, setHistory] = useState([])
  const [outgoing, setOutgoing] = useState(null)
  const timerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const current = screens.find((screen) => screen.id === currentId) || null

  function navigate(connection) {
    const target = screens.find((screen) => screen.id === connection.to)
    if (!target || target.id === currentId) return

    const duration = connection.transition === 'instant' ? 0 : connection.duration || 300

    if (duration > 0) {
      setOutgoing({ screen: current, transition: connection.transition, duration })
      clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setOutgoing(null), duration)
    }

    setHistory((atual) => [...atual, currentId])
    setCurrentId(target.id)
  }

  function voltar() {
    setHistory((atual) => {
      if (!atual.length) return atual
      setCurrentId(atual[atual.length - 1])
      setOutgoing(null)
      return atual.slice(0, -1)
    })
  }

  /**
   * Saídas da tela atual: dela própria ou de qualquer elemento dentro dela.
   * Com uma única saída a seta avança sozinha; com várias, a escolha é do
   * leitor clicando nos elementos (é o que torna a história ramificada).
   */
  const saidas = useMemo(() => {
    if (!current) return []
    const dentro = new Set([current.id, ...childrenOfScreen(elements, current).map((el) => el.id)])
    return connections.filter((connection) => dentro.has(connection.from))
  }, [current, elements, connections])

  const proxima = saidas.length === 1 ? saidas[0] : null

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
      if (event.key === 'Backspace' || event.key === 'ArrowLeft') voltar()
      if (event.key === 'ArrowRight' && proxima) navigate(proxima)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const entrando = outgoing ? `player-in player-in--${outgoing.transition}` : ''
  const saindo = outgoing ? `player-out player-out--${outgoing.transition}` : ''
  const estilo = outgoing ? { animationDuration: `${outgoing.duration}ms` } : undefined

  return (
    <div className="player-overlay">
      <header className="player-bar">
        <span className="player-title">{current ? current.name : 'Sem telas'}</span>
        <div className="player-actions">
          <button className="text-button" type="button" onClick={voltar} disabled={!history.length}>
            Voltar
          </button>
          <button className="text-button" type="button" onClick={onClose}>
            {exitLabel}
          </button>
        </div>
      </header>

      <div className="player-viewport">
        {!current && (
          <p className="home-status">
            {emptyMessage || (
              <>
                Crie uma tela com a ferramenta <strong>Tela</strong> para simular a navegação.
              </>
            )}
          </p>
        )}

        {current && showArrows && (
          <button
            className="player-arrow player-arrow--prev"
            type="button"
            onClick={voltar}
            disabled={!history.length}
            aria-label="Tela anterior"
          >
            ‹
          </button>
        )}

        {current && (
          <div className="player-stage" style={{ aspectRatio: `${current.width} / ${current.height}` }}>
            {outgoing?.screen && (
              <div className={`player-layer ${saindo}`} style={estilo}>
                <ScreenView
                  screen={outgoing.screen}
                  elements={elements}
                  connections={connections}
                  onNavigate={navigate}
                  interactive={false}
                />
              </div>
            )}
            <div className={`player-layer ${entrando}`} style={estilo} key={current.id}>
              <ScreenView
                screen={current}
                elements={elements}
                connections={connections}
                onNavigate={navigate}
                interactive
              />
            </div>
          </div>
        )}

        {current && showArrows && (
          <button
            className="player-arrow player-arrow--next"
            type="button"
            onClick={() => proxima && navigate(proxima)}
            disabled={!proxima}
            aria-label="Próxima tela"
            title={
              proxima
                ? 'Avançar'
                : saidas.length > 1
                  ? 'Esta tela tem mais de um caminho — escolha clicando no conteúdo'
                  : 'Fim deste caminho'
            }
          >
            ›
          </button>
        )}
      </div>
    </div>
  )
}
