-- Fase 2 (ia-negociadora-spec.md): maquina de estados, descoberta e
-- contagem durável do pedido de humano.
--
-- estado_negociacao comeca em 'ENGAGED' para dividas ja existentes: o
-- fluxo de hoje e reativo (cliente escreve primeiro), entao NEW/CONTACTED
-- (que so existem quando ha disparo em lote, ainda desligado) nunca se
-- aplicam a registros ja em carteira.
ALTER TABLE dividas ADD COLUMN estado_negociacao TEXT NOT NULL DEFAULT 'ENGAGED';

-- Contagem durável de quantas vezes o cliente pediu para falar com um
-- humano NESTA divida, atravessada por conversas — nao confia so no LLM
-- lembrar a contagem a partir do historico truncado. Regra 1-2-3 (spec
-- §8.13/§13): na 3a vez, transfere sempre.
ALTER TABLE dividas ADD COLUMN pedidos_humano INTEGER NOT NULL DEFAULT 0;

-- Dado de descoberta (spec §6.3): data em que entra a proxima renda do
-- devedor, e o valor que ele declarou conseguir pagar. Nao sao a fonte de
-- verdade do que o motor pode ofertar (isso continua sendo o teto do
-- credor) — sao insumo para a proxima rodada de calibracao do modelo de
-- Expected Recovery (spec §4.4).
ALTER TABLE dividas ADD COLUMN data_renda TEXT;
ALTER TABLE dividas ADD COLUMN capacidade_declarada_centavos INTEGER;
