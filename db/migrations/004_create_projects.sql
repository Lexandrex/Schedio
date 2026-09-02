CREATE TABLE IF NOT EXISTS projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT,
  capa TEXT,
  categoria VARCHAR(60),
  likes INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'privado' CHECK (status IN ('privado', 'publicado')),
  criado TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT
);

CREATE INDEX IF NOT EXISTS projetos_publicados_idx ON projetos (criado DESC) WHERE status = 'publicado';
