-- Todo devedor pertence a exatamente um credor. Duas empresas de formatura
-- podem cobrar a mesma pessoa: sao dois devedores, um em cada carteira.
CREATE TABLE IF NOT EXISTS devedores (
  id TEXT PRIMARY KEY,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  nome TEXT NOT NULL,
  documento TEXT,
  telefone TEXT NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_devedores_credor ON devedores (credor_id, nome);
CREATE INDEX IF NOT EXISTS idx_devedores_telefone ON devedores (telefone);

-- O mesmo documento nao pode entrar duas vezes na mesma carteira. Em
-- carteiras diferentes, pode.
CREATE UNIQUE INDEX IF NOT EXISTS idx_devedores_documento
  ON devedores (credor_id, documento) WHERE documento IS NOT NULL;

CREATE TABLE IF NOT EXISTS dividas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  referencia TEXT NOT NULL,
  valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
  vencimento TEXT NOT NULL,
  situacao TEXT NOT NULL DEFAULT 'aberta'
    CHECK (situacao IN ('aberta', 'negociada', 'paga', 'cancelada')),
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_dividas_credor ON dividas (credor_id, vencimento);
CREATE INDEX IF NOT EXISTS idx_dividas_devedor ON dividas (devedor_id);
