-- Fase 1, Principio 2: o estado da negociacao nao pode mais depender de
-- reler com regex a prosa que a propria IA escreveu. Cada vez que o motor
-- confirma que um degrau foi de fato apresentado (grau_apresentado, campo
-- estruturado da decisao, cruzado contra os numeros que a resposta
-- realmente citou), o valor concedido fica gravado aqui, junto do timestamp
-- e de todos os numeros daquele degrau -- registro de auditoria da
-- concessao, independente do texto livre da conversa.
CREATE TABLE IF NOT EXISTS ofertas_negociacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL,
  divida_id INTEGER NOT NULL,
  degrau INTEGER NOT NULL,
  desconto_avista_pct INTEGER NOT NULL,
  valor_avista_centavos INTEGER NOT NULL,
  desconto_parcelado_pct INTEGER NOT NULL,
  valor_parcela_centavos INTEGER NOT NULL,
  total_parcelado_centavos INTEGER NOT NULL,
  parcelas INTEGER NOT NULL,
  criado_em TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ofertas_negociacao_divida
  ON ofertas_negociacao (divida_id, criado_em DESC);

-- Status de entrega vindo do webhook assincrono da Meta (statuses[]).
-- 'sent' so significa que a Meta aceitou a chamada; sem isso, uma mensagem
-- que falhou a entrega de verdade ficava registrada como sucesso para
-- sempre (ponto 6 da AUDITORIA.md).
ALTER TABLE conversas ADD COLUMN status_entrega TEXT;
ALTER TABLE conversas ADD COLUMN erro_entrega TEXT;
