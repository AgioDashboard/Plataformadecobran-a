import type { CredorId } from '../dominio/credor.ts';

export interface Mensagem {
  telefone: string;
  credorId: CredorId | null;
  direcao: 'entrada' | 'saida';
  texto: string;
  tipo: 'template' | 'livre';
  origem: 'cliente' | 'ia' | 'humano' | 'sistema';
  idExterno?: string | null;
}

export async function gravarMensagem(db: D1Database, m: Mensagem): Promise<void> {
  await db
    .prepare(
      `INSERT INTO conversas
        (telefone, credor_id, direcao, texto, tipo, quando, id_externo, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      m.telefone,
      // Telefone que ainda nao esta em nenhuma carteira, ou que esta em
      // duas, grava sem credor. Some do painel de credor e aparece so na
      // visao do operador — que e onde alguem precisa resolver o caso.
      m.credorId ?? 'sem-credor',
      m.direcao,
      m.texto,
      m.tipo,
      new Date().toISOString(),
      m.idExterno ?? null,
      m.origem,
    )
    .run();
}

export async function ultimaEntradaDe(
  db: D1Database,
  telefone: string,
): Promise<string | null> {
  const linha = await db
    .prepare(
      `SELECT quando FROM conversas
       WHERE telefone = ? AND direcao = 'entrada'
       ORDER BY quando DESC LIMIT 1`,
    )
    .bind(telefone)
    .first<{ quando: string }>();
  return linha?.quando ?? null;
}

export async function conversaDe(
  db: D1Database,
  credorId: CredorId,
  telefone: string,
  limite = 20,
): Promise<Array<{ direcao: string; texto: string; quando: string; origem: string }>> {
  const { results } = await db
    .prepare(
      `SELECT direcao, texto, quando, origem FROM conversas
       WHERE credor_id = ? AND telefone = ? ORDER BY quando DESC LIMIT ?`,
    )
    .bind(credorId, telefone, limite)
    .all<{ direcao: string; texto: string; quando: string; origem: string }>();
  return results.reverse();
}

export async function conversasDoCredor(
  db: D1Database,
  credorId: CredorId,
  limite = 200,
): Promise<Array<Record<string, unknown>>> {
  const { results } = await db
    .prepare(
      `SELECT telefone, credor_id, direcao, texto, quando, origem FROM conversas
       WHERE credor_id = ? ORDER BY quando DESC LIMIT ?`,
    )
    .bind(credorId, limite)
    .all();
  return results;
}
