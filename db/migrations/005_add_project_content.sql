-- Estado do editor visual (telas, formas, textos e posições).
-- O RFC prevê MongoDB para esse conteúdo; enquanto o MongoDB não é integrado,
-- o documento fica em JSONB no próprio projeto, com o mesmo formato de documento.
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS conteudo JSONB NOT NULL DEFAULT '{"version": 1, "elements": []}'::jsonb;
