-- Guardamos só a URL pública e o `public_id` do Cloudinary; o arquivo mora lá.
CREATE TABLE IF NOT EXISTS imagens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  projeto_id UUID NOT NULL REFERENCES projetos(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  public_id TEXT
);
