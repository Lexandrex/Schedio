import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest, uploadImage } from '../api.js'
import CanvasStage from '../canvas/CanvasStage.jsx'
import CanvasToolbar from '../canvas/CanvasToolbar.jsx'
import PropertiesPanel from '../canvas/PropertiesPanel.jsx'
import PrototypePlayer from '../canvas/PrototypePlayer.jsx'
import IconLibrary from '../canvas/IconLibrary.jsx'
import LayersPanel from '../canvas/LayersPanel.jsx'
import ShareDialog from '../canvas/ShareDialog.jsx'
import { ICON_DEFAULT_SIZE } from '../canvas/iconLibrary.js'
import {
  TOOLS,
  boxOf,
  childrenOfScreen,
  createIcon,
  createImage,
  duplicateElement,
  isLocked,
  isScreen,
  reorderElement,
  screensOf,
} from '../canvas/elements.js'
import { createConnection, pruneConnections } from '../canvas/connections.js'
import { createStore, useStore } from '../canvas/store.js'
import { DEFAULT_VIEW, clampZoom } from '../canvas/view.js'

const AUTOSAVE_MS = 10000
/** De quanto em quanto tempo o mapa procura o que outra pessoa salvou. */
const SINCRONIA_MS = 10000

/** Deslocamento de um passo pelas setas do teclado, para ajuste fino. */
const NUDGE = {
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
}

const TOOL_SHORTCUTS = {
  v: TOOLS.select,
  f: TOOLS.screen,
  r: TOOLS.rect,
  e: TOOLS.ellipse,
  t: TOOLS.text,
  c: TOOLS.connect,
}

/** Celular, em pé (mesmo corte do layout de celular no CSS) ou deitado. */
const telaEstreita = () => window.matchMedia('(max-width: 760px), (max-height: 500px)').matches

/** Tamanho visível do mapa, com uma reserva para antes de ele existir. */
function tamanhoDoVisor() {
  const viewport = document.querySelector('.canvas-viewport')
  return { width: viewport?.clientWidth || 800, height: viewport?.clientHeight || 600 }
}

/** Lê as dimensões reais do arquivo para a imagem entrar no canvas sem distorcer. */
async function medirImagem(file) {
  try {
    const bitmap = await createImageBitmap(file)
    const escala = Math.min(1, 400 / bitmap.width)
    return { width: Math.round(bitmap.width * escala), height: Math.round(bitmap.height * escala) }
  } catch {
    return { width: 300, height: 200 }
  }
}

/** Coordenadas do mouse no mapa — o único que re-renderiza quando o mouse anda. */
function Coordenadas({ store }) {
  const coords = useStore(store)
  return (
    <span>
      X {Math.round(coords.x)} · Y {Math.round(coords.y)}
    </span>
  )
}

/**
 * O editor do projeto. Abre de três jeitos:
 * - dono: tudo;
 * - colaborador (`project.papel === 'colaborador'`): edita o canvas, mas não
 *   publica, não troca a capa nem compartilha (RN-18);
 * - `visualizacao` ({ token, convite }), vindo de um link de visualização:
 *   só vê e simula (RN-19). O conteúdo chega pelo convite, não pela rota do
 *   editor, e nada é gravado.
 *
 * Nos três, o mapa procura de tempos em tempos o que outra pessoa salvou e,
 * se não há alteração local pendente, troca pelo novo.
 */
export default function CanvasPage({ visualizacao = null }) {
  const params = useParams()
  const somenteLeitura = Boolean(visualizacao)
  const id = somenteLeitura ? visualizacao.convite.projeto.id : params.id

  // Na visualização o projeto já chegou com o convite: nasce carregado.
  const inicial = visualizacao?.convite.projeto
  const [project, setProject] = useState(inicial || null)
  const [elements, setElements] = useState(inicial?.conteudo?.elements || [])
  const [isLoading, setIsLoading] = useState(!inicial)
  const [error, setError] = useState('')

  // Documentos da versão 1 não têm ligações; o editor segue funcionando com eles.
  const [connections, setConnections] = useState(inicial?.conteudo?.connections || [])
  const [startScreenId, setStartScreenId] = useState(inicial?.conteudo?.startScreen || null)

  const [tool, setTool] = useState(TOOLS.select)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState(null)
  const [pendingFrom, setPendingFrom] = useState(null)
  // Trecho selecionado no texto em edição ({ id, start, end }): o painel
  // formata só ele em vez do texto todo. Fica num store, não num estado da
  // página: muda a cada movimento do cursor, e só o painel precisa saber.
  const [textSelectionStore] = useState(() => createStore(null))
  const [isPlaying, setIsPlaying] = useState(false)
  const [isSharing, setIsSharing] = useState(false)
  // Outra pessoa salvou desde que abrimos a versão em mãos: o salvamento
  // parou e o usuário decide entre recarregar e sobrescrever.
  const [conflito, setConflito] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const imagemInputRef = useRef(null)
  const capaInputRef = useRef(null)
  const [view, setView] = useState(DEFAULT_VIEW)
  // No celular os painéis abertos cobririam quase todo o mapa: começam recolhidos.
  const [painelIcones, setPainelIcones] = useState(() => !telaEstreita())
  const [painelCamadas, setPainelCamadas] = useState(() => !telaEstreita())
  // Store pelo mesmo motivo: muda a cada `pointermove` sobre o mapa.
  const [coordsStore] = useState(() => createStore({ x: 0, y: 0 }))

  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  // Cópias do estado para callbacks estáveis, timers e ouvintes da janela, que
  // precisam do valor atual sem se reinscrever a cada mudança.
  const elementsRef = useRef(elements)
  const connectionsRef = useRef(connections)
  const startScreenRef = useRef(startScreenId)
  const dirtyRef = useRef(false)
  const conflitoRef = useRef(false)
  const savingRef = useRef(false)
  // Versão do canvas em mãos: vai junto ao gravar, e o servidor recusa (409)
  // se outra pessoa salvou depois dela.
  const versaoRef = useRef(inicial?.versao ?? 0)

  useEffect(() => {
    elementsRef.current = elements
    connectionsRef.current = connections
    startScreenRef.current = startScreenId
    dirtyRef.current = isDirty
    conflitoRef.current = conflito
  })

  const aplicarProjeto = useCallback((dados) => {
    const conteudo = dados.conteudo || {}
    versaoRef.current = dados.versao ?? 0
    setProject(dados)
    setElements(conteudo.elements || [])
    // Documentos da versão 1 não têm ligações; o editor segue funcionando com eles.
    setConnections(conteudo.connections || [])
    setStartScreenId(conteudo.startScreen || null)
  }, [])

  useEffect(() => {
    if (visualizacao) return
    apiRequest(`/api/projects/${id}`)
      .then((data) => aplicarProjeto(data.project))
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [id, visualizacao, aplicarProjeto])

  /** Com `forcar`, grava sem conferir a versão: é o "sobrescrever" do conflito. */
  const save = useCallback(async ({ forcar = false } = {}) => {
    if (somenteLeitura) return false
    setIsSaving(true)
    savingRef.current = true
    try {
      const data = await apiRequest(`/api/projects/${id}/conteudo`, {
        method: 'PUT',
        json: {
          conteudo: {
            version: 2,
            elements: elementsRef.current,
            connections: connectionsRef.current,
            startScreen: startScreenRef.current,
          },
          ...(forcar ? {} : { versao: versaoRef.current }),
        },
      })
      if (data?.versao !== undefined) versaoRef.current = data.versao
      setIsDirty(false)
      setSavedAt(new Date())
      setError('')
      setConflito(false)
      return true
    } catch (requestError) {
      if (requestError.status === 409) {
        setConflito(true)
        setError('')
      } else {
        setError(requestError.message)
      }
      return false
    } finally {
      setIsSaving(false)
      savingRef.current = false
    }
  }, [id, somenteLeitura])

  /** Descarta o que não foi salvo e abre a versão que está no servidor. */
  const recarregar = useCallback(async () => {
    try {
      const data = await apiRequest(`/api/projects/${id}`)
      aplicarProjeto(data.project)
      setIsDirty(false)
      setConflito(false)
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    }
  }, [id, aplicarProjeto])

  // Traz o que outra pessoa salvou. Com alteração local pendente não troca
  // nada: o próximo salvamento é que detecta o conflito e pergunta.
  useEffect(() => {
    const interval = setInterval(async () => {
      if (dirtyRef.current || savingRef.current || conflitoRef.current) return
      try {
        if (visualizacao) {
          const { convite } = await apiRequest(`/api/convites/${visualizacao.token}`)
          if (convite.projeto.versao !== versaoRef.current) aplicarProjeto(convite.projeto)
          return
        }
        const { versao } = await apiRequest(`/api/projects/${id}/versao`)
        if (versao === versaoRef.current) return
        const { project: atual } = await apiRequest(`/api/projects/${id}`)
        if (!dirtyRef.current && !savingRef.current) aplicarProjeto(atual)
      } catch (requestError) {
        if (requestError.status !== 404) return
        // Link vencido ou revogado, ou colaborador removido: o acesso acabou.
        if (visualizacao) {
          setProject(null)
          setIsPlaying(false)
          setError('Este link expirou ou foi revogado.')
        } else {
          setError('Você não tem mais acesso a este projeto.')
        }
      }
    }, SINCRONIA_MS)
    return () => clearInterval(interval)
  }, [id, visualizacao, aplicarProjeto])

  const toggleStatus = useCallback(async () => {
    const status = project?.status === 'publicado' ? 'privado' : 'publicado'
    setIsPublishing(true)

    try {
      // Publica sempre o que está salvo: grava as alterações pendentes antes.
      if (dirtyRef.current && !(await save())) return

      const data = await apiRequest(`/api/projects/${id}/status`, { method: 'PATCH', json: { status } })
      setProject((current) => ({ ...current, status: data.project.status }))
      setError('')
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsPublishing(false)
    }
  }, [id, project?.status, save])

  // Salvamento automático a cada 10 segundos, apenas quando há alterações pendentes.
  useEffect(() => {
    const interval = setInterval(() => {
      if (dirtyRef.current && !conflitoRef.current) save()
    }, AUTOSAVE_MS)
    return () => clearInterval(interval)
  }, [save])

  useEffect(() => {
    function warnOnLeave(event) {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warnOnLeave)
    return () => window.removeEventListener('beforeunload', warnOnLeave)
  }, [])

  const updateElement = useCallback((elementId, patch) => {
    setElements((current) =>
      current.map((element) => (element.id === elementId ? { ...element, ...patch } : element)),
    )
    setIsDirty(true)
  }, [])

  const updateElements = useCallback((patches) => {
    setElements((current) =>
      current.map((element) => (patches[element.id] ? { ...element, ...patches[element.id] } : element)),
    )
    setIsDirty(true)
  }, [])

  const createElement = useCallback((element) => {
    setElements((current) => {
      // Telas nascem numeradas para ficarem distinguíveis no mapa e nas ligações.
      if (isScreen(element)) {
        element = { ...element, name: `Tela ${screensOf(current).length + 1}` }
      }
      return [...current, element]
    })
    // A primeira tela criada vira o ponto de partida da simulação.
    if (isScreen(element)) setStartScreenId((current) => current || element.id)
    setSelectedId(element.id)
    setSelectedConnectionId(null)
    setTool(TOOLS.select)
    setIsDirty(true)
  }, [])

  const deleteElement = useCallback((elementId) => {
    setElements((current) => {
      const restantes = current.filter((element) => element.id !== elementId)
      // RN-12: ligação só existe entre elementos existentes.
      setConnections((atuais) => pruneConnections(atuais, restantes))
      return restantes
    })
    setSelectedId((current) => (current === elementId ? null : current))
    setStartScreenId((current) => (current === elementId ? null : current))
    setIsDirty(true)
  }, [])

  const updateConnection = useCallback((connectionId, patch) => {
    setConnections((current) =>
      current.map((connection) =>
        connection.id === connectionId ? { ...connection, ...patch } : connection,
      ),
    )
    setIsDirty(true)
  }, [])

  const deleteConnection = useCallback((connectionId) => {
    setConnections((current) => current.filter((connection) => connection.id !== connectionId))
    setSelectedConnectionId((current) => (current === connectionId ? null : current))
    setIsDirty(true)
  }, [])

  const selectElement = useCallback((elementId) => {
    setSelectedId(elementId)
    setSelectedConnectionId(null)
  }, [])

  const selectConnection = useCallback((connectionId) => {
    setSelectedConnectionId(connectionId)
    setSelectedId(null)
  }, [])

  const reordenarElemento = useCallback((elementId, direcao) => {
    setElements((current) => {
      const proximo = reorderElement(current, elementId, direcao)
      if (proximo !== current) setIsDirty(true)
      return proximo
    })
  }, [])

  /** A cópia nasce sem as ligações do original — o percurso é redesenhado à mão. */
  const duplicarElemento = useCallback((elementId) => {
    const novos = duplicateElement(elementsRef.current, elementId)
    if (!novos.length) return
    setElements((current) => [...current, ...novos])
    setSelectedId(novos[0].id)
    setSelectedConnectionId(null)
    setIsDirty(true)
  }, [])

  /** Move pelo teclado. Como no arraste, tela leva junto o conteúdo não travado. */
  const moverElemento = useCallback(
    (elementId, deltaX, deltaY) => {
      const atuais = elementsRef.current
      const alvo = atuais.find((element) => element.id === elementId)
      if (!alvo || isLocked(alvo)) return

      const patches = { [alvo.id]: { x: alvo.x + deltaX, y: alvo.y + deltaY } }
      if (isScreen(alvo)) {
        childrenOfScreen(atuais, alvo)
          .filter((child) => !isLocked(child))
          .forEach((child) => {
            patches[child.id] = { x: child.x + deltaX, y: child.y + deltaY }
          })
      }
      updateElements(patches)
    },
    [updateElements],
  )

  /** Traz o elemento para o centro da tela sem mexer no zoom. */
  const focarElemento = useCallback(
    (elementId) => {
      const alvo = elementsRef.current.find((element) => element.id === elementId)
      if (!alvo) return
      const box = boxOf(alvo)
      const visor = tamanhoDoVisor()

      setView((atual) => ({
        ...atual,
        x: visor.width / 2 - (box.x + box.width / 2) * atual.zoom,
        y: visor.height / 2 - (box.y + box.height / 2) * atual.zoom,
      }))
      selectElement(elementId)
    },
    [selectElement],
  )

  /** Ferramenta de ligação: 1º clique escolhe a origem, 2º o destino (que precisa ser uma tela). */
  const handleConnectPick = useCallback(
    (elementId) => {
      if (!elementId) {
        setPendingFrom(null)
        return
      }

      if (!pendingFrom) {
        setPendingFrom(elementId)
        setError('')
        return
      }

      if (elementId === pendingFrom) {
        setPendingFrom(null)
        return
      }

      // O destino pode ser uma tela, um objeto dentro de uma tela (a simulação
      // aproxima a câmera nele) ou um objeto fora das telas (abre por cima).
      const alvo = elementsRef.current.find((element) => element.id === elementId)
      if (!alvo) return

      const jaExiste = connectionsRef.current.some(
        (connection) => connection.from === pendingFrom && connection.to === elementId,
      )
      if (!jaExiste) {
        const nova = createConnection(pendingFrom, elementId)
        setConnections((current) => [...current, nova])
        setSelectedConnectionId(nova.id)
        setSelectedId(null)
        setIsDirty(true)
      }

      setPendingFrom(null)
      setError('')
      setTool(TOOLS.select)
    },
    [pendingFrom],
  )

  const setStartScreen = useCallback((screenId) => {
    setStartScreenId(screenId)
    setIsDirty(true)
  }, [])

  /** Centro do que está visível, em coordenadas do mapa. */
  const centroVisivel = useCallback(() => {
    const visor = tamanhoDoVisor()
    return {
      x: (visor.width / 2 - view.x) / view.zoom,
      y: (visor.height / 2 - view.y) / view.zoom,
    }
  }, [view])

  /** Ícone solto no mapa: fica centrado no ponto onde foi largado. */
  const adicionarIcone = useCallback(
    (icone, ponto) => {
      const destino = ponto || centroVisivel()
      createElement(
        createIcon(
          Math.round(destino.x - ICON_DEFAULT_SIZE / 2),
          Math.round(destino.y - ICON_DEFAULT_SIZE / 2),
          ICON_DEFAULT_SIZE,
          icone.nome,
          icone.path,
        ),
      )
    },
    [centroVisivel, createElement],
  )

  /** Pega o arquivo escolhido e roda `enviar` com o indicador de envio e o erro tratados. */
  async function receberArquivo(event, enviar) {
    const file = event.target.files?.[0]
    event.target.value = '' // permite reenviar o mesmo arquivo depois
    if (!file) return

    setIsUploading(true)
    setError('')
    try {
      await enviar(file)
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsUploading(false)
    }
  }

  const handleImageFile = (event) =>
    receberArquivo(event, async (file) => {
      const { width, height } = await medirImagem(file)
      const { image } = await uploadImage(`/api/projects/${id}/imagens`, file)
      // Posiciona no centro do que está visível no momento.
      const centro = centroVisivel()
      createElement(
        createImage(
          Math.round(centro.x - width / 2),
          Math.round(centro.y - height / 2),
          width,
          height,
          image.url,
          image.id,
        ),
      )
    })

  const handleCapaFile = (event) =>
    receberArquivo(event, async (file) => {
      const { capa } = await uploadImage(`/api/projects/${id}/capa`, file)
      setProject((current) => ({ ...current, capa }))
    })

  useEffect(() => {
    function handleKeyDown(event) {
      // Salvar vale de qualquer lugar, inclusive no meio da digitação — senão o
      // Ctrl+S cai no "salvar página" do navegador.
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
        return
      }

      if (somenteLeitura) return

      // O editor de texto do mapa é um contenteditable, não um campo: sem
      // essa guarda, Backspace nele apagaria o elemento inteiro.
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || event.target.isContentEditable) return
      // Com um diálogo aberto (compartilhar), Backspace num botão dele não
      // pode apagar o elemento selecionado atrás.
      if (event.target.closest?.('[role="dialog"]')) return

      if (event.key === 'Escape') {
        setPendingFrom(null)
        setTool(TOOLS.select)
        return
      }

      if (event.key === 'Delete' || event.key === 'Backspace') {
        if (selectedConnectionId) {
          event.preventDefault()
          deleteConnection(selectedConnectionId)
          return
        }
        if (selectedId) {
          event.preventDefault()
          deleteElement(selectedId)
          return
        }
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'd') {
        event.preventDefault()
        if (selectedId) duplicarElemento(selectedId)
        return
      }

      // Setas movem a seleção: 1px, ou 10px com Shift.
      const direcao = NUDGE[event.key]
      if (direcao && selectedId) {
        event.preventDefault()
        const passo = event.shiftKey ? 10 : 1
        moverElemento(selectedId, direcao[0] * passo, direcao[1] * passo)
        return
      }

      // Sem esta guarda, Ctrl+C trocaria a ferramenta em vez de copiar.
      if (event.ctrlKey || event.metaKey || event.altKey) return

      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()]
      if (shortcut) {
        setTool(shortcut)
        setPendingFrom(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [
    selectedId,
    selectedConnectionId,
    deleteElement,
    deleteConnection,
    duplicarElemento,
    moverElemento,
    save,
    somenteLeitura,
  ])

  const selected = elements.find((element) => element.id === selectedId) || null
  const selectedConnection = connections.find((item) => item.id === selectedConnectionId) || null
  const temTelas = elements.some(isScreen)
  const ehDono = !somenteLeitura && project?.papel !== 'colaborador'
  const autor = project?.autor_nome || project?.autor_email
  const voltar = somenteLeitura ? { to: '/', rotulo: '← Início' } : { to: '/editor', rotulo: '← Projetos' }

  function saveLabel() {
    if (isSaving) return 'Salvando...'
    if (isDirty) return 'Alterações não salvas'
    if (savedAt) return `Salvo às ${savedAt.toLocaleTimeString('pt-BR')}`
    return 'Salvo'
  }

  if (isLoading) {
    return (
      <div className="canvas-page">
        <p className="home-status">Carregando projeto...</p>
      </div>
    )
  }

  if (!project) {
    return (
      <div className="canvas-page">
        <p className="home-status home-status--error">{error || 'Projeto não encontrado.'}</p>
        <p>
          <Link to={voltar.to}>{somenteLeitura ? '← Voltar ao início' : '← Voltar aos projetos'}</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="canvas-page">
      <header className="canvas-header">
        <Link className="back-button canvas-back" to={voltar.to}>
          {voltar.rotulo}
        </Link>

        <div className="canvas-title">
          <h1>{project.titulo}</h1>
          {somenteLeitura ? (
            <span className="status-chip">Somente visualização</span>
          ) : (
            <span className={`status-chip status-chip--${project.status}`}>
              {project.status === 'publicado' ? 'Público' : 'Privado'}
            </span>
          )}
          {!somenteLeitura && !ehDono && <span className="status-chip">Colaborador</span>}
          {!ehDono && autor && <span className="canvas-save-state">de {autor}</span>}
          {!somenteLeitura && (
            <span className={`canvas-save-state${isDirty ? ' dirty' : ''}`}>{saveLabel()}</span>
          )}
        </div>

        <button
          className="text-button canvas-publish"
          type="button"
          onClick={() => setIsPlaying(true)}
          disabled={!temTelas}
          title={temTelas ? 'Simular a navegação do protótipo' : 'Crie uma tela para poder simular'}
        >
          ▶ Simular
        </button>

        {ehDono && (
          <>
            <button
              className="text-button canvas-publish"
              type="button"
              onClick={() => setIsSharing(true)}
              title="Gerar links de visualização ou de colaboração"
            >
              Compartilhar
            </button>

            <button
              className="text-button canvas-publish"
              type="button"
              onClick={toggleStatus}
              disabled={isPublishing}
              title={
                project.status === 'publicado'
                  ? 'Deixar de exibir o projeto na tela inicial'
                  : 'Publicar para que outros usuários possam ver'
              }
            >
              {isPublishing
                ? 'Alterando...'
                : project.status === 'publicado'
                  ? 'Tornar privado'
                  : 'Publicar'}
            </button>
          </>
        )}

        {!somenteLeitura && (
          <button className="primary-button canvas-save" type="button" onClick={() => save()} disabled={isSaving}>
            Salvar
          </button>
        )}
      </header>

      {error && <p className="home-status home-status--error canvas-error">{error}</p>}

      {conflito && (
        <div className="canvas-conflito" role="alert">
          <p>
            Outra pessoa salvou este projeto enquanto você editava. Recarregue para ver a versão dela (o que você
            não salvou se perde) ou sobrescreva com a sua.
          </p>
          <div className="canvas-conflito-acoes">
            <button className="text-button" type="button" onClick={recarregar}>
              Recarregar
            </button>
            <button className="text-button" type="button" onClick={() => save({ forcar: true })} disabled={isSaving}>
              Sobrescrever com a minha
            </button>
          </div>
        </div>
      )}

      <div className="canvas-body">
        <div className="canvas-viewport">
          <CanvasStage
            elements={elements}
            connections={connections}
            selectedId={selectedId}
            selectedConnectionId={selectedConnectionId}
            startScreenId={startScreenId}
            tool={tool}
            view={view}
            pendingFrom={pendingFrom}
            onViewChange={setView}
            onSelect={selectElement}
            onSelectConnection={selectConnection}
            onCreate={createElement}
            onUpdate={updateElement}
            onUpdateMany={updateElements}
            onConnectPick={handleConnectPick}
            onPointerCoords={coordsStore.set}
            onDropIcon={adicionarIcone}
            onTextSelection={textSelectionStore.set}
            readOnly={somenteLeitura}
          />

          {!somenteLeitura && (
            <>
          <div className="canvas-rail">
            <IconLibrary
              onAddIcon={adicionarIcone}
              aberta={painelIcones}
              onAbrir={() => setPainelIcones(true)}
              onFechar={() => setPainelIcones(false)}
            />

            <LayersPanel
              elements={elements}
              selectedId={selectedId}
              startScreenId={startScreenId}
              aberta={painelCamadas}
              onAbrir={() => setPainelCamadas(true)}
              onFechar={() => setPainelCamadas(false)}
              onSelect={selectElement}
              onUpdate={updateElement}
              onReorder={reordenarElemento}
              onDuplicate={duplicarElemento}
              onDelete={deleteElement}
              onFocus={focarElemento}
            />
          </div>

          <CanvasToolbar
            tool={tool}
            onToolChange={setTool}
            onAddImage={() => imagemInputRef.current?.click()}
            isUploading={isUploading}
          />

          <input
            ref={imagemInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={handleImageFile}
          />
          <input ref={capaInputRef} type="file" accept="image/*" hidden onChange={handleCapaFile} />

          {tool === TOOLS.connect && (
            <p className="canvas-hint">
              {pendingFrom
                ? 'Agora clique no destino: uma tela, um objeto dentro dela ou um objeto fora das telas (abre por cima).'
                : 'Clique no elemento de origem (um botão, forma ou tela).'}
            </p>
          )}
            </>
          )}

          <div className="canvas-status">
            <Coordenadas store={coordsStore} />
            <div className="canvas-zoom">
              <button
                type="button"
                onClick={() => setView((current) => ({ ...current, zoom: clampZoom(current.zoom / 1.2) }))}
                aria-label="Diminuir zoom"
              >
                −
              </button>
              <span>{Math.round(view.zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setView((current) => ({ ...current, zoom: clampZoom(current.zoom * 1.2) }))}
                aria-label="Aumentar zoom"
              >
                +
              </button>
              <button type="button" onClick={() => setView(DEFAULT_VIEW)}>
                Centralizar
              </button>
            </div>
          </div>
        </div>

        {!somenteLeitura && (
          <PropertiesPanel
            element={selected}
            connection={selectedConnection}
            elements={elements}
            textSelectionStore={textSelectionStore}
            isStartScreen={selected?.id === startScreenId}
            capa={project.capa}
            isUploading={isUploading}
            onChangeCapa={ehDono ? () => capaInputRef.current?.click() : null}
            onUpdate={updateElement}
            onDelete={deleteElement}
            onUpdateConnection={updateConnection}
            onDeleteConnection={deleteConnection}
            onSetStartScreen={setStartScreen}
          />
        )}
      </div>

      {isPlaying && (
        <PrototypePlayer
          elements={elements}
          connections={connections}
          startScreenId={startScreenId}
          onClose={() => setIsPlaying(false)}
        />
      )}

      {isSharing && <ShareDialog project={project} onClose={() => setIsSharing(false)} />}
    </div>
  )
}
