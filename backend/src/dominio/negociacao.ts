// Motor de negociacao progressiva. Puro e determinista de proposito: a IA
// nunca calcula desconto, ela so recebe os numeros que este modulo produz e
// os apresenta. Ver "Decisoes de projeto" — decisao de 2026-08-18.
//
// Degrau 0 = nenhuma oferta feita ainda. A primeira oferta (degrau 1) e
// sempre metade do teto: a IA nunca abre no maximo, e nunca revela que ha
// mais margem alem do degrau atual — essa instrucao vive no prompt, nao
// aqui, mas o motor e o que torna possivel cumpri-la: ele so entrega, a
// cada turno, o numero daquele degrau, nunca a lista inteira.

import { calcularER } from './expected-recovery.ts';
import type { EstruturaOferta } from './expected-recovery.ts';
import { gerarOfertas } from './ofertas.ts';
import type { RegrasCredor } from './faixas.ts';

export const DEGRAU_MAXIMO = 3;
// Fase 2 (spec §5.1/5.2): incrementos DECRESCENTES entre degraus, nao
// constantes — sinaliza "estou chegando no fim" sem a IA precisar afirmar
// isso. Para teto 30: 15% -> 24% -> 30% (incrementos 15, 9, 6).
const MULTIPLICADORES = [0.5, 0.8, 1.0] as const;

// Entrada minima exigida como contrapartida de cada degrau (spec §5.1):
// degrau 1 flexivel (entrada OU poucas parcelas, sem piso fixo), degrau 2
// exige entrada >= 20% do valor da oferta, degrau 3 exige entrada maior e
// data definida.
const ENTRADA_MINIMA_PCT = [0, 0.2, 0.3] as const;

// Chute conservador de probabilidade de aceite por degrau, so para
// alimentar o modelo de ER (spec §4) enquanto nao ha historico real
// calibrado (spec §18, lacuna 1) — documentado como estimativa, nunca
// tratado como medicao.
const P_ACEITE_AVISTA_POR_DEGRAU = [0.25, 0.45, 0.65] as const;
const BONUS_P_ACEITE_PARCELADO = 0.15;

// Parcelamento desta negociacao e distinto das faixas de parcelamento do
// credor (que descrevem uma tabela comercial estatica, configuravel no
// painel). Aqui o parcelamento e sempre a mesma proposta — poucas parcelas
// primeiro, porque mais parcelas atrasa o caixa do mes — com desconto menor
// que o a vista do mesmo degrau.
export const PARCELAS_DA_NEGOCIACAO = 2;
const FATOR_DESCONTO_PARCELADO = 0.6;

// O cliente pode pedir para esticar o prazo alem das PARCELAS_DA_NEGOCIACAO
// (2x). Isso nunca sai por iniciativa da IA (spec: nenhuma concessao
// gratuita) — so quando ele pede explicitamente. O desconto dessas parcelas
// extras vem da MESMA tabela de faixas de parcelamento que o credor ja
// configura no painel (dominio/faixas.ts + ofertas.ts) — e a autoautorizacao
// de autoatendimento do devedor no portal, entao usar numero diferente aqui
// criaria duas fontes de verdade para "quanto desconto vale N parcelas".
export const PARCELAS_EXTRAS = [3, 4] as const;

export interface OfertaParcelasExtra {
  parcelas: number;
  descontoPct: number;
  valorParcelaCentavos: number;
  totalCentavos: number;
  erCentavos: number;
}

export interface OfertaDoDegrau {
  degrau: number;
  descontoAVistaPct: number;
  valorAVistaCentavos: number;
  descontoParceladoPct: number;
  parcelas: number;
  valorParcelaCentavos: number;
  totalParceladoCentavos: number;
  // Contrapartida exigida por este degrau (spec §5.1/5.2: toda concessao e
  // vinculada a algo real, nunca gratuita).
  entradaMinimaCentavos: number;
  // Recuperacao esperada de cada estrutura, calculada por
  // dominio/expected-recovery.ts — grava-se para auditoria/calibracao
  // futura (spec §4.4: cada conversa deve virar feature para a proxima).
  erAVistaCentavos: number;
  erParceladoCentavos: number;
  // Opcoes de mais parcelas (3x, 4x) com desconto reduzido — so para o
  // cliente que pede explicitamente prazo maior que o parcelamento padrao.
  parceladoEstendido: OfertaParcelasExtra[];
}

export interface AvaliacaoContraproposta {
  aceitar: boolean;
  // Presente so quando aceitar e true: e o valor que o cliente propos,
  // porque aceitar significa honrar exatamente o que ele ofereceu, nao
  // arredondar para a oferta mais proxima.
  valorAceitoCentavos: number | null;
  // Degrau a usar na PROXIMA oferta, se a proposta nao coube. Nunca
  // ultrapassa DEGRAU_MAXIMO — no teto, so resta reapresentar o mesmo
  // degrau com firmeza, o prompt cuida do tom.
  proximoDegrau: number;
}

function arredondarPct(pct: number): number {
  return Math.round(pct);
}

export function descontoDoDegrau(degrau: number, descontoTetoPct: number): number {
  const i = Math.min(Math.max(degrau, 1), DEGRAU_MAXIMO) - 1;
  return arredondarPct(descontoTetoPct * MULTIPLICADORES[i]);
}

export function proximoDegrau(estagioAtual: number): number {
  return Math.min(estagioAtual + 1, DEGRAU_MAXIMO);
}

export function calcularOferta(
  valorOriginalCentavos: number,
  degrau: number,
  descontoTetoPct: number,
  // Faixas de parcelamento do credor (dominio/faixas.ts), as mesmas do
  // portal de autoatendimento — fonte unica do desconto por quantidade de
  // parcelas. Opcional: quando ausente (testes que nao cobrem este caso),
  // simplesmente nao ha parcelamento estendido.
  regrasParcelamento?: RegrasCredor,
): OfertaDoDegrau {
  const descontoAVistaPct = descontoDoDegrau(degrau, descontoTetoPct);
  const valorAVistaCentavos = Math.round(valorOriginalCentavos * (1 - descontoAVistaPct / 100));

  const descontoParceladoPct = arredondarPct(descontoAVistaPct * FATOR_DESCONTO_PARCELADO);
  const totalParceladoCentavos = Math.round(
    valorOriginalCentavos * (1 - descontoParceladoPct / 100),
  );
  // Arredonda para cima: a soma das parcelas nunca fica abaixo do total
  // combinado, e a sobra de centavos favorece o devedor na ultima parcela
  // — mesma convencao de dominio/ofertas.ts.
  const valorParcelaCentavos = Math.ceil(totalParceladoCentavos / PARCELAS_DA_NEGOCIACAO);

  const i = Math.min(Math.max(degrau, 1), DEGRAU_MAXIMO) - 1;
  const entradaMinimaCentavos = Math.round(valorAVistaCentavos * ENTRADA_MINIMA_PCT[i]);

  const pAceiteAVista = P_ACEITE_AVISTA_POR_DEGRAU[i];
  const pAceiteParcelado = Math.min(pAceiteAVista + BONUS_P_ACEITE_PARCELADO, 0.95);

  const erAVistaCentavos = calcularER({
    entradaCentavos: valorAVistaCentavos,
    parcelasCentavos: [],
    pAceite: pAceiteAVista,
  });
  const estruturaParcelada: EstruturaOferta = {
    entradaCentavos: 0,
    parcelasCentavos: Array(PARCELAS_DA_NEGOCIACAO).fill(valorParcelaCentavos),
    pAceite: pAceiteParcelado,
  };
  const erParceladoCentavos = calcularER(estruturaParcelada);

  const ofertasDasFaixas = regrasParcelamento
    ? gerarOfertas(valorOriginalCentavos, regrasParcelamento)
    : [];
  const parceladoEstendido: OfertaParcelasExtra[] = PARCELAS_EXTRAS.flatMap((parcelasExtra) => {
    // So existe se a tabela de faixas do credor de fato cobrir essa
    // quantidade de parcelas (respeita parcela minima e as faixas
    // configuradas) — sem faixa, nao ha numero nenhum para oferecer.
    const daFaixa = ofertasDasFaixas.find((o) => o.parcelas === parcelasExtra);
    if (!daFaixa) return [];
    const erCentavos = calcularER({
      entradaCentavos: 0,
      parcelasCentavos: Array(parcelasExtra).fill(daFaixa.valorParcelaCentavos),
      pAceite: pAceiteParcelado,
    });
    return [
      {
        parcelas: parcelasExtra,
        descontoPct: daFaixa.descontoPct,
        valorParcelaCentavos: daFaixa.valorParcelaCentavos,
        totalCentavos: daFaixa.totalCentavos,
        erCentavos,
      },
    ];
  });

  return {
    degrau,
    descontoAVistaPct,
    valorAVistaCentavos,
    descontoParceladoPct,
    parcelas: PARCELAS_DA_NEGOCIACAO,
    valorParcelaCentavos,
    totalParceladoCentavos,
    entradaMinimaCentavos,
    erAVistaCentavos,
    erParceladoCentavos,
    parceladoEstendido,
  };
}

// O que o cliente propos cabe no que ja foi REVELADO ate agora (o degrau
// atual), nao no teto inteiro. Se coubesse no teto direto, a primeira
// contraproposta alta ja levaria o desconto maximo, e a escalada em
// degraus deixaria de significar alguma coisa.
export function avaliarContraproposta(
  valorPropostoCentavos: number,
  valorOriginalCentavos: number,
  estagioAtual: number,
  descontoTetoPct: number,
): AvaliacaoContraproposta {
  if (valorOriginalCentavos <= 0 || valorPropostoCentavos <= 0) {
    return { aceitar: false, valorAceitoCentavos: null, proximoDegrau: proximoDegrau(estagioAtual) };
  }

  const degrauDisponivel = Math.max(estagioAtual, 1);
  const descontoDisponivel = descontoDoDegrau(degrauDisponivel, descontoTetoPct);
  const descontoProposto = 100 * (1 - valorPropostoCentavos / valorOriginalCentavos);

  if (descontoProposto <= descontoDisponivel) {
    return { aceitar: true, valorAceitoCentavos: valorPropostoCentavos, proximoDegrau: degrauDisponivel };
  }

  return { aceitar: false, valorAceitoCentavos: null, proximoDegrau: proximoDegrau(estagioAtual) };
}

// ---------- Contexto pronto para a IA ----------
//
// Junta os numeros que a IA tem permissao de citar neste turno e o texto
// que descreve, em portugues, qual oferta apresentar. A IA escolhe QUAL
// das opcoes usar (olhando o historico da conversa que ja recebe), mas
// nunca inventa um numero fora deste conjunto — e o validador, depois,
// confere isso.

export interface DescontosDoDegrau {
  avistaPct: number;
  parceladoPct: number;
  // Descontos das opcoes de parcelamento estendido (3x, 4x) deste degrau —
  // grau_apresentado tambem bate valido se a resposta citar um destes, nao
  // so avistaPct/parceladoPct.
  percentuaisEstendidos: number[];
}

export interface ValoresPermitidos {
  centavos: number[];
  percentuaisPct: number[];
  // Por degrau: permite ao validador conferir que grau_apresentado (campo
  // estruturado que a IA preenche) bate com os percentuais que a resposta
  // de fato citou — sem isso a unica forma de saber "qual degrau ela
  // apresentou" seria reler a prosa com regex, exatamente o que quebrou em
  // producao (ver AUDITORIA.md, ponto 5).
  descontosPorDegrau?: Record<number, DescontosDoDegrau>;
}

export interface ContextoNegociacao {
  ofertaAbertura: OfertaDoDegrau;
  ofertaAtual: OfertaDoDegrau | null;
  ofertaProxima: OfertaDoDegrau | null;
  texto: string;
  permitido: ValoresPermitidos;
  // spec §5.2 regra 5 + §10: apos a rodada 3 (degrau maximo ja revelado),
  // nenhuma concessao adicional em nenhuma hipotese. O sistema calcula
  // isso; o prompt so precisa obedecer.
  podeConceder: boolean;
}

export function formatarReais(centavos: number): string {
  const reais = (Math.round(centavos) / 100).toFixed(2);
  const [inteiro, decimal] = reais.split('.');
  return `R$ ${inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${decimal}`;
}

function descreverOferta(oferta: OfertaDoDegrau): string {
  const contrapartida =
    oferta.entradaMinimaCentavos > 0
      ? ` — exige entrada minima de ${formatarReais(oferta.entradaMinimaCentavos)} como contrapartida`
      : '';
  const base =
    `[degrau ${oferta.degrau}] a vista ${formatarReais(oferta.valorAVistaCentavos)} (${oferta.descontoAVistaPct}% de desconto) ou ` +
    `${oferta.parcelas}x de ${formatarReais(oferta.valorParcelaCentavos)} ` +
    `(${oferta.descontoParceladoPct}% de desconto, total ${formatarReais(oferta.totalParceladoCentavos)})${contrapartida}.`;
  if (oferta.parceladoEstendido.length === 0) {
    return `${base} Nao ha opcao de mais parcelas que isso configurada para este credor — se o cliente pedir, explique que esse e o parcelamento maximo disponivel.`;
  }
  const estendido = oferta.parceladoEstendido
    .map(
      (e) =>
        `${e.parcelas}x de ${formatarReais(e.valorParcelaCentavos)} (${e.descontoPct}% de desconto, total ${formatarReais(e.totalCentavos)})`,
    )
    .join(' ou ');
  return `${base} Se o cliente pedir explicitamente mais parcelas que isso, so entao ofereca: ${estendido} (desconto conforme a tabela do credor — explique como a troca pelo prazo maior).`;
}

// Bloco estruturado que o LLM recebe a cada turno — spec §11: "o LLM
// recebe a cada turno um bloco de ofertas ja aprovadas e nunca inventa
// numeros". O texto em portugues (montarContextoNegociacao) continua
// sendo o que orienta QUANDO usar cada oferta; este bloco e a forma
// inequivoca, em dados, do que esta liberado — reforca a mesma trava sem
// depender so da IA interpretar prosa corretamente.
export function blocoOfertasLiberadas(contexto: ContextoNegociacao): string {
  const ofertas = [contexto.ofertaAbertura, contexto.ofertaAtual, contexto.ofertaProxima].filter(
    (o): o is OfertaDoDegrau => o !== null,
  );
  const IDS_ESTENDIDOS = ['C', 'D', 'E', 'F'];
  const liberadas = ofertas.flatMap((o) => [
    {
      id: `${o.degrau}A`,
      tipo: 'avista',
      degrau: o.degrau,
      desconto_pct: o.descontoAVistaPct,
      total_centavos: o.valorAVistaCentavos,
      entrada_minima_centavos: o.entradaMinimaCentavos,
    },
    {
      id: `${o.degrau}B`,
      tipo: 'parcelado',
      degrau: o.degrau,
      desconto_pct: o.descontoParceladoPct,
      parcelas: o.parcelas,
      valor_parcela_centavos: o.valorParcelaCentavos,
      total_centavos: o.totalParceladoCentavos,
    },
    ...o.parceladoEstendido.map((e, i) => ({
      id: `${o.degrau}${IDS_ESTENDIDOS[i] ?? 'X'}`,
      tipo: 'parcelado_estendido',
      degrau: o.degrau,
      desconto_pct: e.descontoPct,
      parcelas: e.parcelas,
      valor_parcela_centavos: e.valorParcelaCentavos,
      total_centavos: e.totalCentavos,
      uso: 'so se o cliente pedir explicitamente mais parcelas',
    })),
  ]);
  return JSON.stringify({ ofertas_liberadas: liberadas, pode_conceder: contexto.podeConceder });
}

function permitidoDe(...ofertas: Array<OfertaDoDegrau | null>): ValoresPermitidos {
  const centavos: number[] = [];
  const percentuaisPct: number[] = [];
  const descontosPorDegrau: Record<number, DescontosDoDegrau> = {};
  for (const o of ofertas) {
    if (!o) continue;
    centavos.push(o.valorAVistaCentavos, o.valorParcelaCentavos, o.totalParceladoCentavos);
    // Bug real de producao (2026-08-18): descreverOferta manda a IA citar
    // a entrada minima como contrapartida, mas essa lista de permitidos
    // nunca incluia o valor — toda vez que o degrau tinha entrada minima
    // (2 e 3, ver ENTRADA_MINIMA_PCT), QUALQUER resposta que a mencionasse
    // era barrada como "valor diferente do autorizado", nas 3 tentativas,
    // sempre caindo no mesmo fallback estatico — pareceu a IA travada
    // repetindo a mesma frase, mas era este numero faltando na lista.
    if (o.entradaMinimaCentavos > 0) centavos.push(o.entradaMinimaCentavos);
    percentuaisPct.push(o.descontoAVistaPct, o.descontoParceladoPct);
    for (const extra of o.parceladoEstendido) {
      centavos.push(extra.valorParcelaCentavos, extra.totalCentavos);
      percentuaisPct.push(extra.descontoPct);
    }
    descontosPorDegrau[o.degrau] = {
      avistaPct: o.descontoAVistaPct,
      parceladoPct: o.descontoParceladoPct,
      percentuaisEstendidos: o.parceladoEstendido.map((e) => e.descontoPct),
    };
  }
  return { centavos, percentuaisPct, descontosPorDegrau };
}

// Qual das ofertas deste turno corresponde ao degrau que a IA reportou ter
// apresentado (grau_apresentado). Usado so para gravar o registro de
// concessao em ofertas_negociacao — nunca para decidir SE ela apresentou,
// isso e o validador (com o campo estruturado) que confere.
export function ofertaDoGrau(
  contexto: ContextoNegociacao,
  grau: number,
): OfertaDoDegrau | null {
  for (const o of [contexto.ofertaProxima, contexto.ofertaAtual, contexto.ofertaAbertura]) {
    if (o && o.degrau === grau) return o;
  }
  return null;
}

// Fase 1, Principio 1: nenhum turno pode terminar em zero mensagens. Quando
// a IA esgota as tentativas e ainda assim nao produz uma resposta valida
// (ou a chamada a ela falha), o motor monta esta mensagem sozinho, sem
// depender do LLM — usa so numeros ja calculados e aprovados, entao nao ha
// nada para o validador rejeitar.
export function montarFallback(nomeCliente: string, contexto: ContextoNegociacao | null): string {
  if (!contexto) {
    return `${nomeCliente}, tive um problema tecnico aqui. Ja estou verificando e te retorno em instantes.`;
  }
  const oferta = contexto.ofertaAtual ?? contexto.ofertaAbertura;
  return (
    `${nomeCliente}, consigo fechar assim: a vista ${formatarReais(oferta.valorAVistaCentavos)} ` +
    `(${oferta.descontoAVistaPct}% de desconto). Ou, se preferir dividir, ${oferta.parcelas}x de ` +
    `${formatarReais(oferta.valorParcelaCentavos)}. Qual funciona melhor pra voce?`
  );
}

// Mensagem fixa para quando um motivo de escalamento e confirmado — nao
// depende de nenhum numero, entao e sempre segura de enviar sem passar
// pelo validador.
export const MENSAGEM_ESCALAMENTO =
  'Entendi. Vou te colocar em contato com um atendente para continuar por aqui.';

export function montarContextoNegociacao(
  valorOriginalCentavos: number,
  descontoTetoPct: number,
  estagioAtual: number,
  regrasParcelamento?: RegrasCredor,
): ContextoNegociacao {
  const ofertaAbertura = calcularOferta(valorOriginalCentavos, 1, descontoTetoPct, regrasParcelamento);
  const ofertaAtual =
    estagioAtual > 0
      ? calcularOferta(valorOriginalCentavos, estagioAtual, descontoTetoPct, regrasParcelamento)
      : null;
  const ofertaProxima =
    estagioAtual > 0 && estagioAtual < DEGRAU_MAXIMO
      ? calcularOferta(valorOriginalCentavos, proximoDegrau(estagioAtual), descontoTetoPct, regrasParcelamento)
      : null;

  const linhas: string[] = [];
  if (!ofertaAtual) {
    linhas.push(
      `Se o cliente pedir desconto ou reclamar do valor pela primeira vez nesta conversa, apresente: ${descreverOferta(ofertaAbertura)}. Nunca revele que ha mais margem alem disso.`,
    );
  } else if (ofertaProxima) {
    linhas.push(
      `Se ele ainda nao recebeu nenhuma oferta explicita nesta conversa, apresente: ${descreverOferta(ofertaAbertura)}.`,
    );
    linhas.push(
      `Se ele ja recusou ou pediu mais depois de uma oferta anterior, apresente como esforco adicional: ${descreverOferta(ofertaProxima)}. Nunca revele que ha mais margem alem disso.`,
    );
  } else {
    linhas.push(
      `Esta e a condicao especial, o maximo que se pode oferecer: ${descreverOferta(ofertaAtual)}. Comunique isso como um esforco extra que voce esta fazendo, nao como algo facil. Se ele recusar mesmo assim, reapresente estes mesmos numeros com firmeza e cordialidade — nao ha mais nada a oferecer.`,
    );
  }
  linhas.push(
    'Se o cliente propuser um valor especifico em reais, informe-o em proposta_do_cliente_centavos — o sistema decide se cabe, voce nunca aceita por conta propria nem confirma um acordo sem essa confirmacao.',
  );
  linhas.push(
    'Cada oferta acima comeca com um marcador "[degrau N]" — e so para sua referencia interna, nunca escreva isso na resposta ao cliente. Se voce apresentou uma dessas ofertas nesta resposta (os numeros dela apareceram no texto), preencha grau_apresentado com esse N. Se nao apresentou oferta nenhuma neste turno, deixe grau_apresentado como null.',
  );

  if (estagioAtual >= DEGRAU_MAXIMO) {
    linhas.push(
      'Voce ja apresentou a condicao especial (degrau maximo) nesta negociacao. Nao ha mais nenhuma concessao possivel, em nenhuma hipotese — reapresente os mesmos numeros com firmeza se o cliente insistir.',
    );
  }

  return {
    ofertaAbertura,
    ofertaAtual,
    ofertaProxima,
    texto: `Oferta disponivel para apresentar agora:\n${linhas.join('\n')}`,
    permitido: permitidoDe(ofertaAbertura, ofertaAtual, ofertaProxima),
    podeConceder: estagioAtual < DEGRAU_MAXIMO,
  };
}

// Adendo 1 (18/08), Defeito 1/7: uma vez fechado o acordo, o motor para de
// oferecer desconto — antes disso vivia so como logica solta dentro do
// webhook, o que impedia testar sem banco de dados. Aqui e puro: os mesmos
// tres textos que o webhook usa (contexto para a IA, override do fallback,
// numeros extras permitidos), sempre a partir do valor e das parcelas que
// de fato foram acordados — nunca da escada de desconto original.
export interface ContextoFechado {
  ofertaTexto: string;
  fallbackOverride: string;
  centavosPermitidosExtra: number[];
}

export function montarContextoFechado(
  nomeCliente: string,
  valorAcordadoCentavos: number,
  parcelasAcordadas: number,
): ContextoFechado {
  const condicao =
    parcelasAcordadas > 1
      ? `${parcelasAcordadas}x de ${formatarReais(Math.ceil(valorAcordadoCentavos / parcelasAcordadas))}, total ${formatarReais(valorAcordadoCentavos)}`
      : formatarReais(valorAcordadoCentavos);

  return {
    ofertaTexto: `Esta divida ja tem acordo fechado: ${condicao}. NUNCA ofereca desconto novo nem cite um valor diferente deste — so confirme se perguntarem, responda outras duvidas, ou encaminhe.`,
    fallbackOverride: `${nomeCliente}, sua negociacao ja esta registrada em ${condicao}. Vou verificar sua duvida e ja te retorno.`,
    centavosPermitidosExtra:
      parcelasAcordadas > 1
        ? [valorAcordadoCentavos, Math.ceil(valorAcordadoCentavos / parcelasAcordadas)]
        : [valorAcordadoCentavos],
  };
}
