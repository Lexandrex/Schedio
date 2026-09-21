import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import CanvasStage from '../canvas/CanvasStage.jsx'
import CanvasToolbar from '../canvas/CanvasToolbar.jsx'
import PropertiesPanel from '../canvas/PropertiesPanel.jsx'
import PrototypePlayer from '../canvas/PrototypePlayer.jsx'
import IconLibrary from '../canvas/IconLibrary.jsx'
import { ICON_DEFAULT_SIZE } from '../canvas/iconLibrary.js'
import { TOOLS, createIcon, createImage, isScreen, screensOf } from '../canvas/elements.js'
import { createConnection, pruneConnections } from '../canvas/connections.js'

const AUTOSAVE_MS = 10000

const TOOL_SHORTCUTS = {
  v: TOOLS.select,
  f: TOOLS.screen,
  r: TOOLS.rect,
  e: TOOLS.ellipse,
  t: TOOLS.text,
  c: TOOLS.connect,
}

export default function CanvasPage() {
  const { id } = useParams()

  const [project, setProject] = useState(null)
  const [elements, setElements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [connections, setConnections] = useState([])
  const [startScreenId, setStartScreenId] = useState(null)

  const [tool, setTool] = useState(TOOLS.select)
  const [selectedId, setSelectedId] = useState(null)
  const [selectedConnectionId, setSelectedConnectionId] = useState(null)
  const [pendingFrom, setPendingFrom] = useState(null)
  const [isPlaying, setIsPlaying] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const imagemInputRef = useRef(null)
  const capaInputRef = useRef(null)
  const [view, setView] = useState({ x: 240, y: 160, zoom: 1 })
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const elementsRef = useRef(elements)
  const connectionsRef = useRef(connections)
  const startScreenRef = useRef(startScreenId)
  const dirtyRef = useRef(false)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  useEffect(() => {
    connectionsRef.current = connections
  }, [connections])

  useEffect(() => {
    startScreenRef.current = startScreenId
  }, [startScreenId])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    apiRequest(`/api/projects/${id}`)
      .then((data) => {
        const conteudo = data.project.conteudo || {}
        setProject(data.project)
        setElements(conteudo.elements || [])
        // Documentos da versão 1 não têm ligações; o editor segue funcionando com eles.
        setConnections(conteudo.connections || [])
        setStartScreenId(conteudo.startScreen || null)
      })
      .catch((requestError) => setError(requestError.message))
      .finally(() => setIsLoading(false))
  }, [id])

  const save = useCallback(async () => {
    setIsSaving(true)
    try {
      await apiRequest(`/api/projects/${id}/conteudo`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conteudo: {
            version: 2,
            elements: elementsRef.current,
            connections: connectionsRef.current,
            startScreen: startScreenRef.current,
          },
        }),
      })
      setIsDirty(false)
      setSavedAt(new Date())
      setError('')
      return true
    } catch (requestError) {
      setError(requestError.message)
      return false
    } finally {
      setIsSaving(false)
    }
  }, [id])

  const toggleStatus = useCallback(async () => {
    const status = project?.status === 'publicado' ? 'privado' : 'publicado'
    setIsPublishing(true)

    try {
      // Publica sempre o que está salvo: grava as alterações pendentes antes.
      if (dirtyRef.current && !(await save())) return

      const data = await apiRequest(`/api/projects/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
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
      if (dirtyRef.current) save()
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

      const alvo = elementsRef.current.find((element) => element.id === elementId)
      if (!alvo || !isScreen(alvo)) {
        setError('A ligação precisa terminar em uma tela. Selecione uma tela como destino.')
        return
      }

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
    const viewport = document.querySelector('.canvas-viewport')
    return {
      x: ((viewport?.clientWidth || 800) / 2 - view.x) / view.zoom,
      y: ((viewport?.clientHeight || 600) / 2 - view.y) / view.zoom,
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

  async function handleImageFile(event) {
    const file = event.target.files?.[0]
    event.target.value = '' // permite reenviar o mesmo arquivo depois
    if (!file) return

    setIsUploading(true)
    setError('')

    try {
      const { width, height } = await medirImagem(file)
      const form = new FormData()
      form.append('imagem', file)

      // Sem Content-Type manual: o browser precisa definir o boundary do multipart.
      const data = await apiRequest(`/api/projects/${id}/imagens`, { method: 'POST', body: form })

      // Posiciona no centro do que está visível no momento.
      const viewport = document.querySelector('.canvas-viewport')
      const centroX = ((viewport?.clientWidth || 800) / 2 - view.x) / view.zoom
      const centroY = ((viewport?.clientHeight || 600) / 2 - view.y) / view.zoom

      createElement(
        createImage(
          Math.round(centroX - width / 2),
          Math.round(centroY - height / 2),
          width,
          height,
          data.image.url,
          data.image.id,
        ),
      )
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsUploading(false)
    }
  }

  async function handleCapaFile(event) {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return

    setIsUploading(true)
    setError('')

    try {
      const form = new FormData()
      form.append('imagem', file)
      const data = await apiRequest(`/api/projects/${id}/capa`, { method: 'POST', body: form })
      setProject((current) => ({ ...current, capa: data.capa }))
    } catch (requestError) {
      setError(requestError.message)
    } finally {
      setIsUploading(false)
    }
  }

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

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

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
        return
      }

      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()]
      if (shortcut) {
        setTool(shortcut)
        setPendingFrom(null)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, selectedConnectionId, deleteElement, deleteConnection, save])

  const selected = elements.find((element) => element.id === selectedId) || null
  const selectedConnection = connections.find((item) => item.id === selectedConnectionId) || null
  const temTelas = elements.some(isScreen)

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
          <Link to="/editor">← Voltar aos projetos</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="canvas-page">
      <header className="canvas-header">
        <Link className="back-button canvas-back" to="/editor">
          ← Projetos
        </Link>

        <div className="canvas-title">
          <h1>{project.titulo}</h1>
          <span className={`status-chip status-chip--${project.status}`}>
            {project.status === 'publicado' ? 'Público' : 'Privado'}
          </span>
          <span className={`canvas-save-state${isDirty ? ' dirty' : ''}`}>{saveLabel()}</span>
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

        <button className="primary-button canvas-save" type="button" onClick={save} disabled={isSaving}>
          Salvar
        </button>
      </header>

      {error && <p className="home-status home-status--error canvas-error">{error}</p>}

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
            onPointerCoords={setCoords}
            onDropIcon={adicionarIcone}
          />

          <IconLibrary onAddIcon={adicionarIcone} />

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
                ? 'Agora clique na tela de destino.'
                : 'Clique no elemento de origem (um botão, forma ou tela).'}
            </p>
          )}

          <div className="canvas-status">
            <span>
              X {Math.round(coords.x)} · Y {Math.round(coords.y)}
            </span>
            <div className="canvas-zoom">
              <button
                type="button"
                onClick={() => setView((current) => ({ ...current, zoom: Math.max(0.15, current.zoom / 1.2) }))}
                aria-label="Diminuir zoom"
              >
                −
              </button>
              <span>{Math.round(view.zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setView((current) => ({ ...current, zoom: Math.min(4, current.zoom * 1.2) }))}
                aria-label="Aumentar zoom"
              >
                +
              </button>
              <button type="button" onClick={() => setView({ x: 240, y: 160, zoom: 1 })}>
                Centralizar
              </button>
            </div>
          </div>
        </div>

        <PropertiesPanel
          element={selected}
          connection={selectedConnection}
          elements={elements}
          isStartScreen={selected?.id === startScreenId}
          capa={project.capa}
          isUploading={isUploading}
          onChangeCapa={() => capaInputRef.current?.click()}
          onUpdate={updateElement}
          onDelete={deleteElement}
          onUpdateConnection={updateConnection}
          onDeleteConnection={deleteConnection}
          onSetStartScreen={setStartScreen}
        />
      </div>

      {isPlaying && (
        <PrototypePlayer
          elements={elements}
          connections={connections}
          startScreenId={startScreenId}
          onClose={() => setIsPlaying(false)}
        />
      )}
    </div>
  )
}
