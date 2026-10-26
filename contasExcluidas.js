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
 * Copia a conta e os projetos dela para `contas_excluidas`. Recebe o `client`
 * da transação da exclusão: a cópia e o DELETE acontecem juntos ou nenhum.
 */
async function arquivarConta(client, userId) {
  await client.query(
    `INSERT INTO contas_excluidas
       (usuario_id, email, nome, denuncias, termos_versao, termos_aceitos_em, projetos, arquivos, expira_em)
     SELECT u.id, u.email, u.nome, u.denuncias, u.termos_versao, u.termos_aceitos_em,
            COALESCE((
              SELECT jsonb_agg(
                       to_jsonb(p) || jsonb_build_object('imagens', COALESCE((
                         SELECT jsonb_agg(jsonb_build_object('url', i.url, 'public_id', i.public_id))
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
            NOW() + make_interval(months => $2)
     FROM users u
     WHERE u.id = $1`,
    [userId, TERMOS.retencaoContaExcluidaMeses],
  );
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

module.exports = { arquivarConta, expurgarContasVencidas };
