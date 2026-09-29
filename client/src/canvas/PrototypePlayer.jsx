import { useEffect, useMemo, useRef, useState } from 'react'
import { screenContaining, screensOf, visibleElements } from './elements.js'
import {
  delayOf,
  destinationKind,
  directionOf,
  reverseTransition,
  triggerOf,
} from './connections.js'
import { composeFrame, createParada, flattenFrame, sameParada } from './playerFrame.js'
import { easeInOutCubic, mixFrames } from './smartAnimate.js'
import CanvasElement from './CanvasElement.jsx'

/** Rolagem acumulada que conta como gesto (em pixels). */
const SCROLL_THRESHOLD = 40
/** Silêncio da roda que encerra um gesto — a inércia do trackpad continua mandando eventos. */
const SCROLL_GESTURE_GAP = 250
const SWIPE_THRESHOLD = 40

/**
 * Desenha um quadro (parado ou no meio de uma transição). As áreas de clique
 * levam `data-el`; quem trata os eventos é o palco, lendo esse atributo.
 */
function FrameView({ desenho, clicaveis }) {
  const { screen, camera } = desenho
  const classe = (id) => (clicaveis?.has(id) ? 'player-hotspot' : undefined)

  const pintar = ({ key, element }) => (
    <CanvasElement key={key} element={element} hitId={element.id} hitClassName={classe(element.id)} />
  )

  return (
    <svg
      className="player-screen"
      viewBox={`${camera.x} ${camera.y} ${camera.width} ${camera.height}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <rect
        data-el={screen.id}
        className={classe(screen.id)}
        x={0}
        y={0}
        width={screen.width}
        height={screen.height}
        rx={screen.radius}
        fill={screen.fill}
      />
      {desenho.below.map(pintar)}
      {desenho.backdrop > 0 && (
        // Véu da sobreposição: escurece a tela e fecha a sobreposição ao ser clicado.
        <rect
          data-backdrop="true"
          x={camera.x - camera.width}
          y={camera.y - camera.height}
          width={camera.width * 3}
          height={camera.height * 3}
          fill="#000"
          opacity={desenho.backdrop}
        />
      )}
      {desenho.above.map(pintar)}
    </svg>
  )
}

/** Transição desenhada quadro a quadro: a inteligente, e toda mudança dentro da mesma tela. */
function TweenStage({ anim, elements, onDone }) {
  const [t, setT] = useState(0)
  const de = useMemo(() => composeFrame(anim.from, elements), [anim, elements])
  const para = useMemo(() => composeFrame(anim.to, elements), [anim, elements])
  const onDoneRef = useRef(onDone)
  useEffect(() => {
    onDoneRef.current = onDone
  })

  useEffect(() => {
    let quadro
    const inicio = performance.now()
    const passo = (agora) => {
      const progresso = Math.min(1, (agora - inicio) / anim.duration)
      setT(easeInOutCubic(progresso))
      if (progresso < 1) quadro = requestAnimationFrame(passo)
      else onDoneRef.current()
    }
    quadro = requestAnimationFrame(passo)
    // O navegador pausa o requestAnimationFrame com a aba em segundo plano;
    // sem esta reserva a transição congelaria no meio, com os gatilhos suspensos.
    const reserva = setTimeout(() => onDoneRef.current(), anim.duration + 250)
    return () => {
      cancelAnimationFrame(quadro)
      clearTimeout(reserva)
    }
  }, [anim])

  if (!de || !para) return null
  const desenho = mixFrames(de, para, t, anim.transition)

  return (
    <div
      className="player-stage"
      style={{ aspectRatio: `${desenho.screen.width} / ${desenho.screen.height}` }}
    >
      <div className="player-layer">
        <FrameView desenho={desenho} />
      </div>
    </div>
  )
}

const dataEl = (target) => target?.getAttribute?.('data-el') || null

export default function PrototypePlayer({
  elements,
  connections,
  startScreenId,
  onClose,
  showArrows = false,
  exitLabel = 'Sair da simulação (Esc)',
  emptyMessage,
}) {
  // Camada oculta não entra na simulação nem na leitura — some com o elemento
  // e, se for uma tela, com a tela inteira.
  const visiveis = useMemo(() => visibleElements(elements), [elements])
  const byId = useMemo(() => new Map(visiveis.map((element) => [element.id, element])), [visiveis])
  const screens = useMemo(() => screensOf(visiveis), [visiveis])
  const first = screens.find((screen) => screen.id === startScreenId) || screens[0]

  const [parada, setParada] = useState(() => createParada(first?.id || null))
  // Cada entrada é a parada de onde se saiu e a transição usada — voltar toca
  // a mesma transição ao contrário. `hoverRect` marca a navegação feita
  // "enquanto o mouse estiver em cima": sair desse retângulo desfaz a entrada.
  const [history, setHistory] = useState([])
  const [anim, setAnim] = useState(null)
  const timerRef = useRef(null)
  const wheelRef = useRef({ acc: 0, last: 0, locked: false })
  const touchRef = useRef(null)
  const hoverRef = useRef(null)
  const pointerRef = useRef(null)

  useEffect(() => () => clearTimeout(timerRef.current), [])

  const frame = useMemo(() => composeFrame(parada, visiveis), [parada, visiveis])
  const current = frame?.screen || null
  const emTween = anim?.mode === 'tween'

  function animar(de, para, transition, duration) {
    clearTimeout(timerRef.current)
    const duracao = transition === 'instant' ? 0 : Number(duration) || 300
    if (!duracao) {
      setAnim(null)
      return
    }
    // Trocar de tela com deslize ou dissolver são duas camadas animadas pelo
    // CSS; o resto (inteligente, ou qualquer mudança na mesma tela) é quadro a quadro.
    const mode = de.screenId !== para.screenId && transition !== 'smart' ? 'css' : 'tween'
    setAnim({ id: `${performance.now()}`, mode, from: de, to: para, transition, duration: duracao })
    if (mode === 'css') timerRef.current = setTimeout(() => setAnim(null), duracao)
  }

  function destinoDe(connection) {
    const alvo = byId.get(connection.to)
    const tipo = destinationKind(visiveis, alvo)
    if (tipo === 'screen') return createParada(alvo.id)
    if (tipo === 'focus') return { ...createParada(screenContaining(visiveis, alvo).id), focusId: alvo.id }
    if (tipo === 'overlay') return { ...parada, overlayId: alvo.id }
    return null
  }

  function navigate(connection, hoverRect = null) {
    if (!frame) return
    const destino = destinoDe(connection)
    if (!destino || sameParada(destino, parada)) return

    const passo = { transition: connection.transition, duration: connection.duration }
    setHistory((atual) => [...atual, { parada, passo, hoverRect }])
    animar(parada, destino, passo.transition, passo.duration)
    setParada(destino)
  }

  /** Volta até a entrada `indice` do histórico, com a transição dela ao contrário. */
  function voltarPara(indice) {
    const entrada = history[indice]
    if (!entrada) return
    animar(parada, entrada.parada, reverseTransition(entrada.passo.transition), entrada.passo.duration)
    setParada(entrada.parada)
    setHistory(history.slice(0, indice))
  }

  function voltar() {
    voltarPara(history.length - 1)
  }

  /** Fecha a sobreposição — e as que foram abertas de dentro dela. */
  function fecharSobreposicao() {
    let indice = history.length - 1
    while (indice >= 0 && history[indice].parada.overlayId) indice -= 1
    voltarPara(indice)
  }

  /**
   * Todos os ids que estão na tela agora, com o "dono" de cada um: um elemento
   * sem ligação para um gatilho repassa para a tela (ou para a sobreposição
   * em que está), como no Figma — clicar no fundo de uma tela clicável vale.
   */
  const donos = useMemo(() => {
    const mapa = new Map()
    if (!frame) return mapa
    mapa.set(frame.screen.id, null)
    frame.items.forEach(({ element, layer }) => {
      if (element.id === frame.overlayId) mapa.set(element.id, null)
      else mapa.set(element.id, layer === 'overlay' ? frame.overlayId : frame.screen.id)
    })
    return mapa
  }, [frame])

  function ligacaoPara(id, aceita) {
    let origem = id
    while (origem && donos.has(origem)) {
      const achada = connections.find((connection) => connection.from === origem && aceita(connection))
      if (achada) return achada
      origem = donos.get(origem)
    }
    return null
  }

  const clicaveis = useMemo(
    () =>
      new Set(
        connections
          .filter((connection) => triggerOf(connection) === 'click' && donos.has(connection.from))
          .map((connection) => connection.from),
      ),
    [connections, donos],
  )

  // --- Gatilhos ---------------------------------------------------------

  function handleClick(event) {
    if (emTween) return
    if (event.target.getAttribute?.('data-backdrop')) {
      fecharSobreposicao()
      return
    }
    const ligacao = ligacaoPara(dataEl(event.target), (connection) => triggerOf(connection) === 'click')
    if (ligacao) navigate(ligacao)
  }

  function rolar(direction, target) {
    const ligacao = ligacaoPara(
      dataEl(target),
      (connection) => triggerOf(connection) === 'scroll' && directionOf(connection) === direction,
    )
    if (!ligacao) return false
    navigate(ligacao)
    return true
  }

  function handleWheel(event) {
    const roda = wheelRef.current
    const agora = performance.now()
    // Um gesto só dispara uma vez: depois de navegar, a roda fica travada até
    // parar de chegar evento — senão a inércia atravessaria várias telas.
    if (agora - roda.last > SCROLL_GESTURE_GAP) {
      roda.acc = 0
      roda.locked = false
    }
    roda.last = agora
    if (roda.locked || emTween) return

    roda.acc += event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY
    if (Math.abs(roda.acc) < SCROLL_THRESHOLD) return
    const direction = roda.acc > 0 ? 'down' : 'up'
    roda.acc = 0
    if (rolar(direction, event.target)) roda.locked = true
  }

  function handleTouchStart(event) {
    const toque = event.touches[0]
    touchRef.current = toque ? { y: toque.clientY, target: event.target } : null
  }

  function handleTouchEnd(event) {
    const inicio = touchRef.current
    const toque = event.changedTouches[0]
    touchRef.current = null
    if (!inicio || !toque || emTween) return
    const deslocamento = inicio.y - toque.clientY
    if (Math.abs(deslocamento) < SWIPE_THRESHOLD) return
    // Dedo subindo é rolar para baixo, como numa página.
    rolar(deslocamento > 0 ? 'down' : 'up', inicio.target)
  }

  function handlePointerOver(event) {
    const id = dataEl(event.target)
    const anterior = hoverRef.current
    if (id === anterior) return
    hoverRef.current = id
    if (!id || emTween) return

    const deMouse = (connection) => ['mouseenter', 'hover'].includes(triggerOf(connection))
    let ligacao = connections.find((connection) => connection.from === id && deMouse(connection))
    // A tela "recebe" o mouse quando ele entra no palco vindo de fora.
    if (!ligacao && anterior === null && frame) {
      ligacao = connections.find((connection) => connection.from === frame.screen.id && deMouse(connection))
    }
    if (!ligacao) return

    const retangulo =
      triggerOf(ligacao) === 'hover'
        ? (ligacao.from === id ? event.target : event.currentTarget).getBoundingClientRect()
        : null
    navigate(ligacao, retangulo)
  }

  /** "Enquanto o mouse estiver em cima": saiu do retângulo, desfaz. */
  function conferirHover() {
    const topo = history[history.length - 1]
    if (!topo?.hoverRect || emTween) return
    const ponto = pointerRef.current
    const r = topo.hoverRect
    const dentro =
      ponto && ponto.x >= r.left && ponto.x <= r.right && ponto.y >= r.top && ponto.y <= r.bottom
    if (!dentro) voltar()
  }

  function handlePointerMove(event) {
    pointerRef.current = { x: event.clientX, y: event.clientY }
    conferirHover()
  }

  function handlePointerLeave() {
    pointerRef.current = null
    hoverRef.current = null
    conferirHover()
  }

  // O mouse pode ter saído no meio de uma transição quadro a quadro, quando os
  // gatilhos ficam suspensos; ao terminar, confere de novo.
  const conferirRef = useRef(conferirHover)
  const navigateRef = useRef(navigate)
  useEffect(() => {
    conferirRef.current = conferirHover
    navigateRef.current = navigate
  })
  useEffect(() => {
    if (!anim) conferirRef.current()
  }, [anim])

  // "Após um tempo": conta a partir do fim da transição que trouxe até aqui.
  useEffect(() => {
    if (anim || !frame) return undefined
    const timers = connections
      .filter((connection) => triggerOf(connection) === 'delay' && donos.has(connection.from))
      .map((connection) => setTimeout(() => navigateRef.current(connection), delayOf(connection)))
    return () => timers.forEach(clearTimeout)
  }, [anim, frame, connections, donos])

  /**
   * Saídas da parada atual. Com uma única a seta avança sozinha; com várias,
   * a escolha é do leitor (é o que torna a história ramificada). O "enquanto
   * o mouse estiver em cima" não conta: é um estado passageiro, não um caminho.
   */
  const saidas = useMemo(
    () =>
      connections.filter(
        (connection) => donos.has(connection.from) && triggerOf(connection) !== 'hover',
      ),
    [connections, donos],
  )

  const proxima = saidas.length === 1 ? saidas[0] : null

  useEffect(() => {
    function onKey(event) {
      if (event.key === 'Escape') onClose()
      if (emTween) return
      if (event.key === 'Backspace' || event.key === 'ArrowLeft') voltar()
      if (event.key === 'ArrowRight' && proxima) navigate(proxima)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const cssAnim = anim?.mode === 'css' ? anim : null
  const estilo = cssAnim ? { animationDuration: `${cssAnim.duration}ms` } : undefined
  const anterior = useMemo(
    () => (cssAnim ? composeFrame(cssAnim.from, visiveis) : null),
    [cssAnim, visiveis],
  )

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

      <div
        className="player-viewport"
        onPointerMove={handlePointerMove}
        onPointerLeave={handlePointerLeave}
      >
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

        {current && emTween && (
          <TweenStage key={anim.id} anim={anim} elements={visiveis} onDone={() => setAnim(null)} />
        )}

        {current && !emTween && (
          <div
            className="player-stage"
            style={{ aspectRatio: `${current.width} / ${current.height}` }}
            onClick={handleClick}
            onWheel={handleWheel}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
            onPointerOver={handlePointerOver}
          >
            {anterior && (
              <div
                className={`player-layer player-layer--saindo player-out player-out--${cssAnim.transition}`}
                style={estilo}
              >
                <FrameView desenho={flattenFrame(anterior)} />
              </div>
            )}
            <div
              className={`player-layer${cssAnim ? ` player-in player-in--${cssAnim.transition}` : ''}`}
              style={estilo}
              key={cssAnim ? cssAnim.id : 'parado'}
            >
              <FrameView desenho={flattenFrame(frame)} clicaveis={clicaveis} />
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
