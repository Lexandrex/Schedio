import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import CanvasStage from '../canvas/CanvasStage.jsx'
import CanvasToolbar from '../canvas/CanvasToolbar.jsx'
import PropertiesPanel from '../canvas/PropertiesPanel.jsx'
import { TOOLS } from '../canvas/elements.js'

const AUTOSAVE_MS = 10000

const TOOL_SHORTCUTS = {
  v: TOOLS.select,
  r: TOOLS.rect,
  e: TOOLS.ellipse,
  t: TOOLS.text,
}

export default function CanvasPage() {
  const { id } = useParams()

  const [project, setProject] = useState(null)
  const [elements, setElements] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState('')

  const [tool, setTool] = useState(TOOLS.select)
  const [selectedId, setSelectedId] = useState(null)
  const [view, setView] = useState({ x: 240, y: 160, zoom: 1 })
  const [coords, setCoords] = useState({ x: 0, y: 0 })

  const [isDirty, setIsDirty] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isPublishing, setIsPublishing] = useState(false)
  const [savedAt, setSavedAt] = useState(null)

  const elementsRef = useRef(elements)
  const dirtyRef = useRef(false)

  useEffect(() => {
    elementsRef.current = elements
  }, [elements])

  useEffect(() => {
    dirtyRef.current = isDirty
  }, [isDirty])

  useEffect(() => {
    apiRequest(`/api/projects/${id}`)
      .then((data) => {
        setProject(data.project)
        setElements(data.project.conteudo?.elements || [])
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
        body: JSON.stringify({ conteudo: { version: 1, elements: elementsRef.current } }),
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

  const createElement = useCallback((element) => {
    setElements((current) => [...current, element])
    setSelectedId(element.id)
    setTool(TOOLS.select)
    setIsDirty(true)
  }, [])

  const deleteElement = useCallback((elementId) => {
    setElements((current) => current.filter((element) => element.id !== elementId))
    setSelectedId((current) => (current === elementId ? null : current))
    setIsDirty(true)
  }, [])

  useEffect(() => {
    function handleKeyDown(event) {
      const tag = event.target.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return

      if ((event.key === 'Delete' || event.key === 'Backspace') && selectedId) {
        event.preventDefault()
        deleteElement(selectedId)
        return
      }

      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
        event.preventDefault()
        save()
        return
      }

      const shortcut = TOOL_SHORTCUTS[event.key.toLowerCase()]
      if (shortcut) setTool(shortcut)
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedId, deleteElement, save])

  const selected = elements.find((element) => element.id === selectedId) || null

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
            selectedId={selectedId}
            tool={tool}
            view={view}
            onViewChange={setView}
            onSelect={setSelectedId}
            onCreate={createElement}
            onUpdate={updateElement}
            onPointerCoords={setCoords}
          />

          <CanvasToolbar tool={tool} onToolChange={setTool} />

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

        <PropertiesPanel element={selected} onUpdate={updateElement} onDelete={deleteElement} />
      </div>
    </div>
  )
}
