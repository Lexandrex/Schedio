import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiRequest } from '../api.js'
import { formatarPrazo } from '../canvas/share.js'
import CanvasPage from './CanvasPage.jsx'

/**
 * `/convite/:token` — destino dos links de compartilhamento (RF-18).
 *
 * Link de visualização abre o canvas direto, só para ver (RN-19). Link de
 * colaboração mostra o convite: só quem aceita passa a editar (RN-18), e o
 * acesso fica mesmo depois de o link vencer.
 */
export default function ConvitePage() {
  const { token } = useParams()
  const navigate = useNavigate()
  const [convite, setConvite] = useState(null)
  const [erro, setErro] = useState('')
  const [isAceitando, setIsAceitando] = useState(false)

  useEffect(() => {
    apiRequest(`/api/convites/${token}`)
      .then((data) => setConvite(data.convite))
      .catch((requestError) => setErro(requestError.message))
  }, [token])

  // Objeto estável: o CanvasPage o tem como dependência ao carregar.
  const visualizacao = useMemo(
    () => (convite?.tipo === 'visualizacao' ? { token, convite } : null),
    [token, convite],
  )

  async function aceitar() {
    setIsAceitando(true)
    setErro('')
    try {
      const { projeto } = await apiRequest(`/api/convites/${token}/aceitar`, { method: 'POST' })
      navigate(`/editor/${projeto.id}`)
    } catch (requestError) {
      setErro(requestError.message)
      setIsAceitando(false)
    }
  }

  if (visualizacao) return <CanvasPage visualizacao={visualizacao} />

  const projeto = convite?.projeto

  return (
    <main className="convite-page">
      <div className="modal-card convite-card">
        {!convite && !erro && <p className="share-hint">Abrindo o convite...</p>}

        {convite && (
          <>
            <h1>Convite para colaborar</h1>
            <p>
              {projeto.autor_nome ? <strong>{projeto.autor_nome}</strong> : 'O dono do projeto'} convidou você para
              editar <strong>“{projeto.titulo}”</strong>.
            </p>
            {convite.jaPodeEditar ? (
              <p className="share-hint">Você já pode editar este projeto.</p>
            ) : (
              <p className="share-hint">
                Ao aceitar, o projeto aparece em “Compartilhados comigo” no seu editor e você passa a editar o canvas
                junto com o dono. O convite vale até {formatarPrazo(convite.expira_em)}.
              </p>
            )}
          </>
        )}

        {erro && (
          <p className="feedback" role="status" data-type="error">
            {erro}
          </p>
        )}

        <div className="modal-actions">
          <Link className="text-button" to="/">
            {convite && !convite.jaPodeEditar ? 'Agora não' : 'Ir para o início'}
          </Link>
          {convite &&
            (convite.jaPodeEditar ? (
              <Link className="primary-button convite-acao" to={`/editor/${projeto.id}`}>
                Abrir no editor
              </Link>
            ) : (
              <button className="primary-button convite-acao" type="button" onClick={aceitar} disabled={isAceitando}>
                {isAceitando ? 'Aceitando...' : 'Aceitar e abrir'}
              </button>
            ))}
        </div>
      </div>
    </main>
  )
}
