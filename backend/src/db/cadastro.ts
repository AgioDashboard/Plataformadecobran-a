import type { CredorId } from '../dominio/credor.ts';
import type { OfertaDoDegrau } from '../dominio/negociacao.ts';

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

export interface ContextoDeCobranca {
  dividaId: number;
  nome: string;
  valorCentavos: number;
  vencimento: string;
  estagioNegociacao: number;
  estadoNegociacao: string;
  pedidosHumano: number;
  dataRenda: string | null;
  capacidadeDeclaradaCentavos: number | null;
  // Adendo 1 (18/08), Defeito 1/7: uma vez fechado, o motor para de
  // oferecer desconto e passa a so confirmar esta condicao — sem isto, o
  // fallback (e a propria IA) nao tinham como saber que a negociacao ja
  // tinha terminado, e reabriam a escada do zero.
  valorAcordadoCentavos: number | null;
  parcelasAcordadas: number | null;
  // Defeito 2: conta fallbacks seguidos NESTA divida, para nunca repetir o
  // mesmo texto sem escalar.
  fallbacksConsecutivos: number;
}

// A divida em aberto mais proxima do vencimento, do devedor daquele
// telefone naquela carteira. E o unico dado real que a IA recebe sobre o
// que esta sendo cobrado — sem ela, decidir() cai no "nao informado", que e
// o modo de falha seguro (a IA nunca inventa valor).
export async function contextoDeCobranca(
  db: D1Database,
  credorId: CredorId,
  telefone: string,
): Promise<ContextoDeCobranca | null> {
  const linha = await db
    .prepare(
      `SELECT dv.id AS divida_id, d.nome AS nome, dv.valor_centavos AS valor_centavos,
              dv.vencimento AS vencimento, dv.estagio_negociacao AS estagio_negociacao,
              dv.estado_negociacao AS estado_negociacao, dv.pedidos_humano AS pedidos_humano,
              dv.data_renda AS data_renda, dv.capacidade_declarada_centavos AS capacidade_declarada_centavos,
              dv.valor_acordado_centavos AS valor_acordado_centavos, dv.parcelas_acordadas AS parcelas_acordadas,
              dv.fallbacks_consecutivos AS fallbacks_consecutivos
       FROM devedores d
       JOIN dividas dv ON dv.devedor_id = d.id AND dv.credor_id = d.credor_id
       WHERE d.credor_id = ? AND d.telefone = ? AND dv.situacao = 'aberta'
       ORDER BY dv.vencimento ASC LIMIT 1`,
    )
    .bind(credorId, telefone)
    .first<{
      divida_id: number;
      nome: string;
      valor_centavos: number;
      vencimento: string;
      estagio_negociacao: number;
      estado_negociacao: string;
      pedidos_humano: number;
      data_renda: string | null;
      capacidade_declarada_centavos: number | null;
      valor_acordado_centavos: number | null;
      parcelas_acordadas: number | null;
      fallbacks_consecutivos: number;
    }>();
  if (!linha) return null;
  return {
    dividaId: Number(linha.divida_id),
    nome: linha.nome,
    valorCentavos: Number(linha.valor_centavos),
    vencimento: linha.vencimento,
    estagioNegociacao: Number(linha.estagio_negociacao),
    estadoNegociacao: linha.estado_negociacao,
    pedidosHumano: Number(linha.pedidos_humano),
    dataRenda: linha.data_renda,
    capacidadeDeclaradaCentavos:
      linha.capacidade_declarada_centavos === null ? null : Number(linha.capacidade_declarada_centavos),
    valorAcordadoCentavos:
      linha.valor_acordado_centavos === null ? null : Number(linha.valor_acordado_centavos),
    parcelasAcordadas: linha.parcelas_acordadas === null ? null : Number(linha.parcelas_acordadas),
    fallbacksConsecutivos: Number(linha.fallbacks_consecutivos),
  };
}

// Grava os sinais de descoberta (spec §6.3/§4.4) assim que a IA os extrai
// de uma resposta ja validada — data de renda e capacidade declarada nunca
// autorizam numero nenhum sozinhos, sao insumo para calibrar o modelo de
// recuperacao esperada e para alinhar vencimento de parcela a renda.
export async function registrarDescoberta(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  dados: { dataRenda: string | null; capacidadeDeclaradaCentavos: number | null },
): Promise<void> {
  if (dados.dataRenda === null && dados.capacidadeDeclaradaCentavos === null) return;
  await db
    .prepare(
      `UPDATE dividas
       SET data_renda = COALESCE(?, data_renda),
           capacidade_declarada_centavos = COALESCE(?, capacidade_declarada_centavos)
       WHERE id = ? AND credor_id = ?`,
    )
    .bind(dados.dataRenda, dados.capacidadeDeclaradaCentavos, dividaId, credorId)
    .run();
}

// Regra 1-2-3 (spec §8.13/§13, P11): contagem duravel de quantas vezes o
// cliente pediu humano NESTA divida, atravessando conversas — nao confia
// so no LLM lembrar a contagem a partir de historico que pode ser
// truncado. Devolve a contagem apos incrementar, para quem chama decidir
// se ja bateu 3.
export async function incrementarPedidoHumano(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
): Promise<number> {
  await db
    .prepare(`UPDATE dividas SET pedidos_humano = pedidos_humano + 1 WHERE id = ? AND credor_id = ?`)
    .bind(dividaId, credorId)
    .run();
  const linha = await db
    .prepare(`SELECT pedidos_humano FROM dividas WHERE id = ? AND credor_id = ?`)
    .bind(dividaId, credorId)
    .first<{ pedidos_humano: number }>();
  return linha ? Number(linha.pedidos_humano) : 0;
}

// Escreve o estado da maquina de negociacao (dominio/estados.ts) — so a
// coluna, sem validar a transicao aqui: a granularidade de um turno de
// WhatsApp nao mapeia limpo para todo estagio do fluxo completo (spec §9)
// enquanto nao houver disparo em lote (index.ts::scheduled, hoje
// desligado) fazendo NEW/CONTACTED/DORMANT existirem de verdade. A funcao
// existe para os saltos que o webhook ja sabe reconhecer com seguranca:
// acordo fechado, contestacao/pagamento alegado, e outros motivos de
// escalamento.
export async function definirEstadoNegociacao(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  estado: string,
): Promise<void> {
  await db
    .prepare(`UPDATE dividas SET estado_negociacao = ? WHERE id = ? AND credor_id = ?`)
    .bind(estado, dividaId, credorId)
    .run();
}

// Chamadas depois que uma resposta ja validada foi (ou vai ser) enviada: o
// estagio so avanca quando o campo estruturado grau_apresentado (conferido
// contra os numeros citados na resposta, ver ia/responder.ts) confirmou o
// degrau, e a divida so vira 'negociada' quando o cliente aceitou um valor
// especifico. credor_id no WHERE evita escrever na divida errada.
//
// A oferta em si fica gravada em ofertas_negociacao NO MOMENTO em que o
// avanco e confirmado — o estado da negociacao (para o proximo turno, e
// para qualquer auditoria) sempre le esse registro ou a coluna
// estagio_negociacao, nunca precisa reconstruir "o que foi dito" a partir
// de texto solto.
export async function avancarNegociacao(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  estagio: number,
  oferta: OfertaDoDegrau,
): Promise<void> {
  const agora = new Date().toISOString();
  await db.batch([
    db
      .prepare(`UPDATE dividas SET estagio_negociacao = ? WHERE id = ? AND credor_id = ?`)
      .bind(estagio, dividaId, credorId),
    db
      .prepare(
        `INSERT INTO ofertas_negociacao
          (credor_id, divida_id, degrau, desconto_avista_pct, valor_avista_centavos,
           desconto_parcelado_pct, valor_parcela_centavos, total_parcelado_centavos,
           parcelas, criado_em)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        credorId,
        dividaId,
        oferta.degrau,
        oferta.descontoAVistaPct,
        oferta.valorAVistaCentavos,
        oferta.descontoParceladoPct,
        oferta.valorParcelaCentavos,
        oferta.totalParceladoCentavos,
        oferta.parcelas,
        agora,
      ),
  ]);
}

export async function fecharNegociacao(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  valorAcordadoCentavos: number,
  parcelasAcordadas = 1,
): Promise<void> {
  await db
    .prepare(
      `UPDATE dividas
       SET situacao = 'negociada', valor_acordado_centavos = ?, parcelas_acordadas = ?, fallbacks_consecutivos = 0
       WHERE id = ? AND credor_id = ?`,
    )
    .bind(valorAcordadoCentavos, parcelasAcordadas, dividaId, credorId)
    .run();
}

// Adendo 1, Defeito 2: fallback nunca pode repetir sem consequencia. A
// contagem e SEMPRE desta divida (nao da conversa em memoria, que pode ser
// truncada) — mesma razao pela qual pedidos_humano tambem e duravel.
export async function registrarFallback(
  db: D1Database,
  credorId: CredorId,
  dividaId: number,
  texto: string,
): Promise<number> {
  await db
    .prepare(
      `UPDATE dividas SET fallbacks_consecutivos = fallbacks_consecutivos + 1, ultimo_fallback_texto = ?
       WHERE id = ? AND credor_id = ?`,
    )
    .bind(texto, dividaId, credorId)
    .run();
  const linha = await db
    .prepare(`SELECT fallbacks_consecutivos FROM dividas WHERE id = ? AND credor_id = ?`)
    .bind(dividaId, credorId)
    .first<{ fallbacks_consecutivos: number }>();
  return linha ? Number(linha.fallbacks_consecutivos) : 0;
}

// Qualquer turno que sai SEM fallback quebra a sequencia — e "consecutivos"
// que da o nome ao contador.
export async function resetarFallbacks(db: D1Database, credorId: CredorId, dividaId: number): Promise<void> {
  await db
    .prepare(`UPDATE dividas SET fallbacks_consecutivos = 0 WHERE id = ? AND credor_id = ?`)
    .bind(dividaId, credorId)
    .run();
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
