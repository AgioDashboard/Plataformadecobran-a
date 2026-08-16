-- SQLite nao permite ADD COLUMN NOT NULL sem DEFAULT. O default e o credor
-- padrao, que e exatamente o backfill desejado: tudo que existe hoje
-- pertence a carteira inicial.
ALTER TABLE conversas ADD COLUMN credor_id TEXT NOT NULL DEFAULT 'credor-padrao';
ALTER TABLE auditoria ADD COLUMN credor_id TEXT;

CREATE INDEX IF NOT EXISTS idx_conversas_credor ON conversas (credor_id, quando DESC);

-- nao_perturbe e pausa_global NAO ganham credor_id, de proposito. Todos os
-- credores sao cobrados pelo mesmo numero de WhatsApp: quem pediu para
-- parar pediu para nos, nao para um credor. Ver "Decisoes de projeto".
