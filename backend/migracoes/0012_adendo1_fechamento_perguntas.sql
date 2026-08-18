-- Adendo 1 (18/08): fecha a negociacao quando o cliente aceita a oferta ja
-- apresentada (nao so quando propoe um valor proprio), evita repetir o
-- mesmo fallback sem escalar, e da lugar para perguntas que a IA nao pode
-- responder sozinha (cartao de credito, Serasa etc.) sem cair no fallback
-- de oferta.

ALTER TABLE dividas ADD COLUMN parcelas_acordadas INTEGER;
ALTER TABLE dividas ADD COLUMN fallbacks_consecutivos INTEGER NOT NULL DEFAULT 0;
ALTER TABLE dividas ADD COLUMN ultimo_fallback_texto TEXT;

CREATE TABLE IF NOT EXISTS perguntas_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL,
  divida_id INTEGER NOT NULL,
  tema TEXT NOT NULL,
  vezes INTEGER NOT NULL DEFAULT 1,
  criado_em TEXT NOT NULL,
  respondida_em TEXT
);

CREATE INDEX IF NOT EXISTS idx_perguntas_pendentes_divida ON perguntas_pendentes (divida_id, respondida_em);
