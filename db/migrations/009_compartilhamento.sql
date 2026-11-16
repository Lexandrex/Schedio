-- Links de visualização e de colaboração (RF-18, RN-17 a RN-20).
--
-- O link em si não fica no banco: guardamos só o SHA-256 do segredo, como os
-- códigos de verificação. O dono vê o link uma vez, ao gerá-lo; quem lê o
-- banco não consegue reconstruí-lo. Como o segredo é aleatório e longo
-- (24 bytes), não precisa de bcrypt: o hash serve de chave de busca.
--
-- Todo link vence (RN-20): `expira_em` é obrigatório. Revogar é apagar a linha.
CREATE TABLE IF NOT EXISTS projeto_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  tipo VARCHAR(20) NOT NULL CHECK (tipo IN ('visualizacao', 'colaboracao')),
  token_hash CHAR(64) NOT NULL UNIQUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS projeto_links_projeto_idx ON projeto_links (projeto_id);

-- Quem aceitou um link de colaboração (os "usuários autorizados" da RN-18).
-- Fica até o dono remover ou a pessoa sair: o prazo é do link, não do acesso.
CREATE TABLE IF NOT EXISTS projeto_colaboradores (
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  adicionado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (projeto_id, usuario_id)
);

-- "Compartilhados comigo" no /editor.
CREATE INDEX IF NOT EXISTS projeto_colaboradores_usuario_idx ON projeto_colaboradores (usuario_id);

-- Com mais de uma pessoa editando, cada gravação do canvas sobe a versão. Quem
-- grava informa a versão que abriu; se outra pessoa salvou no meio, o servidor
-- responde 409 em vez de sobrescrever o trabalho dela em silêncio.
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS conteudo_versao INT NOT NULL DEFAULT 0;
