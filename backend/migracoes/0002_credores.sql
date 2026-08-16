-- Um credor e uma empresa de formatura que nos entrega uma carteira.
-- As regras comerciais moram aqui porque variam de contrato para contrato.
--
-- A comissao incide sobre o VALOR RECUPERADO, nao sobre o valor da divida:
-- a assessoria so ganha quando recupera. O nome da coluna carrega isso
-- porque um dia alguem vai calcular comissao lendo so o schema. Nada
-- calcula comissao nesta fase — ainda nao existe registro de pagamento.
CREATE TABLE IF NOT EXISTS credores (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  documento TEXT,
  ativo INTEGER NOT NULL DEFAULT 1,
  desconto_maximo_pct REAL NOT NULL DEFAULT 0 CHECK (desconto_maximo_pct >= 0 AND desconto_maximo_pct <= 100),
  parcelamento_maximo INTEGER NOT NULL DEFAULT 1 CHECK (parcelamento_maximo >= 1 AND parcelamento_maximo <= 60),
  comissao_sobre_recuperado_pct REAL NOT NULL DEFAULT 0 CHECK (comissao_sobre_recuperado_pct >= 0 AND comissao_sobre_recuperado_pct <= 100),
  criado_em TEXT NOT NULL
);

-- Credor padrao: destino de tudo que existe hoje. Regras zeradas de
-- proposito — desconto so passa a existir quando alguem configurar.
INSERT OR IGNORE INTO credores
  (id, nome, documento, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct, criado_em)
VALUES
  ('credor-padrao', 'Carteira inicial', NULL, 1, 0, 1, 0, '2026-08-16T00:00:00.000Z');
