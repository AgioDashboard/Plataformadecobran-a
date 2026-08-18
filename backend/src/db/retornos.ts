import type { CredorId } from '../dominio/credor.ts';

// Tatica de negociacao "deixa eu verificar, te retorno em instantes": a
// resposta de verdade nao sai no mesmo turno, fica agendada aqui e o cron de
// a cada minuto (whatsapp/webhook.ts::processarRetornosPendentes) e quem
// entrega. Ver migracoes/0011_retornos_pendentes.sql.

export interface RetornoAgendado {
  credorId: CredorId;
  dividaId: number;
  telefone: string;
  texto: string;
  grauApresentado: number | null;
  atrasoMs: number;
}

export async function agendarRetorno(db: D1Database, r: RetornoAgendado): Promise<void> {
  const agora = Date.now();
  await db
    .prepare(
      `INSERT INTO retornos_pendentes
        (credor_id, divida_id, telefone, texto, grau_apresentado, criado_em, enviar_em)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      r.credorId,
      r.dividaId,
      r.telefone,
      r.texto,
      r.grauApresentado,
      new Date(agora).toISOString(),
      new Date(agora + r.atrasoMs).toISOString(),
    )
    .run();
}

export interface RetornoPendente {
  id: number;
  credorId: CredorId;
  dividaId: number | null;
  telefone: string;
  texto: string;
  grauApresentado: number | null;
}

// So os que ja venceram — o cron roda a cada minuto, entao "vencido" aqui
// normalmente significa "ha ate 1 minuto de atraso", nunca mais que isso.
export async function retornosDevidos(db: D1Database, agora: Date): Promise<RetornoPendente[]> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, divida_id, telefone, texto, grau_apresentado
       FROM retornos_pendentes
       WHERE enviado_em IS NULL AND enviar_em <= ?
       ORDER BY enviar_em ASC`,
    )
    .bind(agora.toISOString())
    .all<{
      id: number;
      credor_id: string;
      divida_id: number | null;
      telefone: string;
      texto: string;
      grau_apresentado: number | null;
    }>();
  return results.map((l) => ({
    id: l.id,
    credorId: l.credor_id as CredorId,
    dividaId: l.divida_id,
    telefone: l.telefone,
    texto: l.texto,
    grauApresentado: l.grau_apresentado,
  }));
}

export async function marcarRetornoEnviado(db: D1Database, id: number): Promise<void> {
  await db
    .prepare('UPDATE retornos_pendentes SET enviado_em = ? WHERE id = ?')
    .bind(new Date().toISOString(), id)
    .run();
}
