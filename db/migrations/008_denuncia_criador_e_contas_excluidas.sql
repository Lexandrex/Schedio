-- Denunciar um criador, no mesmo molde da denúncia de projeto (006):
-- quem denunciou fica num array de `users` (ids em texto) e o total, que só
-- cresce, fica na própria conta denunciada.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS criadores_reportados JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS denuncias INT NOT NULL DEFAULT 0;

-- Fila de avaliação: os criadores mais denunciados primeiro.
CREATE INDEX IF NOT EXISTS users_denunciados_idx ON users (denuncias DESC) WHERE denuncias > 0;

-- Cópia do estado de uma conta no momento em que foi excluída: quem era e
-- cada projeto dela, com conteúdo, status, contadores e imagens. Fica pelo
-- prazo dos Termos de Uso (`TERMOS.retencaoContaExcluidaMeses`) e é apagada
-- no expurgo, junto com os arquivos no Cloudinary.
--
-- Sem FK de propósito: a linha em `users` já não existe, e o e-mail fica
-- livre para um cadastro novo. `usuario_id` é o id que a conta tinha, o que
-- liga esta cópia às denúncias e aos registros feitos antes da exclusão.
CREATE TABLE IF NOT EXISTS contas_excluidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL,
  email VARCHAR(255) NOT NULL,
  nome VARCHAR(80),
  denuncias INT NOT NULL DEFAULT 0,
  termos_versao VARCHAR(10),
  termos_aceitos_em TIMESTAMPTZ,
  projetos JSONB NOT NULL DEFAULT '[]'::jsonb,
  -- `public_id` de capas e imagens no Cloudinary, apagados no expurgo.
  arquivos JSONB NOT NULL DEFAULT '[]'::jsonb,
  excluida_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expira_em TIMESTAMPTZ NOT NULL
);

CREATE INDEX IF NOT EXISTS contas_excluidas_expira_idx ON contas_excluidas (expira_em);
