// Pausa global e nao-perturbe, agora no servidor. Na Fase 1 esses estados
// viviam no localStorage e um robo nao os enxergava.

export async function lerPausaGlobal(db: D1Database): Promise<boolean> {
  const linha = await db
    .prepare('SELECT pausado FROM pausa_global WHERE id = 1')
    .first<{ pausado: number }>();
  // Ausencia de linha significa banco nao inicializado: tratar como pausado.
  return linha ? linha.pausado === 1 : true;
}

export async function definirPausaGlobal(
  db: D1Database,
  pausado: boolean,
  por: string,
): Promise<void> {
  const agora = new Date().toISOString();
  await db
    .prepare('UPDATE pausa_global SET pausado = ?, desde = ?, por = ? WHERE id = 1')
    .bind(pausado ? 1 : 0, agora, por)
    .run();
  await registrarAuditoria(db, {
    acao: pausado ? 'pausa-global-ligada' : 'pausa-global-desligada',
    telefone: null,
    detalhe: `por ${por}`,
  });
}

export async function estaSilenciado(db: D1Database, telefone: string): Promise<boolean> {
  const linha = await db
    .prepare('SELECT silenciado FROM nao_perturbe WHERE telefone = ?')
    .bind(telefone)
    .first<{ silenciado: number }>();
  return linha ? linha.silenciado === 1 : false;
}

export async function definirSilencio(
  db: D1Database,
  telefone: string,
  silenciado: boolean,
  motivo: string,
): Promise<void> {
  const agora = new Date().toISOString();
  await db
    .prepare(
      `INSERT INTO nao_perturbe (telefone, silenciado, motivo, quando)
       VALUES (?, ?, ?, ?)
       ON CONFLICT(telefone) DO UPDATE SET silenciado = ?, motivo = ?, quando = ?`,
    )
    .bind(telefone, silenciado ? 1 : 0, motivo, agora, silenciado ? 1 : 0, motivo, agora)
    .run();
  await registrarAuditoria(db, {
    acao: silenciado ? 'nao-perturbe-ligado' : 'nao-perturbe-desligado',
    telefone,
    detalhe: motivo,
  });
}

export interface EventoAuditoria {
  acao: string;
  telefone: string | null;
  detalhe: string;
}

export async function registrarAuditoria(
  db: D1Database,
  evento: EventoAuditoria,
): Promise<void> {
  await db
    .prepare('INSERT INTO auditoria (quando, acao, telefone, detalhe) VALUES (?, ?, ?, ?)')
    .bind(new Date().toISOString(), evento.acao, evento.telefone, evento.detalhe)
    .run();
}
