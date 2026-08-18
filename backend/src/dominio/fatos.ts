// Fatos que a IA pode afirmar sem inventar (Adendo 1, Defeito 3): forma de
// pagamento, disponibilidade de cartao, prazo de baixa no Serasa. Sem isso,
// uma pergunta fora de OFERTAS_LIBERADAS (ex.: "aceita cartao?") nao tinha
// nenhum numero/fato autorizado para responder, e a tentativa da IA de
// responder mesmo assim caia sempre no validador — indistinguivel, do lado
// de fora, de "a negociacao travou".
//
// Estatico por enquanto (sem tela propria no painel): mesma logica de
// dominio/negociacao.ts — o motor entrega pronto, a IA nunca decide sozinha
// o que esta ou nao disponivel.
export interface FatosLiberados {
  formasPagamentoAceitas: string[];
  cartaoCreditoDisponivel: boolean;
  prazoBaixaSerasaDias: number;
  condicaoBaixa: string;
}

export const FATOS_PADRAO: FatosLiberados = {
  formasPagamentoAceitas: ['pix', 'boleto', 'cartao'],
  // O botao "Pagar com cartao" gera um link ficticio (dominio/pagamento.ts)
  // depois que um acordo fecha — a mesma logica do PIX/boleto: so afirma
  // disponivel porque ha ferramenta de verdade por tras (Adendo 1, Defeito
  // 5), mesmo sendo ambiente de teste.
  cartaoCreditoDisponivel: true,
  prazoBaixaSerasaDias: 5,
  condicaoBaixa: 'apos compensacao da primeira parcela',
};

export function blocoFatosLiberados(fatos: FatosLiberados): string {
  return JSON.stringify({
    formas_pagamento_aceitas: fatos.formasPagamentoAceitas,
    cartao_credito_disponivel: fatos.cartaoCreditoDisponivel,
    prazo_baixa_serasa_dias: fatos.prazoBaixaSerasaDias,
    condicao_baixa: fatos.condicaoBaixa,
  });
}
