/*
 * Regras de apresentação do compartilhamento (RF-18), sem React: o diálogo do
 * dono e a página do convite usam as mesmas.
 */

/** Prazos que o servidor aceita, em horas (RN-20: links de validade curta). */
export const VALIDADES = [
  { horas: 1, rotulo: '1 hora' },
  { horas: 24, rotulo: '24 horas' },
  { horas: 72, rotulo: '3 dias' },
]

export const TIPOS_DE_LINK = {
  visualizacao: {
    titulo: 'Link de visualização',
    rotulo: 'Visualização',
    explica:
      'Quem abrir vê o projeto como está e acompanha o que você salvar, podendo simular, mas não edita nada.',
  },
  colaboracao: {
    titulo: 'Link de colaboração',
    rotulo: 'Colaboração',
    explica:
      'Quem aceitar o convite passa a editar o canvas com você, até você o remover. Publicar, trocar a capa e compartilhar continuam só com você.',
  },
}

/** Endereço que o dono envia: a rota `/convite/:token` deste mesmo site. */
export const urlDoConvite = (token, origem = window.location.origin) => `${origem}/convite/${token}`

/** "17/11 às 14:30", no fuso de quem vê. */
export function formatarPrazo(data) {
  const quando = new Date(data)
  const dia = quando.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  const hora = quando.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
  return `${dia} às ${hora}`
}
