// Fase 1, Principio 1: nenhum turno de conversa pode terminar com zero
// mensagens enviadas. Esta funcao e pura de proposito (recebe a chamada a
// IA como callback, nao chama a Anthropic nem o banco diretamente) — e o
// que permite testar "validacao falha 3x, ainda assim sai uma mensagem"
// sem precisar de rede nem de D1 de verdade.
import type { Decisao } from '../ia/responder.ts';
import { validarResposta } from '../ia/responder.ts';
import type { ContextoNegociacao, ValoresPermitidos } from './negociacao.ts';
import { MENSAGEM_ESCALAMENTO, montarFallback } from './negociacao.ts';

const MAX_TENTATIVAS = 3;

export interface ResultadoTurno {
  decisaoFinal: Decisao;
  textoFinal: string;
  // Degrau a gravar em avancarNegociacao, ou null se nenhum foi
  // apresentado. So vem preenchido quando quem decide o texto sabe com
  // certeza qual oferta ele contem: a propria IA (campo estruturado,
  // conferido pelo validador) ou o fallback determinista (o motor escolheu
  // o numero, entao sabe exatamente qual grau usou).
  grauApresentado: number | null;
  tentativas: number;
  viaFallback: boolean;
  motivoFallback: string | null;
}

export async function resolverTurno(
  chamarIA: (motivoRejeicaoAnterior: string | null) => Promise<Decisao>,
  permitido: ValoresPermitidos | null,
  negociacao: ContextoNegociacao | null,
  nomeCliente: string,
  // Adendo 1, Defeito 1: quando a negociacao ja esta fechada (ou noutro
  // estado sem oferta para repetir), quem chama sabe o texto certo — nunca
  // o fallback generico de negociacao, que reabriria uma escada encerrada.
  fallbackOverride?: string,
): Promise<ResultadoTurno> {
  let decisao = await chamarIA(null);
  let validacao = validarResposta(decisao, permitido);
  let tentativas = 1;
  while (!validacao.ok && tentativas < MAX_TENTATIVAS) {
    decisao = await chamarIA(validacao.motivo);
    validacao = validarResposta(decisao, permitido);
    tentativas++;
  }

  if (decisao.motivo_escalar !== 'nenhum') {
    return {
      decisaoFinal: decisao,
      textoFinal: MENSAGEM_ESCALAMENTO,
      grauApresentado: null,
      tentativas,
      viaFallback: false,
      motivoFallback: null,
    };
  }

  if (!validacao.ok) {
    return {
      decisaoFinal: decisao,
      textoFinal: fallbackOverride ?? montarFallback(nomeCliente, negociacao),
      grauApresentado: fallbackOverride
        ? null
        : negociacao
          ? (negociacao.ofertaAtual ?? negociacao.ofertaAbertura).degrau
          : null,
      tentativas,
      viaFallback: true,
      motivoFallback: validacao.motivo,
    };
  }

  return {
    decisaoFinal: decisao,
    textoFinal: decisao.resposta,
    grauApresentado: decisao.grau_apresentado,
    tentativas,
    viaFallback: false,
    motivoFallback: null,
  };
}
