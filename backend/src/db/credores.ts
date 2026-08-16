import type { CredorId } from '../dominio/credor.ts';
import type { FaixaParcelamento, RegrasCredor } from '../dominio/faixas.ts';

export interface CredorResumo {
  id: string;
  nome: string;
  ativo: boolean;
  regras: RegrasCredor;
}

function daLinha(l: Record<string, string | number>, faixas: FaixaParcelamento[]): CredorResumo {
  return {
    id: String(l.id),
    nome: String(l.nome),
    ativo: Number(l.ativo) === 1,
    regras: {
      faixas,
      parcelaMinimaCentavos: Number(l.parcela_minima_centavos),
      descontoTetoPct: Number(l.desconto_teto_pct),
      comissaoSobreRecuperadoPct: Number(l.comissao_sobre_recuperado_pct),
    },
  };
}

const COLUNAS =
  'id, nome, ativo, parcela_minima_centavos, desconto_teto_pct, comissao_sobre_recuperado_pct';

async function faixasDe(db: D1Database, credorId: string): Promise<FaixaParcelamento[]> {
  const { results } = await db
    .prepare(
      'SELECT de, ate, desconto_pct FROM faixas_parcelamento WHERE credor_id = ? ORDER BY de',
    )
    .bind(credorId)
    .all<{ de: number; ate: number; desconto_pct: number }>();
  return results.map((f) => ({
    de: Number(f.de),
    ate: Number(f.ate),
    descontoPct: Number(f.desconto_pct),
  }));
}

// A lista de credores nao e dado de carteira: e o menu de escolha do
// operador. Quando houver login de credor, este endpoint devolvera so o
// proprio — a filtragem fica no roteador, junto com o escopo da sessao.
export async function listarCredores(db: D1Database): Promise<CredorResumo[]> {
  const { results } = await db
    .prepare(`SELECT ${COLUNAS} FROM credores WHERE ativo = 1 ORDER BY nome`)
    .all<Record<string, string | number>>();
  // Uma consulta de faixas por credor, e nao um JOIN: sao poucos credores, e
  // agrupar linhas de JOIN a mao daria mais codigo do que economiza.
  return Promise.all(
    results.map(async (l) => daLinha(l, await faixasDe(db, String(l.id)))),
  );
}

export async function lerCredor(db: D1Database, credorId: CredorId): Promise<CredorResumo | null> {
  const l = await db
    .prepare(`SELECT ${COLUNAS} FROM credores WHERE id = ?`)
    .bind(credorId)
    .first<Record<string, string | number>>();
  return l ? daLinha(l, await faixasDe(db, credorId)) : null;
}

export async function salvarRegras(
  db: D1Database,
  credorId: CredorId,
  r: RegrasCredor,
): Promise<void> {
  // Apagar e reinserir, e nao atualizar linha a linha: a lista pode ter
  // ganhado ou perdido faixas, e casar posicoes seria inventar identidade
  // para algo que nao tem. Em lote, para que nao exista instante com o
  // credor sem faixa nenhuma.
  const comandos = [
    db.prepare('DELETE FROM faixas_parcelamento WHERE credor_id = ?').bind(credorId),
    db
      .prepare(
        `UPDATE credores
         SET parcela_minima_centavos = ?, desconto_teto_pct = ?, comissao_sobre_recuperado_pct = ?
         WHERE id = ?`,
      )
      .bind(r.parcelaMinimaCentavos, r.descontoTetoPct, r.comissaoSobreRecuperadoPct, credorId),
    ...r.faixas.map((f) =>
      db
        .prepare(
          'INSERT INTO faixas_parcelamento (credor_id, de, ate, desconto_pct) VALUES (?, ?, ?, ?)',
        )
        .bind(credorId, f.de, f.ate, f.descontoPct),
    ),
  ];

  await db.batch(comandos);
}
