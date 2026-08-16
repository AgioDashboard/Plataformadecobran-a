-- Um devedor tem ate 5 telefones. O credor_id e repetido aqui, e nao so
-- herdado do devedor, para que toda consulta possa filtrar carteira
-- diretamente — e o mesmo motivo da tabela de dividas.
CREATE TABLE IF NOT EXISTS telefones (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  credor_id TEXT NOT NULL REFERENCES credores (id),
  numero TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'desconhecido'
    CHECK (status IN ('desconhecido', 'tem_whatsapp', 'sem_whatsapp', 'invalido')),
  prioridade INTEGER NOT NULL,
  ultima_tentativa TEXT,
  ultimo_motivo TEXT,
  criado_em TEXT NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_telefones_unicos ON telefones (devedor_id, numero);
CREATE INDEX IF NOT EXISTS idx_telefones_fila ON telefones (devedor_id, prioridade);
CREATE INDEX IF NOT EXISTS idx_telefones_numero ON telefones (numero);

-- Uma tentativa por vez, por devedor. O id_externo e o wamid devolvido
-- pela Meta no envio: e por ele que o recibo volta ao telefone certo.
CREATE TABLE IF NOT EXISTS tentativas_contato (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  devedor_id TEXT NOT NULL REFERENCES devedores (id),
  credor_id TEXT NOT NULL REFERENCES credores (id),
  telefone_id INTEGER NOT NULL REFERENCES telefones (id),
  id_externo TEXT NOT NULL,
  aberta_em TEXT NOT NULL,
  fechada_em TEXT,
  desfecho TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_tentativas_externo ON tentativas_contato (id_externo);
CREATE INDEX IF NOT EXISTS idx_tentativas_abertas
  ON tentativas_contato (devedor_id, fechada_em);

-- Backfill: o telefone unico que cada devedor tem hoje vira o telefone de
-- prioridade 100. A classificacao real acontece na primeira execucao do
-- cron; aqui nao da para chamar codigo TypeScript.
INSERT OR IGNORE INTO telefones (devedor_id, credor_id, numero, status, prioridade, criado_em)
SELECT id, credor_id, telefone, 'desconhecido', 100, '2026-08-16T00:00:00.000Z'
FROM devedores;
