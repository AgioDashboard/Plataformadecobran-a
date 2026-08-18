// Modelo de Expected Recovery — spec ia-negociadora-spec.md §4. O motor
// nunca escolhe a oferta com maior chance de "sim" (isso maximiza taxa de
// acordo, nao recuperacao); ele escolhe a de maior recuperacao esperada.
//
// ER(O) = P_aceite(O) * E_recebido(O) * FatorTempo(O) - Custo(O)
// E_recebido(O) = Entrada(O) + soma(Parcela_i * P_pagar_i)
// P_pagar_i = P_honrar_base * S^i        (risco de quebra acumulado)
// FatorTempo(O) = 1 / (1 + d)^(prazo_medio_meses / 12)
// Custo(O) = n_parcelas * custo_por_cobranca_de_lembrete
//
// Os parametros abaixo sao CHUTES CONSERVADORES, documentados como tal —
// a spec (§18, lacuna 1) e explicita: so saem de verdade do historico real
// da carteira. Ate la, servem para comparar estruturas entre si (qual
// tem ER maior), nao para prever o valor absoluto que vai entrar.

export interface ParametrosER {
  // Fracao de acordos fechados que sao honrados na primeira parcela.
  pHonrarBase: number;
  // Fator de sobrevivencia mensal do acordo (0,96 = 4% de quebra por mes).
  sobrevivenciaMensal: number;
  // Custo de capital / desconto temporal ao ano, como fracao.
  descontoTemporalAnual: number;
  // Custo esperado de acompanhamento por parcela (lembrete, cobranca).
  custoPorParcelaCentavos: number;
}

// Chute inicial conservador: 88% honram a 1a parcela, 4% de quebra por mes
// depois disso, custo de capital de 24% a.a. (alto de proposito — dinheiro
// parado em carteira de cobranca tem custo de oportunidade real), e R$ 2,00
// de custo operacional por parcela cobrada (lembrete automatico).
export const PARAMETROS_PADRAO: ParametrosER = {
  pHonrarBase: 0.88,
  sobrevivenciaMensal: 0.96,
  descontoTemporalAnual: 0.24,
  custoPorParcelaCentavos: 200,
};

export interface EstruturaOferta {
  entradaCentavos: number;
  // Uma parcela por posicao no array, em ordem (parcela 1, 2, 3...).
  parcelasCentavos: number[];
  // Probabilidade de o cliente ACEITAR esta estrutura — estimada por fora
  // deste modulo (heuristica sobre sinais da conversa, ou chute por
  // enquanto). O modulo so faz a conta de ER a partir dela.
  pAceite: number;
}

export function calcularER(
  estrutura: EstruturaOferta,
  params: ParametrosER = PARAMETROS_PADRAO,
): number {
  const nParcelas = estrutura.parcelasCentavos.length;

  let recebidoEsperado = estrutura.entradaCentavos;
  for (let i = 0; i < nParcelas; i++) {
    // i=0 e a primeira parcela: nao sofreu decaimento ainda (S^0 = 1).
    const pPagarEssaParcela = params.pHonrarBase * params.sobrevivenciaMensal ** i;
    recebidoEsperado += estrutura.parcelasCentavos[i] * pPagarEssaParcela;
  }

  const prazoMedioMeses = nParcelas === 0 ? 0 : (nParcelas + 1) / 2;
  const fatorTempo = 1 / (1 + params.descontoTemporalAnual) ** (prazoMedioMeses / 12);

  const custo = nParcelas * params.custoPorParcelaCentavos;

  return Math.round(estrutura.pAceite * recebidoEsperado * fatorTempo - custo);
}

// Regra de ouro (spec §4.5): entre ofertas com ER parecido, prazo menor
// vence — menos variancia, menos custo operacional. "Parecido" e definido
// como diferenca menor que 2% do maior ER das duas.
export function melhorOferta(
  candidatas: Array<{ id: string; estrutura: EstruturaOferta }>,
  params: ParametrosER = PARAMETROS_PADRAO,
): { id: string; er: number } | null {
  if (candidatas.length === 0) return null;

  const comER = candidatas.map((c) => ({
    id: c.id,
    er: calcularER(c.estrutura, params),
    nParcelas: c.estrutura.parcelasCentavos.length,
  }));

  let melhor = comER[0];
  for (const atual of comER.slice(1)) {
    const diferencaRelevante = Math.abs(atual.er - melhor.er) > 0.02 * Math.max(atual.er, melhor.er, 1);
    if (atual.er > melhor.er && diferencaRelevante) {
      melhor = atual;
    } else if (!diferencaRelevante && atual.nParcelas < melhor.nParcelas) {
      melhor = atual;
    }
  }
  return { id: melhor.id, er: melhor.er };
}
