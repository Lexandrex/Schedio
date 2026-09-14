CREATE TABLE IF NOT EXISTS projetos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  titulo VARCHAR(160) NOT NULL,
  descricao TEXT,
  capa TEXT,
  categoria VARCHAR(60),
  likes INT NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'privado' CHECK (status IN ('privado', 'publicado')),
  criado TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- Documento do editor visual (telas, elementos, ligações). O RFC prevê
  -- MongoDB para isso; enquanto não é integrado, fica aqui no mesmo formato.
  conteudo JSONB NOT NULL DEFAULT '{"version": 1, "elements": []}'::jsonb,
  -- Necessário para apagar a capa no Cloudinary ao trocá-la ou excluir o projeto.
  capa_public_id TEXT
);

-- Listagem da tela inicial: só projetos publicados, mais recentes primeiro.
CREATE INDEX IF NOT EXISTS projetos_publicados_idx ON projetos (criado DESC) WHERE status = 'publicado';
