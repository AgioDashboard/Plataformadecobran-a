export interface Mensagem {
  telefone: string;
  direcao: 'entrada' | 'saida';
  texto: string;
  tipo: 'template' | 'livre';
  origem: 'cliente' | 'ia' | 'humano' | 'sistema';
  idExterno?: string | null;
}

export async function gravarMensagem(db: D1Database, m: Mensagem): Promise<void> {
  await db
    .prepare(
      `INSERT INTO conversas (telefone, direcao, texto, tipo, quando, id_externo, origem)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .bind(
      m.telefone,
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
  telefone: string,
  limite = 20,
): Promise<Array<{ direcao: string; texto: string; quando: string; origem: string }>> {
  const { results } = await db
    .prepare(
      `SELECT direcao, texto, quando, origem FROM conversas
       WHERE telefone = ? ORDER BY quando DESC LIMIT ?`,
    )
    .bind(telefone, limite)
    .all<{ direcao: string; texto: string; quando: string; origem: string }>();
  return results.reverse();
}
