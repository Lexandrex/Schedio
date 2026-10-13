-- Curtir, salvar e denunciar (RF-38, RF-40, RF-39).
--
-- Quem fez o quê mora nos arrays de `users` previstos no modelo de dados
-- (`likes`, `salvos`, `reportados`: ids de projeto em texto). Os contadores
-- moram em `projetos`, para a vitrine não precisar varrer todos os usuários.
--
-- `projetos.likes` já existe (sobe e desce: o like se desfaz). `denuncias`
-- só cresce — uma denúncia não se retira — e serve à avaliação posterior
-- dos projetos reportados (RN-15).
ALTER TABLE projetos
  ADD COLUMN IF NOT EXISTS denuncias INT NOT NULL DEFAULT 0;

-- Fila de avaliação: os mais denunciados primeiro, sem indexar os que não têm denúncia.
CREATE INDEX IF NOT EXISTS projetos_denunciados_idx ON projetos (denuncias DESC) WHERE denuncias > 0;
