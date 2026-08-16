import type { CredorId, RegrasCredor } from '../dominio/credor.ts';

export interface CredorResumo {
  id: string;
  nome: string;
  ativo: boolean;
  regras: RegrasCredor;
}

function daLinha(l: Record<string, string | number>): CredorResumo {
  return {
    id: String(l.id),
    nome: String(l.nome),
    ativo: Number(l.ativo) === 1,
    regras: {
      descontoMaximoPct: Number(l.desconto_maximo_pct),
      parcelamentoMaximo: Number(l.parcelamento_maximo),
      comissaoSobreRecuperadoPct: Number(l.comissao_sobre_recuperado_pct),
    },
  };
}

// A lista de credores nao e dado de carteira: e o menu de escolha do
// operador. Quando houver login de credor, este endpoint devolvera so o
// proprio — a filtragem fica no roteador, junto com o escopo da sessao.
export async function listarCredores(db: D1Database): Promise<CredorResumo[]> {
  const { results } = await db
    .prepare(
      `SELECT id, nome, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct
       FROM credores WHERE ativo = 1 ORDER BY nome`,
    )
    .all<Record<string, string | number>>();
  return results.map(daLinha);
}

export async function lerCredor(db: D1Database, credorId: CredorId): Promise<CredorResumo | null> {
  const l = await db
    .prepare(
      `SELECT id, nome, ativo, desconto_maximo_pct, parcelamento_maximo, comissao_sobre_recuperado_pct
       FROM credores WHERE id = ?`,
    )
    .bind(credorId)
    .first<Record<string, string | number>>();
  return l ? daLinha(l) : null;
}

export async function salvarRegras(
  db: D1Database,
  credorId: CredorId,
  r: RegrasCredor,
): Promise<void> {
  await db
    .prepare(
      `UPDATE credores
       SET desconto_maximo_pct = ?, parcelamento_maximo = ?, comissao_sobre_recuperado_pct = ?
       WHERE id = ?`,
    )
    .bind(r.descontoMaximoPct, r.parcelamentoMaximo, r.comissaoSobreRecuperadoPct, credorId)
    .run();
}
