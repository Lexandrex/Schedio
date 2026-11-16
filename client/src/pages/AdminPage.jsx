import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { apiRequest } from '../api.js'
import AccountMenu from '../components/AccountMenu.jsx'
import { useAuth } from '../context/AuthContext.jsx'

/*
 * Administração (RN-15). Só abre para administradores — e quem decide é o
 * servidor: toda rota de /api/admin responde 403 a quem não é. Aqui a
 * checagem só evita mostrar uma tela que não funcionaria.
 *
 * Quatro abas, cada uma carrega o que precisa ao ser aberta (trocar de aba
 * recarrega, então a conta recém-excluída já aparece em "Contas excluídas").
 */

const ABAS = [
  { id: 'denuncias', rotulo: 'Denúncias' },
  { id: 'contas', rotulo: 'Contas' },
  { id: 'admins', rotulo: 'Administradores' },
  { id: 'excluidas', rotulo: 'Contas excluídas' },
]

const data = (valor) => new Date(valor).toLocaleDateString('pt-BR')
const nomeDe = (pessoa) => pessoa.nome || pessoa.email
const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`

/** Carrega `caminho` ao montar; `recarregar` busca de novo. */
function useDados(caminho) {
  const [dados, setDados] = useState(null)
  const [erro, setErro] = useState('')

  const recarregar = useCallback(() => {
    apiRequest(caminho)
      .then((resposta) => {
        setDados(resposta)
        setErro('')
      })
      .catch((requestError) => setErro(requestError.message))
  }, [caminho])

  useEffect(recarregar, [recarregar])
  return { dados, setDados, erro, recarregar }
}

/** Mensagem do resultado da última ação da aba. */
function Retorno({ retorno }) {
  if (!retorno?.mensagem) return null
  return (
    <p className="feedback admin-feedback" role="status" data-type={retorno.tipo}>
      {retorno.mensagem}
    </p>
  )
}

/**
 * Confirmação de uma exclusão, com o motivo opcional que vai no aviso ao
 * autor. `onConfirmar(motivo)` faz o pedido; se falhar, o erro fica aqui.
 */
function ConfirmarExclusao({ rotulo, explicacao, acao, onConfirmar, onCancelar }) {
  const [motivo, setMotivo] = useState('')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  async function confirmar() {
    setEnviando(true)
    setErro('')
    try {
      await onConfirmar(motivo.trim())
    } catch (requestError) {
      setErro(requestError.message)
      setEnviando(false)
    }
  }

  return (
    <div className="admin-confirm" role="alertdialog" aria-label={rotulo}>
      <p>{explicacao}</p>
      <label>
        <span>Motivo (opcional, vai no aviso)</span>
        <textarea
          className="bio-textarea"
          maxLength={500}
          value={motivo}
          onChange={(event) => setMotivo(event.target.value)}
          placeholder="Ex.: discurso de ódio, conteúdo copiado..."
        />
      </label>
      {erro && (
        <p className="feedback" role="status" data-type="error">
          {erro}
        </p>
      )}
      <div className="trash-confirm-actions">
        <button className="text-button" type="button" onClick={onCancelar}>
          Cancelar
        </button>
        <button className="danger-button" type="button" onClick={confirmar} disabled={enviando}>
          {enviando ? 'Excluindo...' : acao}
        </button>
      </div>
    </div>
  )
}

const RETENCAO =
  'A conta sai da plataforma na hora. Pelos Termos, uma cópia fica guardada por 6 meses e pode ser restaurada na aba "Contas excluídas". A pessoa é avisada por e-mail.'

/** Por que este administrador não pode excluir esta conta (ou null, se pode). */
function bloqueioDeExclusao(alvo, eu) {
  if (alvo.id === eu.id) return 'Para excluir a sua própria conta, use a página da conta.'
  if (alvo.dono) return 'A conta do dono da plataforma não pode ser excluída.'
  if (alvo.admin && !eu.dono) return 'Só o dono da plataforma exclui a conta de outro administrador.'
  return null
}

function BotaoExcluirConta({ alvo, eu, onClick }) {
  const bloqueio = bloqueioDeExclusao(alvo, eu)
  return (
    <button
      className="editor-card-open admin-perigo"
      type="button"
      disabled={Boolean(bloqueio)}
      title={bloqueio || `Excluir a conta de ${nomeDe(alvo)}`}
      onClick={onClick}
    >
      Excluir conta
    </button>
  )
}

const excluirConta = (alvo, motivo) =>
  apiRequest(`/api/admin/usuarios/${alvo.id}`, { method: 'DELETE', json: { motivo } })

function AbaDenuncias({ eu }) {
  const { dados, setDados, erro } = useDados('/api/admin/denuncias')
  const [confirmando, setConfirmando] = useState(null) // { tipo: 'obra' | 'conta', id }
  const [retorno, setRetorno] = useState(null)

  const tirar = (campo, id) =>
    setDados((atual) => ({ ...atual, [campo]: atual[campo].filter((item) => item.id !== id) }))

  async function excluirObra(obra, motivo) {
    await apiRequest(`/api/admin/projetos/${obra.id}`, { method: 'DELETE', json: { motivo } })
    tirar('projects', obra.id)
    // O autor, se também está entre os denunciados, fica com um projeto a menos.
    setDados((atual) => ({
      ...atual,
      creators: atual.creators.map((criador) =>
        criador.id === obra.autor_id ? { ...criador, projetos: Math.max(criador.projetos - 1, 0) } : criador,
      ),
    }))
    setConfirmando(null)
    setRetorno({ tipo: 'success', mensagem: `"${obra.titulo}" foi excluída. ${nomeDe({ nome: obra.autor_nome, email: obra.autor_email })} foi avisado(a).` })
  }

  async function excluirCriador(criador, motivo) {
    await excluirConta(criador, motivo)
    tirar('creators', criador.id)
    // As obras dele saíram junto.
    setDados((atual) => ({ ...atual, projects: atual.projects.filter((obra) => obra.autor_id !== criador.id) }))
    setConfirmando(null)
    setRetorno({ tipo: 'success', mensagem: `A conta de ${nomeDe(criador)} foi excluída.` })
  }

  if (erro) return <p className="home-status home-status--error">{erro}</p>
  if (!dados) return <p className="home-status">Carregando denúncias...</p>

  return (
    <>
      <Retorno retorno={retorno} />

      <section className="admin-section" aria-labelledby="admin-obras">
        <h2 id="admin-obras">Obras denunciadas</h2>
        {dados.projects.length === 0 ? (
          <p className="share-hint">Nenhuma obra denunciada.</p>
        ) : (
          <ul className="admin-list">
            {dados.projects.map((obra) => (
              <li key={obra.id}>
                <div className="admin-row">
                  <span className="admin-count" aria-label={plural(obra.denuncias, 'denúncia', 'denúncias')}>
                    {obra.denuncias}
                  </span>
                  <div className="admin-row-info">
                    <Link to={`/projeto/${obra.id}`}>{obra.titulo}</Link>
                    <small>
                      de {nomeDe({ nome: obra.autor_nome, email: obra.autor_email })} ·{' '}
                      {obra.status === 'publicado' ? 'Pública' : 'Privada'}
                    </small>
                  </div>
                  <button
                    className="editor-card-open admin-perigo"
                    type="button"
                    onClick={() => setConfirmando({ tipo: 'obra', id: obra.id })}
                  >
                    Excluir obra
                  </button>
                </div>
                {confirmando?.tipo === 'obra' && confirmando.id === obra.id && (
                  <ConfirmarExclusao
                    rotulo={`Excluir ${obra.titulo}`}
                    explicacao={`Excluir "${obra.titulo}" por má conduta? Não dá para desfazer. O autor recebe um aviso dizendo que a história foi excluída por má conduta.`}
                    acao="Excluir por má conduta"
                    onConfirmar={(motivo) => excluirObra(obra, motivo)}
                    onCancelar={() => setConfirmando(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section" aria-labelledby="admin-criadores">
        <h2 id="admin-criadores">Criadores denunciados</h2>
        {dados.creators.length === 0 ? (
          <p className="share-hint">Nenhum criador denunciado.</p>
        ) : (
          <ul className="admin-list">
            {dados.creators.map((criador) => (
              <li key={criador.id}>
                <div className="admin-row">
                  <span className="admin-count" aria-label={plural(criador.denuncias, 'denúncia', 'denúncias')}>
                    {criador.denuncias}
                  </span>
                  <div className="admin-row-info">
                    <Link to={`/perfil/${criador.id}`}>{nomeDe(criador)}</Link>
                    <small>
                      {criador.email} · {plural(criador.projetos, 'projeto', 'projetos')}
                    </small>
                  </div>
                  <BotaoExcluirConta
                    alvo={criador}
                    eu={eu}
                    onClick={() => setConfirmando({ tipo: 'conta', id: criador.id })}
                  />
                </div>
                {confirmando?.tipo === 'conta' && confirmando.id === criador.id && (
                  <ConfirmarExclusao
                    rotulo={`Excluir a conta de ${nomeDe(criador)}`}
                    explicacao={`Excluir a conta de ${nomeDe(criador)} por má conduta? ${RETENCAO}`}
                    acao="Excluir conta"
                    onConfirmar={(motivo) => excluirCriador(criador, motivo)}
                    onCancelar={() => setConfirmando(null)}
                  />
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

function AbaContas({ eu }) {
  const [email, setEmail] = useState('')
  const [achado, setAchado] = useState(null)
  const [confirmando, setConfirmando] = useState(false)
  const [retorno, setRetorno] = useState(null)

  async function buscar(event) {
    event.preventDefault()
    setAchado(null)
    setConfirmando(false)
    setRetorno(null)
    try {
      const { usuario } = await apiRequest(`/api/admin/usuarios?email=${encodeURIComponent(email.trim())}`)
      setAchado(usuario)
    } catch (requestError) {
      setRetorno({ tipo: 'error', mensagem: requestError.message })
    }
  }

  async function excluir(motivo) {
    await excluirConta(achado, motivo)
    setRetorno({ tipo: 'success', mensagem: `A conta de ${nomeDe(achado)} foi excluída.` })
    setAchado(null)
    setConfirmando(false)
    setEmail('')
  }

  return (
    <section className="admin-section" aria-labelledby="admin-contas">
      <h2 id="admin-contas">Excluir uma conta</h2>
      <p className="share-hint">{RETENCAO}</p>

      <form className="admin-form" onSubmit={buscar}>
        <label>
          <span>E-mail da conta</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="primary-button" type="submit">
          Buscar
        </button>
      </form>

      <Retorno retorno={retorno} />

      {achado && (
        <ul className="admin-list">
          <li>
            <div className="admin-row">
              <span className="admin-count" aria-label={plural(achado.denuncias, 'denúncia', 'denúncias')}>
                {achado.denuncias}
              </span>
              <div className="admin-row-info">
                <Link to={`/perfil/${achado.id}`}>{nomeDe(achado)}</Link>
                <small>
                  {achado.email} · {plural(achado.projetos, 'projeto', 'projetos')}
                  {achado.dono ? ' · Dono' : achado.admin ? ' · Administrador' : ''}
                </small>
              </div>
              <BotaoExcluirConta alvo={achado} eu={eu} onClick={() => setConfirmando(true)} />
            </div>
            {confirmando && (
              <ConfirmarExclusao
                rotulo={`Excluir a conta de ${nomeDe(achado)}`}
                explicacao={`Excluir a conta de ${nomeDe(achado)} por má conduta, com ${plural(achado.projetos, 'projeto', 'projetos')}? ${RETENCAO}`}
                acao="Excluir conta"
                onConfirmar={excluir}
                onCancelar={() => setConfirmando(false)}
              />
            )}
          </li>
        </ul>
      )}
    </section>
  )
}

function AbaAdmins({ eu, onPerdiAcesso }) {
  const { dados, setDados, erro } = useDados('/api/admin/admins')
  const [email, setEmail] = useState('')
  const [revogando, setRevogando] = useState(null)
  const [retorno, setRetorno] = useState(null)

  async function conceder(event) {
    event.preventDefault()
    setRetorno(null)
    try {
      const { admin } = await apiRequest('/api/admin/admins', { method: 'POST', json: { email: email.trim() } })
      setDados((atual) => ({
        admins: [...atual.admins.filter((item) => item.id !== admin.id), admin],
      }))
      setRetorno({ tipo: 'success', mensagem: `${nomeDe(admin)} agora é administrador(a).` })
      setEmail('')
    } catch (requestError) {
      setRetorno({ tipo: 'error', mensagem: requestError.message })
    }
  }

  async function revogar(admin) {
    // Primeiro clique pede confirmação.
    if (revogando !== admin.id) {
      setRevogando(admin.id)
      return
    }
    setRetorno(null)
    try {
      await apiRequest(`/api/admin/admins/${admin.id}`, { method: 'DELETE' })
      setDados((atual) => ({ admins: atual.admins.filter((item) => item.id !== admin.id) }))
      setRetorno({ tipo: 'success', mensagem: `${nomeDe(admin)} não é mais administrador(a).` })
      if (admin.id === eu.id) onPerdiAcesso()
    } catch (requestError) {
      setRetorno({ tipo: 'error', mensagem: requestError.message })
    } finally {
      setRevogando(null)
    }
  }

  return (
    <section className="admin-section" aria-labelledby="admin-admins">
      <h2 id="admin-admins">Administradores</h2>
      <p className="share-hint">
        Administradores avaliam denúncias e excluem obras e contas. O dono da plataforma nunca perde o acesso.
      </p>

      <form className="admin-form" onSubmit={conceder}>
        <label>
          <span>E-mail da conta</span>
          <input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} />
        </label>
        <button className="primary-button" type="submit">
          Conceder acesso
        </button>
      </form>

      <Retorno retorno={retorno} />
      {erro && <p className="home-status home-status--error">{erro}</p>}

      {dados && (
        <ul className="admin-list">
          {dados.admins.map((admin) => (
            <li key={admin.id}>
              <div className="admin-row">
                <div className="admin-row-info">
                  <span>
                    {nomeDe(admin)}
                    {admin.id === eu.id && ' (você)'}
                  </span>
                  <small>
                    {admin.email} · {admin.dono ? 'Dono da plataforma' : `desde ${data(admin.admin_desde)}`}
                  </small>
                </div>
                <button
                  className="editor-card-open"
                  type="button"
                  disabled={admin.dono}
                  title={admin.dono ? 'O dono da plataforma não perde o acesso de administrador.' : undefined}
                  aria-label={`Revogar o acesso de ${nomeDe(admin)}`}
                  onClick={() => revogar(admin)}
                >
                  {revogando === admin.id ? 'Confirmar' : 'Revogar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function AbaExcluidas() {
  const { dados, setDados, erro } = useDados('/api/admin/contas-excluidas')
  const [restaurando, setRestaurando] = useState(null)
  const [retorno, setRetorno] = useState(null)

  async function restaurar(conta) {
    setRestaurando(conta.id)
    setRetorno(null)
    try {
      const { projetos } = await apiRequest(`/api/admin/contas-excluidas/${conta.id}/restaurar`, { method: 'POST' })
      setDados((atual) => ({ contas: atual.contas.filter((item) => item.id !== conta.id) }))
      setRetorno({
        tipo: 'success',
        mensagem: `A conta de ${nomeDe(conta)} foi restaurada, com ${plural(projetos, 'projeto', 'projetos')}.`,
      })
    } catch (requestError) {
      setRetorno({ tipo: 'error', mensagem: requestError.message })
    } finally {
      setRestaurando(null)
    }
  }

  return (
    <section className="admin-section" aria-labelledby="admin-excluidas">
      <h2 id="admin-excluidas">Contas excluídas</h2>
      <p className="share-hint">
        Cópias guardadas pelo prazo dos Termos de Uso. Só as contas encerradas por um administrador podem ser
        restauradas: a que a própria pessoa excluiu, pelos Termos, não pode ser reativada.
      </p>

      <Retorno retorno={retorno} />
      {erro && <p className="home-status home-status--error">{erro}</p>}
      {!dados && !erro && <p className="home-status">Carregando contas excluídas...</p>}
      {dados?.contas.length === 0 && <p className="share-hint">Nenhuma conta excluída no prazo de guarda.</p>}

      {dados?.contas.length > 0 && (
        <ul className="admin-list">
          {dados.contas.map((conta) => (
            <li key={conta.id}>
              <div className="admin-row">
                <div className="admin-row-info">
                  <span>{nomeDe(conta)}</span>
                  <small>
                    {conta.email} · excluída em {data(conta.excluida_em)}{' '}
                    {conta.excluida_por
                      ? `por ${conta.excluida_por_nome || conta.excluida_por_email || 'um administrador'}`
                      : 'pela própria pessoa'}{' '}
                    · {plural(conta.projetos, 'projeto', 'projetos')} · guardada até {data(conta.expira_em)}
                  </small>
                  {conta.motivo && <small>Motivo: {conta.motivo}</small>}
                </div>
                <button
                  className="editor-card-open"
                  type="button"
                  disabled={!conta.restauravel || restaurando === conta.id}
                  title={
                    conta.restauravel
                      ? 'Recriar a conta com os projetos dela'
                      : 'Excluída pela própria pessoa: pelos Termos, não pode ser reativada.'
                  }
                  aria-label={`Restaurar a conta de ${nomeDe(conta)}`}
                  onClick={() => restaurar(conta)}
                >
                  {restaurando === conta.id ? 'Restaurando...' : 'Restaurar'}
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

export default function AdminPage() {
  const { user, updateUser } = useAuth()
  const [aba, setAba] = useState('denuncias')

  const cabecalho = (
    <header className="editor-header">
      <span className="brand-mark">S</span>
      <h1 className="admin-title">Administração</h1>
      <AccountMenu>
        <Link to="/">Início</Link>
        <Link to="/editor">Projetos</Link>
        <Link to="/conta">Conta</Link>
      </AccountMenu>
    </header>
  )

  if (!user.admin) {
    return (
      <div className="editor-page admin-page">
        {cabecalho}
        <p className="home-status home-status--error">Acesso restrito a administradores.</p>
        <p>
          <Link to="/">← Voltar para o início</Link>
        </p>
      </div>
    )
  }

  return (
    <div className="editor-page admin-page">
      {cabecalho}

      <div className="category-tabs admin-tabs" role="tablist" aria-label="Seções da administração">
        {ABAS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            id={`aba-${item.id}`}
            aria-selected={aba === item.id}
            aria-controls="admin-painel"
            className={`category-tab${aba === item.id ? ' active' : ''}`}
            onClick={() => setAba(item.id)}
          >
            {item.rotulo}
          </button>
        ))}
      </div>

      <div className="admin-panel" role="tabpanel" id="admin-painel" aria-labelledby={`aba-${aba}`}>
        {aba === 'denuncias' && <AbaDenuncias eu={user} />}
        {aba === 'contas' && <AbaContas eu={user} />}
        {aba === 'admins' && <AbaAdmins eu={user} onPerdiAcesso={() => updateUser({ admin: false })} />}
        {aba === 'excluidas' && <AbaExcluidas />}
      </div>
    </div>
  )
}
