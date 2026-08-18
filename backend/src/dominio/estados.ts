// Maquina de estados da negociacao — spec ia-negociadora-spec.md §9.
// Pura e determinista: decide quais transicoes sao validas, nunca decide
// SE uma transicao deve acontecer (isso e responsabilidade de quem chama,
// olhando a conversa e o resultado da validacao). NEW/CONTACTED/DORMANT
// so fazem sentido quando existir disparo em lote (cron ainda desligado,
// ver index.ts::scheduled) — o fluxo reativo de hoje entra direto em
// ENGAGED quando o cliente responde pela primeira vez.

export const ESTADOS = [
  'NEW',
  'CONTACTED',
  'ENGAGED',
  'DISCOVERY',
  'OFFER',
  'NEGOTIATING',
  'COUNTER_OFFER',
  'AGREEMENT',
  'PAYMENT_PENDING',
  'PAID',
  'BROKEN_PROMISE',
  'DORMANT',
  'DISPUTED',
  'ESCALATED',
  'STALLED',
] as const;

export type EstadoNegociacao = (typeof ESTADOS)[number];

// Estados em que a IA para de negociar por completo — a conversa so
// retoma por acao humana (ou, no caso de PAID, ja terminou bem).
export const ESTADOS_FORA_DO_ESCOPO_DA_IA = new Set<EstadoNegociacao>([
  'DISPUTED',
  'ESCALATED',
  'PAID',
]);

const TRANSICOES: Record<EstadoNegociacao, EstadoNegociacao[]> = {
  NEW: ['CONTACTED'],
  CONTACTED: ['ENGAGED', 'DORMANT'],
  ENGAGED: ['DISPUTED', 'ESCALATED', 'DISCOVERY'],
  DISCOVERY: ['OFFER'],
  OFFER: ['AGREEMENT', 'COUNTER_OFFER', 'NEGOTIATING', 'DISPUTED', 'ESCALATED'],
  NEGOTIATING: ['OFFER', 'STALLED', 'COUNTER_OFFER', 'DISPUTED', 'ESCALATED'],
  COUNTER_OFFER: ['AGREEMENT', 'OFFER', 'STALLED', 'DISPUTED', 'ESCALATED'],
  AGREEMENT: ['PAYMENT_PENDING'],
  PAYMENT_PENDING: ['PAID', 'BROKEN_PROMISE', 'NEGOTIATING'],
  PAID: [],
  BROKEN_PROMISE: ['ENGAGED'],
  DORMANT: ['ENGAGED'],
  DISPUTED: [],
  ESCALATED: [],
  STALLED: ['NEGOTIATING', 'DISPUTED', 'ESCALATED'],
};

export function transicaoValida(de: EstadoNegociacao, para: EstadoNegociacao): boolean {
  // Regra inegociavel 1: nunca ir de ENGAGED direto para OFFER sem passar
  // por DISCOVERY. Ja garantida por TRANSICOES nao listar OFFER a partir
  // de ENGAGED — mas escrita aqui tambem, de forma explicita, porque e a
  // trava anti-"IA dispara desconto sem entender nada" e nao pode
  // depender so de alguem manter o mapa acima em dia.
  if (de === 'ENGAGED' && para === 'OFFER') return false;

  return TRANSICOES[de]?.includes(para) ?? false;
}

// Regra inegociavel 2: nunca voltar de AGREEMENT (ou de qualquer estado
// pos-acordo) para negociacao com condicao MELHOR que a acordada. Este
// modulo nao conhece "condicao" (isso e do motor de concessao), entao a
// funcao so bloqueia a transicao de estado; quem chama e responsavel por
// nunca calcular uma oferta melhor ao entrar em NEGOTIATING vindo de
// PAYMENT_PENDING (ver dominio/negociacao.ts — o degrau nunca regride).
export function podeRenegociarAposAcordo(estadoAtual: EstadoNegociacao): boolean {
  return estadoAtual === 'PAYMENT_PENDING';
}

// Regra inegociavel 3: DISPUTED e absorvente para a IA — uma vez la, ela
// nao negocia mais ate liberacao humana (que muda o estado por fora desta
// maquina, manualmente, no painel).
export function estaAbsorvente(estado: EstadoNegociacao): boolean {
  return ESTADOS_FORA_DO_ESCOPO_DA_IA.has(estado) || estado === 'DORMANT';
}

export function proximoEstadoAposContatoSemResposta(
  tentativas: number,
): EstadoNegociacao {
  return tentativas >= 4 ? 'DORMANT' : 'CONTACTED';
}
