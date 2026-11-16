import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { apiRequest } from '../api.js'
import { TIPOS_DE_LINK, VALIDADES, formatarPrazo, urlDoConvite } from './share.js'


async function copiar(texto, campo) {
  try {
    await navigator.clipboard.writeText(texto)
    return true
  } catch {
    campo?.select()
    return false
  }
}

function GerarLink({ projectId, tipo, onGerado }) {
  const { titulo, explica } = TIPOS_DE_LINK[tipo]
  const [horas, setHoras] = useState(24)
  const [gerado, setGerado] = useState(null)
  const [isGerando, setIsGerando] = useState(false)
  const [copiado, setCopiado] = useState(false)
  const [erro, setErro] = useState('')
  const idValidade = `validade-${tipo}`

  async function gerar() {
    setIsGerando(true)
    setErro('')
    setCopiado(false)
    try {
      const { link } = await apiRequest(`/api/projects/${projectId}/links`, {
        method: 'POST',
        json: { tipo, horas },
      })
      setGerado(link)
      onGerado(link)
    } catch (requestError) {
      setErro(requestError.message)
    } finally {
      setIsGerando(false)
    }
  }

  const url = gerado ? urlDoConvite(gerado.token) : ''

  return (
    <section className="share-section" aria-labelledby={`titulo-${tipo}`}>
      <h3 id={`titulo-${tipo}`}>{titulo}</h3>
      <p className="share-hint">{explica}</p>

      <div className="share-row">
        <label className="share-validade" htmlFor={idValidade}>
          <span>Validade</span>
          <select id={idValidade} value={horas} onChange={(event) => setHoras(Number(event.target.value))}>
            {VALIDADES.map((validade) => (
              <option key={validade.horas} value={validade.horas}>
                {validade.rotulo}
              </option>
            ))}
          </select>
        </label>
        <button className="editor-card-open" type="button" onClick={gerar} disabled={isGerando}>
          {isGerando ? 'Gerando...' : gerado ? 'Gerar outro' : 'Gerar link'}
        </button>
      </div>

      {gerado && (
        <>
          <div className="share-link">
            <input
              id={`link-${tipo}`}
              type="text"
              readOnly
              value={url}
              aria-label={`${titulo} gerado`}
              onFocus={(event) => event.target.select()}
            />
            <button
              className="editor-card-open"
              type="button"
              onClick={async () => setCopiado(await copiar(url, document.getElementById(`link-${tipo}`)))}
            >
              {copiado ? 'Copiado!' : 'Copiar'}
            </button>
          </div>
          <p className="share-hint">
            Vence em {formatarPrazo(gerado.expira_em)}. Copie agora: por segurança, o link só aparece desta vez.
          </p>
        </>
      )}

      {erro && (
        <p className="feedback" role="status" data-type="error">
          {erro}
        </p>
      )}
    </section>
  )
}

/**
 * Compartilhar o projeto (RF-18): gera links de visualização e de colaboração,
 * lista os que ainda valem (para revogar) e quem colabora (para remover).
 * Só o dono abre este diálogo.
 */
export default function ShareDialog({ project, onClose }) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  useEffect(() => {
    apiRequest(`/api/projects/${project.id}/compartilhamento`)
      .then(setDados)
      .catch((requestError) => setErro(requestError.message))
  }, [project.id])

  useEffect(() => {
    function aoTeclar(event) {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', aoTeclar)
    return () => window.removeEventListener('keydown', aoTeclar)
  }, [onClose])

  function aoGerar(link) {
    const { token: _segredo, ...semSegredo } = link
    setDados((atual) => atual && { ...atual, links: [semSegredo, ...atual.links] })
  }

  async function remover(caminho, campo, id) {
    setErro('')
    try {
      await apiRequest(caminho, { method: 'DELETE' })
      setDados((atual) => ({ ...atual, [campo]: atual[campo].filter((item) => item.id !== id) }))
    } catch (requestError) {
      setErro(requestError.message)
    }
  }

  return createPortal(
    <div className="modal-overlay" role="dialog" aria-modal="true" aria-label="Compartilhar projeto">
      <div className="modal-card share-card">
        <h2>Compartilhar “{project.titulo}”</h2>
        <p className="share-hint">
          Os links não tornam o projeto público: ele continua fora da tela inicial, e só quem entrar com uma conta
          pelo link chega até ele.
        </p>

        <GerarLink projectId={project.id} tipo="visualizacao" onGerado={aoGerar} />
        <GerarLink projectId={project.id} tipo="colaboracao" onGerado={aoGerar} />

        {erro && (
          <p className="feedback" role="status" data-type="error">
            {erro}
          </p>
        )}

        {dados && (
          <>
            <section className="share-section" aria-labelledby="titulo-links-ativos">
              <h3 id="titulo-links-ativos">Links ativos</h3>
              {dados.links.length === 0 ? (
                <p className="share-hint">Nenhum link ativo.</p>
              ) : (
                <ul className="share-list">
                  {dados.links.map((link) => (
                    <li key={link.id}>
                      <span>
                        {TIPOS_DE_LINK[link.tipo]?.rotulo || link.tipo}
                        <small>vence em {formatarPrazo(link.expira_em)}</small>
                      </span>
                      <button
                        className="editor-card-open"
                        type="button"
                        aria-label={`Revogar link de ${TIPOS_DE_LINK[link.tipo]?.rotulo.toLowerCase()} que vence em ${formatarPrazo(link.expira_em)}`}
                        onClick={() => remover(`/api/projects/${project.id}/links/${link.id}`, 'links', link.id)}
                      >
                        Revogar
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="share-section" aria-labelledby="titulo-colaboradores">
              <h3 id="titulo-colaboradores">Colaboradores</h3>
              {dados.colaboradores.length === 0 ? (
                <p className="share-hint">Ninguém colabora neste projeto ainda.</p>
              ) : (
                <ul className="share-list">
                  {dados.colaboradores.map((pessoa) => (
                    <li key={pessoa.id}>
                      <span>
                        {pessoa.nome || pessoa.email}
                        {pessoa.nome && <small>{pessoa.email}</small>}
                      </span>
                      <button
                        className="editor-card-open"
                        type="button"
                        aria-label={`Remover ${pessoa.nome || pessoa.email} do projeto`}
                        onClick={() =>
                          remover(`/api/projects/${project.id}/colaboradores/${pessoa.id}`, 'colaboradores', pessoa.id)
                        }
                      >
                        Remover
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <div className="modal-actions">
          <button className="text-button" type="button" onClick={onClose}>
            Fechar
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
