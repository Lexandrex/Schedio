import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { apiRequest, getToken } from '../src/api.js'
import { MAX_TAGS_LENGTH } from '../src/tags.js'
import { USUARIO, renderizarApp } from './helpers.jsx'

vi.mock('../src/api.js', async (original) => ({
  ...(await original()),
  apiRequest: vi.fn(),
  authRequest: vi.fn(),
  uploadImage: vi.fn(),
}))

const projeto = (id, titulo, extra = {}) => ({
  id, titulo, categoria: '', descricao: '', status: 'privado', likes: 0, capa: null, ...extra,
})

function abrirEditor(projetos, rotas = {}) {
  return renderizarApp('/editor', {
    usuario: USUARIO,
    rotas: { 'GET /api/projects/mine': { projects: projetos }, ...rotas },
  })
}

/** O cartão de um projeto, achado pelo título. */
const cartao = (titulo) => screen.getByRole('heading', { name: titulo }).closest('article')
const selecionar = (usuario, titulo) =>
  usuario.click(within(cartao(titulo)).getByTitle('Clique para selecionar, duplo clique para abrir'))

describe('lista de projetos', () => {
  it('sem projetos, convida a criar o primeiro', async () => {
    abrirEditor([])

    expect(await screen.findByText('Você ainda não criou nenhum projeto.')).toBeInTheDocument()
  })

  it('mostra o erro quando a lista não carrega', async () => {
    abrirEditor([], { 'GET /api/projects/mine': new Error('Não foi possível carregar seus projetos.') })

    expect(await screen.findByText('Não foi possível carregar seus projetos.')).toBeInTheDocument()
  })

  it('mostra tags, status e likes de cada projeto', async () => {
    abrirEditor([projeto(1, 'Aurora', { categoria: 'Aventura, Ação', status: 'publicado', likes: 1 })])

    const card = within(await screen.findByRole('article'))
    expect(card.getByRole('list', { name: 'Tags de Aurora' })).toHaveTextContent('AventuraAção')
    expect(card.getByText('Público')).toBeInTheDocument()
    expect(card.getByLabelText('1 like')).toBeInTheDocument()
  })

  it('a pesquisa filtra pelo título, sem diferenciar maiúsculas', async () => {
    const usuario = userEvent.setup()
    abrirEditor([projeto(1, 'Aurora'), projeto(2, 'Borealis')])

    const busca = await screen.findByPlaceholderText('Pesquisar')
    await screen.findByText('Aurora')
    await usuario.type(busca, 'BORE')
    expect(screen.queryByText('Aurora')).not.toBeInTheDocument()
    expect(screen.getByText('Borealis')).toBeInTheDocument()

    await usuario.clear(busca)
    await usuario.type(busca, 'zzz')
    expect(screen.getByText('Nenhum projeto encontrado para essa busca.')).toBeInTheDocument()
  })
})

describe('criar e editar', () => {
  it('cria um projeto com as tags normalizadas e o põe no topo da lista', async () => {
    const usuario = userEvent.setup()
    const salvar = vi.fn(({ json }) => ({ project: projeto(9, json.titulo, { categoria: json.categoria }) }))
    abrirEditor([projeto(1, 'Antigo')], { 'POST /api/projects': salvar })

    await usuario.click(await screen.findByRole('button', { name: /Novo projeto/ }))
    const dialogo = within(screen.getByRole('dialog', { name: 'Novo projeto' }))
    await usuario.type(dialogo.getByLabelText('Título'), 'Minha HQ')
    await usuario.type(dialogo.getByLabelText('Tags'), 'Aventura ação,  mistério')
    await usuario.type(dialogo.getByLabelText('Descrição'), 'Uma história curta.')

    // A prévia mostra as tags já separadas, e cada uma pode ser removida.
    const previa = dialogo.getByRole('list', { name: 'Tags do projeto' })
    expect(within(previa).getAllByRole('listitem')).toHaveLength(3)
    await usuario.click(dialogo.getByRole('button', { name: 'Remover a tag mistério' }))
    expect(dialogo.getByLabelText('Tags')).toHaveValue('Aventura, ação')

    await usuario.click(dialogo.getByRole('button', { name: 'Criar projeto' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(salvar).toHaveBeenCalledWith(
      expect.objectContaining({
        method: 'POST',
        json: { titulo: 'Minha HQ', categoria: 'Aventura, ação', descricao: 'Uma história curta.' },
      }),
    )
    const titulos = screen.getAllByRole('article').map((item) => within(item).getByRole('heading').textContent)
    expect(titulos).toEqual(['Minha HQ', 'Antigo'])
  })

  it('recusa tags que passam do limite da coluna', async () => {
    const usuario = userEvent.setup()
    abrirEditor([])

    await usuario.click(await screen.findByRole('button', { name: /Novo projeto/ }))
    await usuario.type(screen.getByLabelText('Título'), 'Longo')
    await usuario.type(screen.getByLabelText('Tags'), 'x'.repeat(MAX_TAGS_LENGTH + 1))
    await usuario.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(screen.getByRole('status')).toHaveTextContent(
      `As tags devem somar até ${MAX_TAGS_LENGTH} caracteres. Use menos tags ou tags mais curtas.`,
    )
    expect(apiRequest).not.toHaveBeenCalledWith('/api/projects', expect.anything())
  })

  it('erro ao salvar fica no formulário, que continua aberto', async () => {
    const usuario = userEvent.setup()
    abrirEditor([], { 'POST /api/projects': new Error('O título é obrigatório.') })

    await usuario.click(await screen.findByRole('button', { name: /Novo projeto/ }))
    await usuario.type(screen.getByLabelText('Título'), 'X')
    await usuario.click(screen.getByRole('button', { name: 'Criar projeto' }))

    expect(await screen.findByText('O título é obrigatório.')).toBeInTheDocument()
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('edita um projeto privado já preenchido e troca o cartão pelo salvo', async () => {
    const usuario = userEvent.setup()
    const salvar = vi.fn(({ json }) => ({ project: projeto(1, json.titulo) }))
    abrirEditor([projeto(1, 'Rascunho', { categoria: 'drama', descricao: 'Antes' })], {
      'PATCH /api/projects/1': salvar,
    })

    await screen.findByText('Rascunho')
    await selecionar(usuario, 'Rascunho')
    await usuario.click(screen.getByRole('button', { name: 'Editar' }))

    const dialogo = within(screen.getByRole('dialog', { name: 'Editar projeto' }))
    expect(dialogo.getByLabelText('Tags')).toHaveValue('drama')
    expect(dialogo.getByLabelText('Descrição')).toHaveValue('Antes')
    await usuario.clear(dialogo.getByLabelText('Título'))
    await usuario.type(dialogo.getByLabelText('Título'), 'Versão final')
    await usuario.click(dialogo.getByRole('button', { name: 'Salvar alterações' }))

    expect(await screen.findByRole('heading', { name: 'Versão final' })).toBeInTheDocument()
    expect(salvar).toHaveBeenCalledWith(expect.objectContaining({ method: 'PATCH' }))
  })

  it('projeto publicado não se edita: o botão fica desligado e explica por quê', async () => {
    const usuario = userEvent.setup()
    abrirEditor([projeto(1, 'No ar', { status: 'publicado' })])

    await screen.findByText('No ar')
    await selecionar(usuario, 'No ar')

    const editar = screen.getByRole('button', { name: 'Editar' })
    expect(editar).toBeDisabled()
    expect(editar).toHaveAttribute('title', 'Torne o projeto privado para editar os dados dele.')
    expect(screen.getByRole('link', { name: 'Abrir' })).toHaveAttribute('href', '/editor/1')
  })
})

describe('publicar e excluir', () => {
  it('publicar troca o status pelo que o servidor devolveu', async () => {
    const usuario = userEvent.setup()
    const status = vi.fn(() => ({ project: { status: 'publicado' } }))
    abrirEditor([projeto(1, 'Aurora')], { 'PATCH /api/projects/1/status': status })

    await screen.findByText('Aurora')
    await selecionar(usuario, 'Aurora')
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByText('Público')).toBeInTheDocument()
    expect(status).toHaveBeenCalledWith(expect.objectContaining({ json: { status: 'publicado' } }))
    expect(screen.getByRole('button', { name: 'Tornar privado' })).toBeInTheDocument()
  })

  it('erro ao publicar aparece na página', async () => {
    const usuario = userEvent.setup()
    abrirEditor([projeto(1, 'Aurora')], {
      'PATCH /api/projects/1/status': new Error('Projeto sem telas não pode ser publicado.'),
    })

    await screen.findByText('Aurora')
    await selecionar(usuario, 'Aurora')
    await usuario.click(screen.getByRole('button', { name: 'Publicar' }))

    expect(await screen.findByText('Projeto sem telas não pode ser publicado.')).toBeInTheDocument()
  })

  it('a lixeira só liga com um projeto selecionado e pede confirmação', async () => {
    const usuario = userEvent.setup()
    const excluir = vi.fn(() => null)
    abrirEditor([projeto(1, 'Aurora'), projeto(2, 'Borealis')], { 'DELETE /api/projects/1': excluir })

    await screen.findByText('Aurora')
    expect(screen.getByRole('button', { name: 'Selecione um projeto para excluir' })).toBeDisabled()

    await selecionar(usuario, 'Aurora')
    await usuario.click(screen.getByRole('button', { name: 'Excluir projeto Aurora' }))
    expect(screen.getByText(/Excluir/, { selector: '.trash-confirm p' })).toHaveTextContent('Excluir Aurora?')

    // Cancelar não apaga nada.
    await usuario.click(screen.getByRole('button', { name: 'Cancelar' }))
    expect(excluir).not.toHaveBeenCalled()

    await usuario.click(screen.getByRole('button', { name: 'Excluir projeto Aurora' }))
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))

    await waitFor(() => expect(screen.queryByText('Aurora')).not.toBeInTheDocument())
    expect(excluir).toHaveBeenCalledOnce()
    expect(screen.getByText('Borealis')).toBeInTheDocument()
  })

  it('erro ao excluir mantém o projeto e mostra a mensagem', async () => {
    const usuario = userEvent.setup()
    abrirEditor([projeto(1, 'Aurora')], { 'DELETE /api/projects/1': new Error('Projeto não encontrado.') })

    await screen.findByText('Aurora')
    await selecionar(usuario, 'Aurora')
    await usuario.click(screen.getByRole('button', { name: 'Excluir projeto Aurora' }))
    await usuario.click(screen.getByRole('button', { name: 'Excluir' }))

    expect(await screen.findByText('Projeto não encontrado.')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Aurora' })).toBeInTheDocument()
  })
})

describe('menu da conta', () => {
  it('mostra o e-mail, fecha ao clicar fora e sai da conta', async () => {
    const usuario = userEvent.setup()
    abrirEditor([])

    const menu = await screen.findByRole('button', { name: 'Menu da conta' })
    await usuario.click(menu)
    expect(screen.getByText('ana@example.com')).toBeInTheDocument()

    await usuario.click(document.body)
    expect(screen.queryByText('ana@example.com')).not.toBeInTheDocument()

    await usuario.click(menu)
    await usuario.click(screen.getByRole('button', { name: 'Sair' }))

    expect(await screen.findByRole('heading', { name: 'Entrar' })).toBeInTheDocument()
    expect(getToken()).toBeNull()
  })
})
