/**
 * Catálogo de ícones de interface. Todos desenhados em um viewBox 24x24 e só
 * com traço, para que a cor e a espessura sejam editáveis no painel.
 *
 * O elemento guarda o `path` junto com o nome: assim um projeto antigo continua
 * desenhando certo mesmo se este catálogo mudar depois.
 */
export const ICON_LIBRARY = [
  // Setas e navegação
  { nome: 'Seta direita', grupo: 'Setas', termos: ['avançar', 'próximo', 'direita'], path: 'M5 12h14 M13 6l6 6-6 6' },
  { nome: 'Seta esquerda', grupo: 'Setas', termos: ['voltar', 'anterior', 'esquerda'], path: 'M19 12H5 M11 18l-6-6 6-6' },
  { nome: 'Seta cima', grupo: 'Setas', termos: ['subir', 'topo', 'cima'], path: 'M12 19V5 M6 11l6-6 6 6' },
  { nome: 'Seta baixo', grupo: 'Setas', termos: ['descer', 'baixo'], path: 'M12 5v14 M18 13l-6 6-6-6' },
  { nome: 'Seta retornar', grupo: 'Setas', termos: ['voltar', 'desfazer', 'retornar'], path: 'M9 14 4 9l5-5 M4 9h11a5 5 0 0 1 0 10h-3' },
  { nome: 'Chevron direita', grupo: 'Setas', termos: ['expandir', 'abrir', 'direita'], path: 'M9 6l6 6-6 6' },
  { nome: 'Chevron esquerda', grupo: 'Setas', termos: ['recolher', 'fechar', 'esquerda'], path: 'M15 6l-6 6 6 6' },

  // Usuário
  { nome: 'Perfil', grupo: 'Usuário', termos: ['usuário', 'conta', 'pessoa', 'avatar'], path: 'M12 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M4 20c0-4 4-6 8-6s8 2 8 6' },
  { nome: 'Usuários', grupo: 'Usuário', termos: ['grupo', 'equipe', 'pessoas', 'colaborar'], path: 'M9 8m-3.5 0a3.5 3.5 0 1 0 7 0a3.5 3.5 0 1 0-7 0 M2 20c0-3.5 3.5-5 7-5s7 1.5 7 5 M17 6.5a3.5 3.5 0 0 1 0 7 M18 15.5c2.5.6 4 2 4 4.5' },
  { nome: 'Adicionar usuário', grupo: 'Usuário', termos: ['convidar', 'novo', 'membro'], path: 'M10 8m-4 0a4 4 0 1 0 8 0a4 4 0 1 0-8 0 M2 20c0-4 4-6 8-6s8 2 8 6 M18 4v6 M15 7h6' },

  // Ações
  { nome: 'Lixeira', grupo: 'Ações', termos: ['excluir', 'apagar', 'deletar', 'remover'], path: 'M4 7h16 M9 7V5h6v2 M6 7l1 12h10l1-12 M10 11v5 M14 11v5' },
  { nome: 'Editar', grupo: 'Ações', termos: ['lápis', 'alterar', 'escrever'], path: 'M4 20l4-1 10-10-3-3L5 16z M15 6l3 3' },
  { nome: 'Adicionar', grupo: 'Ações', termos: ['mais', 'novo', 'criar', 'incluir'], path: 'M12 5v14 M5 12h14' },
  { nome: 'Remover', grupo: 'Ações', termos: ['menos', 'subtrair', 'tirar'], path: 'M5 12h14' },
  { nome: 'Fechar', grupo: 'Ações', termos: ['x', 'cancelar', 'sair'], path: 'M6 6l12 12 M18 6L6 18' },
  { nome: 'Confirmar', grupo: 'Ações', termos: ['check', 'ok', 'pronto', 'aceitar'], path: 'M5 12l5 5 9-11' },
  { nome: 'Copiar', grupo: 'Ações', termos: ['duplicar', 'clonar'], path: 'M9 9h10v10H9z M5 15V5h10' },
  { nome: 'Baixar', grupo: 'Ações', termos: ['download', 'salvar', 'exportar'], path: 'M12 4v10 M8 10l4 4 4-4 M5 19h14' },
  { nome: 'Compartilhar', grupo: 'Ações', termos: ['enviar', 'link', 'divulgar'], path: 'M6 12m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M18 6m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M18 18m-2 0a2 2 0 1 0 4 0a2 2 0 1 0-4 0 M8.2 11l7.6-3.8 M8.2 13l7.6 3.8' },

  // Interface
  { nome: 'Menu', grupo: 'Interface', termos: ['hambúrguer', 'lista', 'opções'], path: 'M4 7h16 M4 12h16 M4 17h16' },
  { nome: 'Buscar', grupo: 'Interface', termos: ['pesquisar', 'lupa', 'procurar'], path: 'M10.5 10.5m-6.5 0a6.5 6.5 0 1 0 13 0a6.5 6.5 0 1 0-13 0 M15.2 15.2L20 20' },
  { nome: 'Filtro', grupo: 'Interface', termos: ['filtrar', 'ordenar', 'funil'], path: 'M4 5h16l-6 7v6l-4 2v-8z' },
  { nome: 'Configurações', grupo: 'Interface', termos: ['engrenagem', 'ajustes', 'opções'], path: 'M12 12m-3 0a3 3 0 1 0 6 0a3 3 0 1 0-6 0 M12 3v3 M12 18v3 M3 12h3 M18 12h3 M5.6 5.6l2.1 2.1 M16.3 16.3l2.1 2.1 M18.4 5.6l-2.1 2.1 M7.7 16.3l-2.1 2.1' },
  { nome: 'Início', grupo: 'Interface', termos: ['casa', 'home', 'principal'], path: 'M4 11l8-7 8 7 M6 10v9h12v-9' },
  { nome: 'Grade', grupo: 'Interface', termos: ['blocos', 'layout', 'cards'], path: 'M4 4h7v7H4z M13 4h7v7h-7z M4 13h7v7H4z M13 13h7v7h-7z' },
  { nome: 'Lista', grupo: 'Interface', termos: ['itens', 'linhas', 'feed'], path: 'M4 6h2 M9 6h11 M4 12h2 M9 12h11 M4 18h2 M9 18h11' },
  { nome: 'Cadeado', grupo: 'Interface', termos: ['privado', 'senha', 'bloqueado', 'segurança'], path: 'M6 11h12v9H6z M9 11V8a3 3 0 0 1 6 0v3' },

  // Conteúdo
  { nome: 'Coração', grupo: 'Conteúdo', termos: ['curtir', 'like', 'favorito', 'amar'], path: 'M12 20s-7-4.5-7-9a4 4 0 0 1 7-2.5A4 4 0 0 1 19 11c0 4.5-7 9-7 9z' },
  { nome: 'Estrela', grupo: 'Conteúdo', termos: ['favorito', 'salvar', 'avaliar', 'nota'], path: 'M12 4l2.4 5 5.6.8-4 3.9 1 5.6-5-2.7-5 2.7 1-5.6-4-3.9 5.6-.8z' },
  { nome: 'Sino', grupo: 'Conteúdo', termos: ['notificação', 'alerta', 'aviso'], path: 'M6 16V10a6 6 0 0 1 12 0v6 M4 16h16 M10 19a2 2 0 0 0 4 0' },
  { nome: 'Imagem', grupo: 'Conteúdo', termos: ['foto', 'figura', 'mídia'], path: 'M3 5h18v14H3z M8.5 10.5m-1.5 0a1.5 1.5 0 1 0 3 0a1.5 1.5 0 1 0-3 0 M5 17l4.5-5 3.5 4 2.5-2.5L21 17' },
  { nome: 'Reproduzir', grupo: 'Conteúdo', termos: ['play', 'tocar', 'iniciar', 'vídeo'], path: 'M8 5l11 7-11 7z' },
  { nome: 'Pausar', grupo: 'Conteúdo', termos: ['pause', 'parar'], path: 'M9 5v14 M15 5v14' },
  { nome: 'Comentário', grupo: 'Conteúdo', termos: ['chat', 'balão', 'mensagem', 'falar'], path: 'M4 5h16v11H9l-5 4z' },
  { nome: 'E-mail', grupo: 'Conteúdo', termos: ['carta', 'mensagem', 'correio'], path: 'M3 6h18v12H3z M3 7l9 6 9-6' },

  // Status
  { nome: 'Informação', grupo: 'Status', termos: ['info', 'ajuda', 'detalhes'], path: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M12 11v5 M12 7.5v.5' },
  { nome: 'Atenção', grupo: 'Status', termos: ['aviso', 'alerta', 'cuidado', 'erro'], path: 'M12 4l9 16H3z M12 10v4 M12 17v.5' },
  { nome: 'Erro', grupo: 'Status', termos: ['falha', 'problema', 'negado'], path: 'M12 12m-9 0a9 9 0 1 0 18 0a9 9 0 1 0-18 0 M9 9l6 6 M15 9l-6 6' },
]

export const ICON_DEFAULT_SIZE = 48

/** Busca por nome, grupo ou termos relacionados, ignorando acentos e caixa. */
export function filtrarIcones(termo) {
  const alvo = normalizar(termo)
  if (!alvo) return ICON_LIBRARY
  return ICON_LIBRARY.filter((icone) =>
    [icone.nome, icone.grupo, ...icone.termos].some((texto) => normalizar(texto).includes(alvo)),
  )
}

function normalizar(texto) {
  return String(texto || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
}
