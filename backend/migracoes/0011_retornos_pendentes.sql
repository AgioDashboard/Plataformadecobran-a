-- Tatica de negociacao: "deixa eu verificar, te retorno em instantes" antes
-- de responder a um pedido maior (avancar degrau, mais parcelas,
-- contraproposta que nao cabe). A mensagem com a resposta de verdade fica
-- agendada aqui e sai pelo cron de a cada minuto (webhook.ts::
-- processarRetornosPendentes), nao no mesmo turno — sem isso a IA
-- responderia na hora, sem nenhum efeito de espera.
CREATE TABLE IF NOT EXISTS retornos_pendentes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  credor_id TEXT NOT NULL,
  divida_id INTEGER,
  telefone TEXT NOT NULL,
  texto TEXT NOT NULL,
  grau_apresentado INTEGER,
  criado_em TEXT NOT NULL,
  enviar_em TEXT NOT NULL,
  enviado_em TEXT
);

-- A fila do cron sempre busca "nao enviados, na hora ou atrasados" — indice
-- casa exatamente com essa consulta.
CREATE INDEX IF NOT EXISTS idx_retornos_pendentes_fila ON retornos_pendentes (enviado_em, enviar_em);
