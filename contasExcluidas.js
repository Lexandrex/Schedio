/*
 * Guarda da conta excluída (Termos de Uso, seções 5 e 13).
 *
 * Excluir a conta tira tudo da Plataforma na hora, mas antes uma cópia do
 * estado dela — quem era e cada projeto, com conteúdo, status, contadores e
 * imagens — vai para `contas_excluidas`, com vencimento calculado pelo prazo
 * de `TERMOS.retencaoContaExcluidaMeses`. O expurgo apaga as cópias vencidas
 * e os arquivos delas no Cloudinary.
 *
 * Os arquivos ficam no Cloudinary até o expurgo justamente porque o
 * `conteudo` guardado aponta para eles: apagar antes deixaria a cópia com
 * imagens quebradas.
 */
const { TERMOS } = require('./termos');

/**
 * O que da linha de `users` NÃO vai para a cópia de restauração: a foto é
 * apagada no encerramento, o token de senha perde o sentido, e o acesso de
 * administrador não volta junto com a conta.
 */
const FORA_DA_RESTAURACAO = [
  'foto',
  'foto_public_id',
  'password_reset_token_hash',
  'password_reset_token_expires_at',
  'email_novo',
  'email_novo_token_hash',
  'email_novo_expira_em',
  'admin',
  'admin_desde',
];

/**
 * Copia a conta e os projetos dela para `contas_excluidas`. Recebe o `client`
 * da transação da exclusão: a cópia e o DELETE acontecem juntos ou nenhum.
 *
 * Com `excluidaPor` (encerramento por administrador), guarda também a linha
 * de `users` em `restauracao` — o que permite restaurar a conta (Termos,
 * seção 5). Na autoexclusão isso não é guardado: ela não pode ser desfeita.
 */
async function arquivarConta(client, userId, { excluidaPor = null, motivo = null } = {}) {
  await client.query(
    `INSERT INTO contas_excluidas
       (usuario_id, email, nome, denuncias, termos_versao, termos_aceitos_em, projetos, arquivos, expira_em,
        excluida_por, motivo, restauracao)
     SELECT u.id, u.email, u.nome, u.denuncias, u.termos_versao, u.termos_aceitos_em,
            COALESCE((
              SELECT jsonb_agg(
                       to_jsonb(p) || jsonb_build_object('imagens', COALESCE((
                         SELECT jsonb_agg(jsonb_build_object('id', i.id, 'url', i.url, 'public_id', i.public_id))
                         FROM imagens i WHERE i.projeto_id = p.id
                       ), '[]'::jsonb))
                       ORDER BY p.criado)
              FROM projetos p WHERE p.usuario_id = u.id
            ), '[]'::jsonb),
            COALESCE((
              SELECT jsonb_agg(arquivo.public_id)
              FROM (
                SELECT p.capa_public_id AS public_id FROM projetos p WHERE p.usuario_id = u.id
                UNION ALL
                SELECT i.public_id FROM imagens i JOIN projetos p ON p.id = i.projeto_id WHERE p.usuario_id = u.id
              ) arquivo
              WHERE arquivo.public_id IS NOT NULL
            ), '[]'::jsonb),
            NOW() + make_interval(months => $2),
            $3::uuid, $4::text,
            CASE WHEN $3::uuid IS NULL THEN NULL ELSE to_jsonb(u) - $5::text[] END
     FROM users u
     WHERE u.id = $1`,
    [userId, TERMOS.retencaoContaExcluidaMeses, excluidaPor, motivo, FORA_DA_RESTAURACAO],
  );
}

/** Colunas NOT NULL que uma cópia antiga pode não ter (criadas depois dela). */
const PADROES_USUARIO = {
  cor: '#1E1E1E',
  likes: [],
  salvos: [],
  reportados: [],
  criadores_reportados: [],
  denuncias: 0,
};
const PADROES_PROJETO = {
  status: 'privado',
  likes: 0,
  denuncias: 0,
  conteudo_versao: 0,
  conteudo: { version: 1, elements: [] },
};

/** Motivos de uma restauração recusada, com a resposta HTTP de cada um. */
const RESTAURACAO_RECUSADA = {
  naoEncontrada: { status: 404, message: 'Conta excluída não encontrada ou já expirada.' },
  autoexclusao: {
    status: 409,
    message: 'Esta conta foi excluída pela própria pessoa e, pelos Termos de Uso, não pode ser reativada.',
  },
  emUso: { status: 409, message: 'O e-mail ou o id desta conta já está em uso por outra conta.' },
};

/**
 * Recria a conta encerrada por administrador a partir da cópia: a linha de
 * `users` (com o mesmo id e a mesma senha), os projetos com o mesmo id e as
 * imagens deles. Os likes que a pessoa tinha dado voltam a contar nos
 * projetos que ainda existem, já que a exclusão os tinha descontado. Por fim
 * a cópia sai de `contas_excluidas`.
 *
 * Roda dentro da transação do `client`. Devolve `{ usuario, projetos }` ou
 * `{ recusa }` com um dos `RESTAURACAO_RECUSADA`.
 *
 * Não volta: a foto (apagada no encerramento), o acesso de administrador, as
 * colaborações em projetos de outras pessoas e os links de compartilhamento.
 */
async function restaurarConta(client, copiaId) {
  const { rows } = await client.query(
    'SELECT * FROM contas_excluidas WHERE id = $1 AND expira_em > NOW() FOR UPDATE',
    [copiaId],
  );
  const copia = rows[0];
  if (!copia) return { recusa: RESTAURACAO_RECUSADA.naoEncontrada };
  if (!copia.restauracao) return { recusa: RESTAURACAO_RECUSADA.autoexclusao };

  const ocupado = await client.query('SELECT 1 FROM users WHERE email = $1 OR id = $2', [
    copia.email,
    copia.usuario_id,
  ]);
  if (ocupado.rows[0]) return { recusa: RESTAURACAO_RECUSADA.emUso };

  const usuario = await client.query(
    `INSERT INTO users
     SELECT * FROM jsonb_populate_record(NULL::users, $1::jsonb || $2::jsonb || '{"admin": false}'::jsonb)
     RETURNING id, email, nome`,
    [PADROES_USUARIO, copia.restauracao],
  );

  const projetos = await client.query(
    `INSERT INTO projetos
     SELECT (jsonb_populate_record(NULL::projetos, $1::jsonb || (p - 'imagens'))).*
     FROM jsonb_array_elements($2::jsonb) p
     RETURNING id`,
    [PADROES_PROJETO, JSON.stringify(copia.projetos)],
  );

  await client.query(
    `INSERT INTO imagens (id, projeto_id, url, public_id)
     SELECT COALESCE((i->>'id')::uuid, gen_random_uuid()), (p->>'id')::uuid, i->>'url', i->>'public_id'
     FROM jsonb_array_elements($1::jsonb) p
     CROSS JOIN LATERAL jsonb_array_elements(COALESCE(p->'imagens', '[]'::jsonb)) i`,
    [JSON.stringify(copia.projetos)],
  );

  // A exclusão descontou os likes que a pessoa deu; eles voltam a contar.
  await client.query(
    `UPDATE projetos SET likes = likes + 1
     WHERE usuario_id <> $1
       AND id::text IN (SELECT jsonb_array_elements_text(likes) FROM users WHERE id = $1)`,
    [copia.usuario_id],
  );

  await client.query('DELETE FROM contas_excluidas WHERE id = $1', [copiaId]);
  return { usuario: usuario.rows[0], projetos: projetos.rowCount };
}

/**
 * Apaga as cópias vencidas e, se o Cloudinary estiver configurado, os
 * arquivos delas. A linha sai mesmo sem o Cloudinary: o prazo prometido nos
 * Termos é sobre o banco, e um arquivo que não pôde ser apagado fica só
 * registrado no aviso. Devolve quantas cópias e arquivos saíram.
 */
async function expurgarContasVencidas({ query, storage }) {
  const result = await query(
    'DELETE FROM contas_excluidas WHERE expira_em <= NOW() RETURNING arquivos',
  );
  const arquivos = result.rows.flatMap((row) => row.arquivos || []);

  if (arquivos.length && !storage.isConfigured) {
    console.warn(
      `Expurgo: ${arquivos.length} arquivo(s) de contas vencidas ficaram no Cloudinary, que não está configurado.`,
    );
    return { contas: result.rowCount, arquivos: 0 };
  }

  const apagados = await Promise.all(
    arquivos.map((publicId) => storage.destroyImage(publicId).then(() => 1, () => 0)),
  );
  return { contas: result.rowCount, arquivos: apagados.reduce((total, ok) => total + ok, 0) };
}

module.exports = { arquivarConta, restaurarConta, expurgarContasVencidas };
