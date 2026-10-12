import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

/** Tempo mínimo com os termos abertos antes de o aceite ser liberado. */
export const MIN_READ_MS = 5000

/**
 * Modal dos Termos de Uso.
 *
 * Com `onAccept`, o botão "Aceitar" só libera depois de `MIN_READ_MS` com o
 * modal aberto **e a aba visível** — trocar de aba não conta como leitura.
 * Fechar antes disso zera o contador: ele vale por abertura, como o requisito
 * pede ("5 segundos com os termos abertos"). Sem `onAccept` é só leitura
 * (página da conta).
 *
 * Vai para o `body` por portal: o `.auth-card` tem `transform`, e um ancestral
 * com transform vira o bloco de contenção do `position: fixed` — o véu ficaria
 * preso dentro do cartão.
 */
export default function TermsDialog({ terms, onAccept, onClose }) {
  const [elapsed, setElapsed] = useState(0)
  const closeRef = useRef(null)
  const onCloseRef = useRef(onClose)
  const canAccept = elapsed >= MIN_READ_MS
  const readOnly = !onAccept

  useEffect(() => {
    if (readOnly) return undefined
    let last = performance.now()
    const timer = setInterval(() => {
      const now = performance.now()
      if (document.visibilityState === 'visible') {
        setElapsed((current) => Math.min(MIN_READ_MS, current + (now - last)))
      }
      last = now
    }, 200)
    return () => clearInterval(timer)
  }, [readOnly])

  useEffect(() => {
    onCloseRef.current = onClose
  }, [onClose])

  useEffect(() => {
    closeRef.current?.focus()
    function handleKey(event) {
      if (event.key === 'Escape') onCloseRef.current()
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
  }, [])

  const remaining = Math.ceil((MIN_READ_MS - elapsed) / 1000)

  return createPortal(
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="terms-title"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose()
      }}
    >
      <div className="modal-card terms-card">
        <header className="terms-header">
          <h2 id="terms-title">{terms.titulo}</h2>
          <p className="terms-meta">
            Versão {terms.versao} · vigente desde {formatDate(terms.vigenciaDesde)}
          </p>
        </header>

        <div className="terms-body" tabIndex={0}>
          {terms.secoes.map((secao) => (
            <section key={secao.titulo}>
              <h3>{secao.titulo}</h3>
              {secao.paragrafos.map((paragrafo) => (
                <p key={paragrafo}>{paragrafo}</p>
              ))}
            </section>
          ))}
        </div>

        <div className="modal-actions terms-actions">
          <button ref={closeRef} className="text-button" type="button" onClick={onClose}>
            {onAccept ? 'Cancelar' : 'Fechar'}
          </button>
          {onAccept && (
            <button
              className="primary-button terms-accept"
              type="button"
              disabled={!canAccept}
              onClick={onAccept}
            >
              {canAccept ? 'Li e aceito' : `Leia os termos (${remaining}s)`}
            </button>
          )}
        </div>
        {onAccept && (
          <div
            className="terms-progress"
            role="progressbar"
            aria-label="Tempo mínimo de leitura"
            aria-valuemin={0}
            aria-valuemax={MIN_READ_MS}
            aria-valuenow={Math.round(elapsed)}
          >
            <span style={{ width: `${(elapsed / MIN_READ_MS) * 100}%` }} />
          </div>
        )}
      </div>
    </div>,
    document.body,
  )
}

/** `2026-10-11` (data pura, sem fuso) → `11/10/2026`. */
function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-')
  return `${day}/${month}/${year}`
}
