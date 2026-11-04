import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { setToken, uploadImage } from '../src/api.js'
import ThemeSync from '../src/components/ThemeSync.jsx'
import { AuthProvider } from '../src/context/AuthContext.jsx'
import { USUARIO, renderizarApp, simularApi } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

const EU = { ...USUARIO, id: 'eu', bio: 'Escrevo histórias.', cor: '#112233' }

describe('tela inicial', () => {
  const PROJETOS = [
    { id: 1, titulo: 'Aurora', autor_nome: 'Bia', categoria: 'Aventura', likes: 1, salvo: true, capa: 'https://exemplo.test/a.png' },
    { id: 2, titulo: 'Borealis', autor_nome: null, autor_email: 'caio@example.com', categoria: 'Drama', likes: 2, salvo: false },
    { id: 3, titulo: 'Céu', autor_nome: 'Bia', categoria: 'Drama', likes: 0, salvo: false },
  ]
  const abrir = (projetos = PROJETOS) =>
    renderizarApp('/', { usuario: EU, rotas: { 'GET /api/projects': { projects: projetos } } })

  const titulosDe = (secao) => within(secao).getAllByRole('heading', { level: 3 }).map((item) => item.textContent)

  it('os salvos sobem para uma seção própria; o resto fica em "Da comunidade"', async () => {
    abrir()

    const salvos = (await screen.findByRole('heading', { name: 'Salvos' })).closest('section')
    const comunidade = screen.getByRole('heading', { name: 'Da comunidade' }).closest('section')
    expect(titulosDe(salvos)).toEqual(['Aurora'])
    expect(titulosDe(comunidade)).toEqual(['Borealis', 'Céu'])
    expect(screen.getByRole('link', { name: /Borealis/ })).toHaveAttribute('href', '/projeto/2')
    // Sem nome, o autor aparece pelo e-mail.
    expect(screen.getByText('caio@example.com')).toBeInTheDocument()
  })

  it('sem salvos, a lista dispensa o título de seção', async () => {
    abrir([PROJETOS[1]])

    await screen.findByText('Borealis')
    expect(screen.queryByRole('heading', { name: 'Da comunidade' })).not.toBeInTheDocument()
  })

  it('a pesquisa acha pelo autor, e o salvo que não casa some', async () => {
    const usuario = userEvent.setup()
    abrir()

    await screen.findByText('Aurora')
    await usuario.type(screen.getByPlaceholderText('Pesquisar'), 'caio')

    expect(screen.getByText('Borealis')).toBeInTheDocument()
    expect(screen.queryByText('Aurora')).not.toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: 'Salvos' })).not.toBeInTheDocument()

    await usuario.type(screen.getByPlaceholderText('Pesquisar'), 'xyz')
    expect(screen.getByText('Nenhum projeto encontrado.')).toBeInTheDocument()
  })

  it('a aba de tag filtra a lista', async () => {
    const usuario = userEvent.setup()
    abrir()

    const abas = await screen.findByRole('navigation', { name: 'Categorias' })
    await usuario.click(within(abas).getByRole('button', { name: 'Aventura' }))

    expect(screen.getByText('Aurora')).toBeInTheDocument()
    expect(screen.queryByText('Borealis')).not.toBeInTheDocument()
  })

  it('mostra o erro quando a lista não carrega', async () => {
    renderizarApp('/', { usuario: EU, rotas: { 'GET /api/projects': new Error('Não foi possível carregar os projetos.') } })

    expect(await screen.findByText('Não foi possível carregar os projetos.')).toBeInTheDocument()
  })
})

describe('conta', () => {
  const ROTAS = {
    'GET /api/users/eu/perfil': { projects: [] },
    'GET /api/users/me/denuncias': { projects: [], creators: [] },
    'GET /api/termos': {
      titulo: 'Termos de Uso',
      versao: '1.1',
      vigenciaDesde: '2026-10-11',
      retencaoContaExcluidaMeses: 6,
      secoes: [],
    },
  }
  const abrir = (rotas = {}, usuario = EU) => renderizarApp('/conta', { usuario, rotas: { ...ROTAS, ...rotas } })
  const status = () => screen.getByRole('status')

  it('salva nome, descrição e cor, e o cabeçalho acompanha', async () => {
    const usuario = userEvent.setup()
    const salvar = vi.fn(({ json }) => ({ user: json }))
    abrir({ 'PATCH /api/users/me': salvar })

    const nome = await screen.findByLabelText('Nome de usuário')
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana')
    await usuario.clear(nome)
    await usuario.type(nome, 'Ana Lima')
    // O rótulo desses dois campos inclui o contador e o valor da cor, então não casa exato.
    await usuario.type(screen.getByLabelText(/^Descrição/), '!')
    expect(screen.getByText(`${EU.bio.length + 1}/280`)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/^Cor de fundo/), { target: { value: '#445566' } })
    await usuario.click(screen.getByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(status()).toHaveTextContent('Perfil atualizado com sucesso.'))
    expect(status()).toHaveAttribute('data-type', 'success')
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({ json: { nome: 'Ana Lima', bio: 'Escrevo histórias.!', cor: '#445566' } }),
    )
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Ana Lima')
  })

  it('erro ao salvar aparece e o botão volta a funcionar', async () => {
    const usuario = userEvent.setup()
    abrir({ 'PATCH /api/users/me': new Error('O nome é obrigatório.') })

    await usuario.click(await screen.findByRole('button', { name: 'Salvar alterações' }))

    await waitFor(() => expect(status()).toHaveTextContent('O nome é obrigatório.'))
    expect(status()).toHaveAttribute('data-type', 'error')
    expect(screen.getByRole('button', { name: 'Salvar alterações' })).toBeEnabled()
  })

  it('conta antiga avisa que não tem aceite; conta nova mostra a versão aceita', async () => {
    const { unmount } = abrir()
    expect(await screen.findByText(/não tem aceite registrado/)).toBeInTheDocument()
    unmount()

    abrir({}, { ...EU, termos_versao: '1.0', termos_aceitos_em: '2026-10-11T12:00:00Z' })
    expect((await screen.findByText(/Você aceitou a versão/)).querySelector('strong')).toHaveTextContent('1.0')
  })

  it('abre os termos só para leitura e fecha', async () => {
    const usuario = userEvent.setup()
    abrir()

    await usuario.click(await screen.findByRole('button', { name: 'Ler os termos vigentes' }))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Fechar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('termos que não carregam viram mensagem de erro', async () => {
    const usuario = userEvent.setup()
    abrir({ 'GET /api/termos': new Error('Termos indisponíveis.') })

    await usuario.click(await screen.findByRole('button', { name: 'Ler os termos vigentes' }))

    await waitFor(() => expect(status()).toHaveTextContent('Termos indisponíveis.'))
  })

  describe('excluir conta', () => {
    async function abrirFormulario(usuario) {
      const danger = (await screen.findByRole('heading', { name: 'Excluir conta' })).closest('section')
      await usuario.click(within(danger).getByRole('button', { name: 'Excluir conta' }))
      return danger
    }

    it('avisa o prazo de guarda dos Termos e pode ser cancelada', async () => {
      const usuario = userEvent.setup()
      abrir()

      const danger = await abrirFormulario(usuario)
      await within(danger).findByText('6 meses')

      await usuario.click(within(danger).getByRole('button', { name: 'Cancelar' }))
      expect(within(danger).queryByLabelText(/Confirme sua senha/)).not.toBeInTheDocument()
    })

    it('sem os Termos o aviso some, mas a exclusão continua possível', async () => {
      const usuario = userEvent.setup()
      abrir({ 'GET /api/termos': new Error('falhou') })

      const danger = await abrirFormulario(usuario)

      expect(within(danger).getByLabelText(/Confirme sua senha/)).toBeInTheDocument()
      expect(within(danger).queryByText(/meses/)).not.toBeInTheDocument()
    })

    it('senha errada mantém a conta e mostra o erro', async () => {
      const usuario = userEvent.setup()
      abrir({ 'DELETE /api/users/me': new Error('Senha incorreta.') })

      const danger = await abrirFormulario(usuario)
      await usuario.type(within(danger).getByLabelText(/Confirme sua senha/), 'errada123')
      await usuario.click(within(danger).getByRole('button', { name: 'Confirmar exclusão' }))

      await waitFor(() => expect(status()).toHaveTextContent('Senha incorreta.'))
      expect(sessionStorage.getItem('schedio.accountDeleted')).toBeNull()
      expect(within(danger).getByRole('button', { name: 'Confirmar exclusão' })).toBeEnabled()
    })

    it('senha certa sai da conta e o login confirma a exclusão', async () => {
      const usuario = userEvent.setup()
      const excluir = vi.fn(() => null)
      abrir({ 'DELETE /api/users/me': excluir })

      const danger = await abrirFormulario(usuario)
      await usuario.type(within(danger).getByLabelText(/Confirme sua senha/), 'segredo123')
      await usuario.click(within(danger).getByRole('button', { name: 'Confirmar exclusão' }))

      expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
      expect(excluir).toHaveBeenCalledWith(expect.objectContaining({ json: { password: 'segredo123' } }))
      await waitFor(() => expect(status()).toHaveTextContent('Conta excluída com sucesso.'))
    })
  })

  describe('foto de perfil', () => {
    const campoArquivo = () => document.querySelector('input[type="file"]')
    const imagem = (tamanho = 10) => new File([new Uint8Array(tamanho)], 'foto.png', { type: 'image/png' })

    it('arquivo que não é imagem é recusado sem subir', async () => {
      abrir()
      await screen.findByRole('button', { name: 'Adicionar foto de perfil' })

      fireEvent.change(campoArquivo(), { target: { files: [new File(['x'], 'nota.txt', { type: 'text/plain' })] } })

      expect(status()).toHaveTextContent('Envie um arquivo de imagem.')
      expect(uploadImage).not.toHaveBeenCalled()
    })

    it('imagem acima de 5 MB é recusada sem subir', async () => {
      abrir()
      await screen.findByRole('button', { name: 'Adicionar foto de perfil' })

      fireEvent.change(campoArquivo(), { target: { files: [imagem(5 * 1024 * 1024 + 1)] } })

      expect(status()).toHaveTextContent('A imagem deve ter no máximo 5 MB.')
      expect(uploadImage).not.toHaveBeenCalled()
    })

    it('sobe na hora, troca o avatar e permite remover', async () => {
      const usuario = userEvent.setup()
      const remover = vi.fn(() => null)
      uploadImage.mockResolvedValue({ foto: 'https://exemplo.test/eu.png' })
      abrir({ 'DELETE /api/users/me/foto': remover })
      await screen.findByRole('button', { name: 'Adicionar foto de perfil' })

      const arquivo = imagem()
      fireEvent.change(campoArquivo(), { target: { files: [arquivo] } })

      await waitFor(() => expect(status()).toHaveTextContent('Foto de perfil atualizada.'))
      expect(uploadImage).toHaveBeenCalledWith('/api/users/me/foto', arquivo)
      expect(document.querySelector('.avatar-photo')).toHaveAttribute('src', 'https://exemplo.test/eu.png')

      await usuario.click(screen.getByRole('button', { name: 'Remover' }))

      await waitFor(() => expect(status()).toHaveTextContent('Foto de perfil removida.'))
      expect(remover).toHaveBeenCalledOnce()
      expect(document.querySelector('.avatar-photo')).toBeNull()
      expect(screen.getByRole('button', { name: 'Adicionar foto de perfil' })).toBeEnabled()
    })

    it('erros do envio e da remoção aparecem', async () => {
      const usuario = userEvent.setup()
      uploadImage.mockRejectedValue(new Error('Armazenamento de imagens não configurado.'))
      abrir(
        { 'DELETE /api/users/me/foto': new Error('Não foi possível remover a foto.') },
        { ...EU, foto: 'https://exemplo.test/antiga.png' },
      )
      await screen.findByRole('button', { name: 'Alterar foto de perfil' })

      fireEvent.change(campoArquivo(), { target: { files: [imagem()] } })
      await waitFor(() => expect(status()).toHaveTextContent('Armazenamento de imagens não configurado.'))

      await usuario.click(screen.getByRole('button', { name: 'Remover' }))
      await waitFor(() => expect(status()).toHaveTextContent('Não foi possível remover a foto.'))
      expect(document.querySelector('.avatar-photo')).toHaveAttribute('src', 'https://exemplo.test/antiga.png')
    })
  })

  describe('obras', () => {
    const OBRAS = [
      { id: 'a', titulo: 'No ar', status: 'publicado', categoria: 'Aventura', criado: '2026-10-11T12:00:00Z', likes: 3 },
      { id: 'b', titulo: 'Rascunho', status: 'privado', categoria: 'Drama', criado: '2026-10-12T12:00:00Z', likes: 1, capa: 'https://exemplo.test/c.png' },
    ]

    it('as privadas levam ao editor, com selo; as publicadas, à apresentação', async () => {
      abrir({ 'GET /api/users/eu/perfil': { projects: OBRAS } })

      const privada = await screen.findByRole('link', { name: /Rascunho/ })
      expect(privada).toHaveAttribute('href', '/editor/b')
      expect(within(privada).getByText('Privado')).toBeInTheDocument()
      const publicada = screen.getByRole('link', { name: /No ar/ })
      expect(publicada).toHaveAttribute('href', '/projeto/a')
      expect(within(publicada).queryByText('Privado')).not.toBeInTheDocument()
    })

    it('a pesquisa olha o título e as tags, e as abas filtram', async () => {
      const usuario = userEvent.setup()
      abrir({ 'GET /api/users/eu/perfil': { projects: OBRAS } })
      await screen.findByText('No ar')

      await usuario.type(screen.getByPlaceholderText('Pesquisar obras'), 'drama')
      expect(screen.getByText('Rascunho')).toBeInTheDocument()
      expect(screen.queryByText('No ar')).not.toBeInTheDocument()

      await usuario.type(screen.getByPlaceholderText('Pesquisar obras'), 'xyz')
      expect(screen.getByText('Nenhuma obra encontrada.')).toBeInTheDocument()

      await usuario.clear(screen.getByPlaceholderText('Pesquisar obras'))
      await usuario.click(within(screen.getByRole('navigation', { name: 'Tags das obras' })).getByRole('button', { name: 'Aventura' }))
      expect(screen.getByText('No ar')).toBeInTheDocument()
      expect(screen.queryByText('Rascunho')).not.toBeInTheDocument()
    })

    it('sem obras convida a criar; erro no carregamento aparece', async () => {
      const { unmount } = abrir()
      expect(await screen.findByText('Você ainda não criou nenhuma obra.')).toBeInTheDocument()
      unmount()

      abrir({ 'GET /api/users/eu/perfil': new Error('Não foi possível carregar as obras.') })
      expect(await screen.findByText('Não foi possível carregar as obras.')).toBeInTheDocument()
    })
  })
})

describe('perfil de outro criador', () => {
  const CRIADOR = { id: 'bia', nome: 'Bia', email: 'bia@example.com', bio: 'Faço HQs.', foto: null, denunciado: false }
  const abrir = (rotas = {}) =>
    renderizarApp('/perfil/bia', {
      usuario: EU,
      rotas: { 'GET /api/users/bia/perfil': { user: CRIADOR, projects: [] }, ...rotas },
    })

  it('mostra quem é, a descrição e o aviso de que não há obras', async () => {
    abrir()

    expect(await screen.findByRole('heading', { name: 'Bia' })).toBeInTheDocument()
    expect(screen.getByText('Faço HQs.')).toBeInTheDocument()
    expect(screen.getByText('Este criador ainda não publicou nenhuma obra.')).toBeInTheDocument()
  })

  it('sem nome nem descrição, usa o e-mail e um texto padrão', async () => {
    abrir({ 'GET /api/users/bia/perfil': { user: { ...CRIADOR, nome: null, bio: null }, projects: [] } })

    expect(await screen.findByRole('heading', { name: 'bia@example.com' })).toBeInTheDocument()
    expect(screen.getByText('Este criador ainda não escreveu uma descrição.')).toBeInTheDocument()
  })

  it('o próprio perfil redireciona para a conta', async () => {
    renderizarApp('/perfil/eu', {
      usuario: EU,
      rotas: {
        'GET /api/users/eu/perfil': { projects: [] },
        'GET /api/users/me/denuncias': { projects: [], creators: [] },
      },
    })

    expect(await screen.findByLabelText('Nome de usuário')).toBeInTheDocument()
  })

  it('perfil que não existe mostra o erro e o caminho de volta', async () => {
    abrir({ 'GET /api/users/bia/perfil': new Error('Usuário não encontrado.') })

    expect(await screen.findByText('Usuário não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Voltar para o início' })).toHaveAttribute('href', '/')
  })

  it('denunciar pede confirmação e, depois, o botão fica marcado', async () => {
    const usuario = userEvent.setup()
    const denunciar = vi.fn(() => ({ denunciado: true }))
    abrir({ 'POST /api/users/bia/denuncia': denunciar })

    await usuario.click(await screen.findByRole('button', { name: 'Denunciar criador' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(denunciar).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Denunciar criador' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Denunciar' }))

    const marcado = await screen.findByRole('button', { name: 'Criador denunciado' })
    expect(marcado).toBeDisabled()
    expect(marcado).toHaveAttribute('title', 'Você já denunciou este criador. Veja a lista na sua conta.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('erro ao denunciar aparece e a confirmação continua aberta', async () => {
    const usuario = userEvent.setup()
    abrir({ 'POST /api/users/bia/denuncia': new Error('Você não pode denunciar agora.') })

    await usuario.click(await screen.findByRole('button', { name: 'Denunciar criador' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Denunciar' }))

    expect(await screen.findByText('Você não pode denunciar agora.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('aberto direto pelo link, voltar leva ao início', async () => {
    const usuario = userEvent.setup()
    abrir({ 'GET /api/projects': { projects: [] } })

    await usuario.click(await screen.findByRole('button', { name: '← Voltar' }))

    expect(await screen.findByText('Nenhum projeto publicado ainda.')).toBeInTheDocument()
  })
})

describe('apresentação da obra', () => {
  const tela = (id) => ({ id, type: 'screen', x: 0, y: 0, width: 100, height: 100, name: id })
  const OBRA = {
    id: 'p1',
    titulo: 'Aurora',
    autor_id: 'bia',
    autor_nome: 'Bia',
    categoria: 'Aventura, Ação',
    descricao: 'Uma viagem.',
    criado: '2026-10-11T12:00:00Z',
    likes: 2,
    curtido: false,
    salvo: false,
    denunciado: false,
    capa: 'https://exemplo.test/c.png',
    conteudo: { elements: [tela('t1'), tela('t2')] },
  }
  const abrir = (obra = OBRA, rotas = {}, state) =>
    renderizarApp('/projeto/p1', {
      usuario: EU,
      state,
      rotas: { 'GET /api/projects/p1/leitura': { project: obra }, ...rotas },
    })

  it('mostra os dados da obra e quantas telas há para navegar', async () => {
    abrir()

    expect(await screen.findByRole('heading', { name: 'Aurora' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Bia' })).toHaveAttribute('href', '/perfil/bia')
    expect(screen.getByText('Aventura')).toBeInTheDocument()
    expect(screen.getByText('Ação')).toBeInTheDocument()
    expect(screen.getByText('Uma viagem.')).toBeInTheDocument()
    expect(screen.getByText('2 telas para navegar.')).toBeInTheDocument()
  })

  it('sem telas não há o que ler; sem descrição, um texto padrão', async () => {
    abrir({ ...OBRA, autor_nome: null, autor_email: 'bia@example.com', descricao: '', conteudo: null })

    await screen.findByRole('link', { name: 'bia@example.com' })
    expect(screen.getByText('Este projeto ainda não tem uma descrição.')).toBeInTheDocument()
    expect(screen.getByText(/ainda não montou telas/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Ler' })).not.toBeInTheDocument()
  })

  it('uma tela só usa o singular', async () => {
    abrir({ ...OBRA, conteudo: { elements: [tela('t1')] } })

    expect(await screen.findByText('1 tela para navegar.')).toBeInTheDocument()
  })

  it('projeto privado ou inexistente mostra o erro e o caminho de volta', async () => {
    renderizarApp('/projeto/p1', {
      usuario: EU,
      rotas: { 'GET /api/projects/p1/leitura': new Error('Projeto não encontrado.') },
    })

    expect(await screen.findByText('Projeto não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '← Voltar para o início' })).toHaveAttribute('href', '/')
  })

  it('like liga e desliga, e o número vem do servidor', async () => {
    const usuario = userEvent.setup()
    const curtir = vi.fn(() => ({ curtido: true, likes: 3 }))
    const descurtir = vi.fn(() => ({ curtido: false, likes: 2 }))
    abrir(OBRA, { 'PUT /api/projects/p1/like': curtir, 'DELETE /api/projects/p1/like': descurtir })

    const like = await screen.findByRole('button', { name: /Like/ })
    expect(like).toHaveAttribute('aria-pressed', 'false')

    await usuario.click(like)
    await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'true'))
    expect(within(like).getByLabelText('3 likes')).toBeInTheDocument()
    expect(like).toHaveAttribute('title', 'Desfazer like')

    await usuario.click(like)
    await waitFor(() => expect(like).toHaveAttribute('aria-pressed', 'false'))
    expect(within(like).getByLabelText('2 likes')).toBeInTheDocument()
    expect(curtir).toHaveBeenCalledOnce()
    expect(descurtir).toHaveBeenCalledOnce()
  })

  it('salvar liga e desliga', async () => {
    const usuario = userEvent.setup()
    abrir(OBRA, {
      'PUT /api/projects/p1/salvo': { salvo: true },
      'DELETE /api/projects/p1/salvo': { salvo: false },
    })

    await usuario.click(await screen.findByRole('button', { name: 'Salvar' }))
    const salvo = await screen.findByRole('button', { name: 'Salvo' })
    expect(salvo).toHaveAttribute('title', 'Tirar dos salvos')

    await usuario.click(salvo)
    expect(await screen.findByRole('button', { name: 'Salvar' })).toBeInTheDocument()
  })

  it('erro numa marca aparece na tela, sem mudar o estado', async () => {
    const usuario = userEvent.setup()
    abrir(OBRA, { 'PUT /api/projects/p1/like': new Error('Este projeto voltou a ser privado.') })

    const like = await screen.findByRole('button', { name: /Like/ })
    await usuario.click(like)

    expect(await screen.findByText('Este projeto voltou a ser privado.')).toBeInTheDocument()
    expect(like).toHaveAttribute('aria-pressed', 'false')
  })

  it('denunciar pede confirmação e não se desfaz', async () => {
    const usuario = userEvent.setup()
    const denunciar = vi.fn(() => ({ denunciado: true }))
    abrir(OBRA, { 'POST /api/projects/p1/denuncia': denunciar })

    await usuario.click(await screen.findByRole('button', { name: 'Denunciar' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Cancelar' }))
    expect(denunciar).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Denunciar' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Denunciar' }))

    const marcado = await screen.findByRole('button', { name: 'Denunciado' })
    expect(marcado).toBeDisabled()
    expect(marcado).toHaveAttribute('title', 'Você já denunciou este projeto. Veja a lista na sua conta.')
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument()
  })

  it('denúncia recusada mantém a confirmação aberta com o erro', async () => {
    const usuario = userEvent.setup()
    abrir(OBRA, { 'POST /api/projects/p1/denuncia': new Error('Tente novamente.') })

    await usuario.click(await screen.findByRole('button', { name: 'Denunciar' }))
    await usuario.click(within(screen.getByRole('alertdialog')).getByRole('button', { name: 'Denunciar' }))

    expect(await screen.findByText('Tente novamente.')).toBeInTheDocument()
    expect(screen.getByRole('alertdialog')).toBeInTheDocument()
  })

  it('o autor não denuncia a própria obra: o botão desliga e diz o motivo', async () => {
    abrir({ ...OBRA, autor_id: EU.id })

    const denunciar = await screen.findByRole('button', { name: 'Denunciar' })
    expect(denunciar).toBeDisabled()
    expect(denunciar).toHaveAttribute('title', 'Você não pode denunciar o próprio projeto.')
  })

  it('voltando da leitura, só quem não curtiu ganha o convite ao like', async () => {
    const { unmount } = abrir(OBRA, {}, { fromReading: true })
    expect(await screen.findByText('Gostou da leitura? Deixe seu like.')).toBeInTheDocument()
    unmount()

    abrir({ ...OBRA, curtido: true }, {}, { fromReading: true })
    await screen.findByRole('heading', { name: 'Aurora' })
    expect(screen.queryByText('Gostou da leitura? Deixe seu like.')).not.toBeInTheDocument()
  })
})

describe('ThemeSync', () => {
  const renderizar = () =>
    render(
      <MemoryRouter>
        <AuthProvider>
          <ThemeSync />
        </AuthProvider>
      </MemoryRouter>,
    )

  it('aplica a cor do usuário e a tira quando não há cor', async () => {
    setToken('token-de-teste')
    simularApi({ 'GET /api/auth/me': { user: EU } })
    const { unmount } = renderizar()
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--bg-page')).toBe('#112233'))
    unmount()

    localStorage.clear()
    renderizar()
    await waitFor(() => expect(document.documentElement.style.getPropertyValue('--bg-page')).toBe(''))
  })
})
