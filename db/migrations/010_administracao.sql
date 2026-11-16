-- Administração: avaliar denúncias (RN-15), excluir obras e contas por má
-- conduta e restaurar contas encerradas pela moderação.
--
-- Administrador é quem tem `users.admin` OU o e-mail de `ADMIN_DONO_EMAIL`
-- (o dono da plataforma). O dono não depende desta coluna: ele vem da
-- configuração, e por isso nenhuma rota consegue tirar o acesso dele.
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS admin BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS admin_desde TIMESTAMPTZ;

-- Avisos que a pessoa vê ao entrar (ex.: "sua história foi excluída por má
-- conduta"). Somem da tela quando ela os marca como lidos.
CREATE TABLE IF NOT EXISTS avisos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  mensagem TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  lido_em TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS avisos_nao_lidos_idx ON avisos (usuario_id) WHERE lido_em IS NULL;

-- Quem encerrou a conta e por quê. `excluida_por` NULL = a própria pessoa,
-- que pelos Termos (seções 5 e 13) não pode ter a conta reativada.
--
-- `restauracao` só existe nas contas encerradas por administrador: a linha
-- de `users` (sem foto e sem token de senha) que permite recriá-la como era.
-- Sem FK em `excluida_por`, como no resto da tabela: o administrador pode ter
-- saído depois.
ALTER TABLE contas_excluidas
  ADD COLUMN IF NOT EXISTS excluida_por UUID,
  ADD COLUMN IF NOT EXISTS motivo TEXT,
  ADD COLUMN IF NOT EXISTS restauracao JSONB;
