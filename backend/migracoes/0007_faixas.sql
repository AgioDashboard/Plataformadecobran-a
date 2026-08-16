-- Faixas de parcelamento por credor. Uma linha por faixa, lidas em ordem.
CREATE TABLE IF NOT EXISTS faixas_parcelamento (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL REFERENCES credores (id),
  de INTEGER NOT NULL CHECK (de >= 1),
  ate INTEGER NOT NULL CHECK (ate >= de AND ate <= 60),
  desconto_pct REAL NOT NULL CHECK (desconto_pct >= 0 AND desconto_pct <= 100)
);

CREATE INDEX IF NOT EXISTS idx_faixas_credor ON faixas_parcelamento (credor_id, de);

-- Campos novos. O SQLite nao permite ADD COLUMN NOT NULL sem DEFAULT, e o
-- default aqui e tambem o valor de migracao desejado.
ALTER TABLE credores ADD COLUMN parcela_minima_centavos INTEGER NOT NULL DEFAULT 2000;
ALTER TABLE credores ADD COLUMN desconto_teto_pct REAL NOT NULL DEFAULT 0;

-- O teto de cada credor passa a ser o desconto maximo que ele ja tinha:
-- ninguem ganha nem perde permissao na migracao.
UPDATE credores SET desconto_teto_pct = desconto_maximo_pct;

-- Cada credor existente vira uma faixa unica, 1..parcelamento_maximo, com o
-- desconto que ele ja praticava. Para o credor-padrao (1x, 0%) nada muda.
INSERT INTO faixas_parcelamento (credor_id, de, ate, desconto_pct)
SELECT id, 1, parcelamento_maximo, desconto_maximo_pct FROM credores;

-- desconto_maximo_pct e parcelamento_maximo continuam na tabela, sem uso.
-- Removidos numa migracao futura, depois de confirmado em producao que nada
-- os le: DROP COLUMN no SQLite reescreve a tabela, e nao vale o risco agora.
