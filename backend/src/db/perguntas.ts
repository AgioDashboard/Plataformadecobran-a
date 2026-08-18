import type { CredorId } from '../dominio/credor.ts';

// Fila de perguntas que a IA sinalizou nao conseguir responder sozinha
// (Adendo 1, Defeito 6) — cartao de credito, Serasa, etc. Existe para que
// uma pergunta nao respondida nunca vire "sumico": ela fica registrada, tem
// prioridade sobre qualquer oferta no proximo turno, e escala para humano
// se aparecer duas vezes sem resposta.

export interface PerguntaAberta {
  tema: string;
  vezes: number;
  criadoEm: string;
}

// Se ja existe uma pergunta em aberto com o mesmo tema, soma 1 em "vezes"
// (mesma pergunta, sem resposta, de novo) em vez de criar outra linha —
// e essa contagem que decide o escalamento em 2x sem resposta.
export async function registrarPerguntaPendente(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  tema: string,
): Promise<void> {
  const existente = await db
    .prepare(
      `SELECT id FROM perguntas_pendentes WHERE divida_id = ? AND credor_id = ? AND tema = ? AND respondida_em IS NULL`,
    )
    .bind(dividaId, credorId, tema)
    .first<{ id: number }>();
  if (existente) {
    await db
      .prepare(`UPDATE perguntas_pendentes SET vezes = vezes + 1 WHERE id = ?`)
      .bind(existente.id)
      .run();
    return;
  }
  await db
    .prepare(
      `INSERT INTO perguntas_pendentes (credor_id, divida_id, tema, vezes, criado_em) VALUES (?, ?, ?, 1, ?)`,
    )
    .bind(credorId, dividaId, tema, new Date().toISOString())
    .run();
}

export async function marcarPerguntaRespondida(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  tema: string,
): Promise<void> {
  await db
    .prepare(
      `UPDATE perguntas_pendentes SET respondida_em = ?
       WHERE divida_id = ? AND credor_id = ? AND tema = ? AND respondida_em IS NULL`,
    )
    .bind(new Date().toISOString(), dividaId, credorId, tema)
    .run();
}

export async function perguntasAbertasDe(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
): Promise<PerguntaAberta[]> {
  const { results } = await db
    .prepare(
      `SELECT tema, vezes, criado_em FROM perguntas_pendentes
       WHERE divida_id = ? AND credor_id = ? AND respondida_em IS NULL
       ORDER BY criado_em ASC`,
    )
    .bind(dividaId, credorId)
    .all<{ tema: string; vezes: number; criado_em: string }>();
  return results.map((l) => ({ tema: l.tema, vezes: Number(l.vezes), criadoEm: l.criado_em }));
}
