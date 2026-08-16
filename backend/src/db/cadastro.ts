import type { CredorId } from '../dominio/credor.ts';

export interface Devedor {
  id: string;
  credorId: CredorId;
  nome: string;
  documento: string | null;
  telefone: string;
  criadoEm: string;
}

export interface Divida {
  id: number;
  credorId: CredorId;
  devedorId: string;
  referencia: string;
  valorCentavos: number;
  vencimento: string;
  situacao: 'aberta' | 'negociada' | 'paga' | 'cancelada';
}

// Nenhuma funcao deste modulo aceita credorId opcional. Nao existe
// "listar tudo": quem precisa de visao geral pede carteira por carteira.
export async function inserirDevedor(
  db: D1Database,
  credorId: CredorId,
  d: { nome: string; documento: string | null; telefone: string },
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .prepare(
      `INSERT INTO devedores (id, credor_id, nome, documento, telefone, criado_em)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .bind(id, credorId, d.nome, d.documento, d.telefone, new Date().toISOString())
    .run();
  return id;
}

export async function listarDevedores(
  db: D1Database,
  credorId: CredorId,
  limite = 500,
): Promise<Devedor[]> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, nome, documento, telefone, criado_em
       FROM devedores WHERE credor_id = ? ORDER BY nome LIMIT ?`,
    )
    .bind(credorId, limite)
    .all<Record<string, string>>();
  return results.map((l) => ({
    id: l.id,
    credorId: l.credor_id as CredorId,
    nome: l.nome,
    documento: l.documento ?? null,
    telefone: l.telefone,
    criadoEm: l.criado_em,
  }));
}

export async function inserirDivida(
  db: D1Database,
  credorId: CredorId,
  devedorId: string,
  d: { referencia: string; valorCentavos: number; vencimento: string },
): Promise<void> {
  // O devedor_id vem junto do credor_id no WHERE do SELECT de conferencia:
  // gravar divida num devedor de outra carteira seria vazamento silencioso.
  const dono = await db
    .prepare('SELECT id FROM devedores WHERE id = ? AND credor_id = ?')
    .bind(devedorId, credorId)
    .first<{ id: string }>();
  if (!dono) throw new Error('devedor nao pertence a este credor');

  await db
    .prepare(
      `INSERT INTO dividas
        (credor_id, devedor_id, referencia, valor_centavos, vencimento, situacao, criado_em)
       VALUES (?, ?, ?, ?, ?, 'aberta', ?)`,
    )
    .bind(credorId, devedorId, d.referencia, d.valorCentavos, d.vencimento, new Date().toISOString())
    .run();
}

export async function listarDividas(
  db: D1Database,
  credorId: CredorId,
  limite = 500,
): Promise<Divida[]> {
  const { results } = await db
    .prepare(
      `SELECT id, credor_id, devedor_id, referencia, valor_centavos, vencimento, situacao
       FROM dividas WHERE credor_id = ? ORDER BY vencimento LIMIT ?`,
    )
    .bind(credorId, limite)
    .all<Record<string, string | number>>();
  return results.map((l) => ({
    id: Number(l.id),
    credorId: String(l.credor_id) as CredorId,
    devedorId: String(l.devedor_id),
    referencia: String(l.referencia),
    valorCentavos: Number(l.valor_centavos),
    vencimento: String(l.vencimento),
    situacao: String(l.situacao) as Divida['situacao'],
  }));
}

// O webhook recebe um telefone, nao um credor. Se o mesmo telefone estiver
// em duas carteiras, nao ha como saber de quem e a conversa — devolve null
// e quem chamou registra o caso em vez de chutar.
export async function credorDoTelefone(
  db: D1Database,
  telefone: string,
): Promise<CredorId | null> {
  const { results } = await db
    .prepare('SELECT DISTINCT credor_id FROM devedores WHERE telefone = ? LIMIT 2')
    .bind(telefone)
    .all<{ credor_id: string }>();
  if (results.length !== 1) return null;
  return results[0].credor_id as CredorId;
}
