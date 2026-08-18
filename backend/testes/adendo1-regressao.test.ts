// Teste de regressao obrigatorio pedido pelo Adendo 1 (18/08): a conversa
// completa do print vira caso automatizado. Os numeros usados aqui (R$
// 1.200 de divida, teto 30%, faixas 2-3x=5% / 4-6x=10%) sao exatamente os
// da carteira de teste e do exemplo do painel — os valores intermediarios
// (R$ 840, R$ 492, R$ 380, R$ 270) batem, digito a digito, com os que
// apareceram na conversa real.
//
// webhook.ts nao tem teste direto (depende de D1 e da chamada HTTP a IA,
// sem infraestrutura de mock no projeto) — este teste cobre a mesma
// sequencia through as funcoes PURAS que webhook.ts chama na mesma ordem
// (dominio/negociacao.ts, dominio/turno.ts, ia/responder.ts). O que so
// existe dentro do webhook (contador de fallback consecutivo em
// dividas.fallbacks_consecutivos, fila de perguntas em D1) fica coberto por
// leitura de codigo e teste manual, nao aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import type { RegrasCredor } from '../src/dominio/faixas.ts';
import {
  calcularOferta,
  montarContextoFechado,
  montarContextoNegociacao,
} from '../src/dominio/negociacao.ts';
import { resolverTurno } from '../src/dominio/turno.ts';
import { validarResposta } from '../src/ia/responder.ts';
import type { Decisao } from '../src/ia/responder.ts';

const VALOR_DIVIDA_CENTAVOS = 120000; // R$ 1.200,00
const TETO_PCT = 30;
const REGRAS_TESTE: RegrasCredor = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 0 },
    { de: 2, ate: 3, descontoPct: 5 },
    { de: 4, ate: 6, descontoPct: 10 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: TETO_PCT,
  comissaoSobreRecuperadoPct: 0,
};

function decisaoBase(overrides: Partial<Decisao>): Decisao {
  return {
    intencao: 'negociacao',
    resposta: '',
    motivo_escalar: 'nenhum',
    silenciar: false,
    proposta_do_cliente_centavos: null,
    cliente_aceitou: false,
    grau_apresentado: null,
    data_renda_declarada: null,
    capacidade_declarada_centavos: null,
    usar_espera_estrategica: false,
    resposta_apos_espera: null,
    grau_apresentado_apos_espera: null,
    valor_fechado_centavos: null,
    parcelas_fechadas: null,
    perguntas_novas: [],
    perguntas_resolvidas: [],
    ...overrides,
  };
}

test('Adendo 1 — checklist 1/2/6: abertura nunca no teto, e a escada e a mesma do print', () => {
  // "A oferta de abertura nunca contém o desconto máximo da carteira."
  const abertura = montarContextoNegociacao(VALOR_DIVIDA_CENTAVOS, TETO_PCT, 0, REGRAS_TESTE);
  assert.equal(abertura.ofertaAbertura.descontoAVistaPct, 15);
  assert.notEqual(abertura.ofertaAbertura.descontoAVistaPct, TETO_PCT);

  // Estagio 3 (degrau maximo) reproduz exatamente os numeros do print:
  // "a vista R$ 840,00 (30% de desconto). Ou, se preferir dividir, 2x de
  // R$ 492,00."
  const degrau3 = calcularOferta(VALOR_DIVIDA_CENTAVOS, 3, TETO_PCT, REGRAS_TESTE);
  assert.equal(degrau3.descontoAVistaPct, 30);
  assert.equal(degrau3.valorAVistaCentavos, 84000);
  assert.equal(degrau3.descontoParceladoPct, 18);
  assert.equal(degrau3.valorParcelaCentavos, 49200);

  // Pedido de mais parcelas: "3x de R$ 380,00 (5% de desconto) ou 4x de
  // R$ 270,00 (10% de desconto)" — os mesmos numeros do print, vindos da
  // tabela de faixas do painel (Defeito 4: decidido manter essa tabela como
  // fonte unica, ver conversa de 2026-08-18).
  const [tresX, quatroX] = degrau3.parceladoEstendido;
  assert.equal(tresX.parcelas, 3);
  assert.equal(tresX.valorParcelaCentavos, 38000);
  assert.equal(quatroX.parcelas, 4);
  assert.equal(quatroX.valorParcelaCentavos, 27000);
  assert.equal(quatroX.totalCentavos, 108000);
});

test('Adendo 1 — checklist Defeito 1/7: aceitar 4x fecha via campo estruturado, nao so por proposta numerica', () => {
  const ctx = montarContextoNegociacao(VALOR_DIVIDA_CENTAVOS, TETO_PCT, 3, REGRAS_TESTE);
  const quatroX = ctx.ofertaAtual!.parceladoEstendido[1];

  // "Otimo em 4x esta ideal" — o cliente concorda com a oferta que a IA ja
  // apresentou, sem repetir o numero como proposta nova.
  // grau_apresentado fica null: esta resposta CONFIRMA um acordo (via
  // cliente_aceitou/valor_fechado_centavos), nao apresenta uma oferta nova
  // da escada — sao mecanismos distintos, e so o segundo usa grau_apresentado.
  const decisao = decisaoBase({
    resposta: `Fechado! Fica em 4x de R$ 270,00, total R$ 1.080,00. Consegue pagar a primeira parcela hoje ainda?`,
    cliente_aceitou: true,
    valor_fechado_centavos: quatroX.totalCentavos,
    parcelas_fechadas: 4,
    grau_apresentado: null,
  });

  assert.equal(validarResposta(decisao, ctx.permitido).ok, true);
  assert.equal(decisao.valor_fechado_centavos, 108000);
});

test('Adendo 1 — checklist Defeito 1: depois de fechado, nenhum texto contem os numeros antigos (R$ 840, 30%, R$ 492)', () => {
  const fechado = montarContextoFechado('Cliente Teste Um', 108000, 4);

  for (const texto of [fechado.ofertaTexto, fechado.fallbackOverride]) {
    assert.doesNotMatch(texto, /840/);
    assert.doesNotMatch(texto, /30%/);
    assert.doesNotMatch(texto, /492/);
  }
  assert.match(fechado.ofertaTexto, /NUNCA ofereca desconto/);
  assert.match(fechado.fallbackOverride, /registrada/);

  // Os unicos numeros permitidos depois de fechado sao os do acordo — nao
  // os da escada original.
  assert.deepEqual(fechado.centavosPermitidosExtra, [108000, 27000]);
});

test('Adendo 1 — checklist Defeito 1/2: se o fallback disparar depois de fechado, usa o override (nunca reabre a escada)', async () => {
  const fechado = montarContextoFechado('Cliente Teste Um', 108000, 4);
  const permitidoFechado = { centavos: fechado.centavosPermitidosExtra, percentuaisPct: [] };

  // Simula a IA tentando (e falhando a validacao) tres vezes seguidas —
  // mesmo assim o texto final tem que ser o override do acordo fechado,
  // nunca a escada de desconto original nem texto vazio.
  const resultado = await resolverTurno(
    async () =>
      decisaoBase({ resposta: 'Consigo fazer 40% de desconto agora.', grau_apresentado: null }),
    permitidoFechado,
    null, // negociacao = null: nao ha mais escada, exatamente como webhook.ts monta quando fechado
    'Cliente Teste Um',
    fechado.fallbackOverride,
  );

  assert.equal(resultado.viaFallback, true);
  assert.equal(resultado.textoFinal, fechado.fallbackOverride);
  assert.equal(resultado.grauApresentado, null, 'fallback do acordo fechado nunca reporta um degrau para avancar');
  assert.doesNotMatch(resultado.textoFinal, /840|30%|492/);
});

test('Adendo 1 — checklist Defeito 6: pergunta fora do que a IA sabe responder nunca vem junto com uma oferta', () => {
  // "e possivel pagar em criptomoeda? e da pra fazer via boleto internacional?"
  // — dois temas de uma vez, nenhum coberto por FATOS_LIBERADOS hoje.
  const decisao = decisaoBase({
    resposta: 'Boa pergunta, isso eu preciso confirmar — ja estou verificando e te retorno.',
    perguntas_novas: ['pagamento_criptomoeda', 'boleto_internacional'],
  });

  assert.equal(decisao.perguntas_novas.length, 2);
  // A resposta que acompanha a pergunta pendente nao pode citar nenhum
  // valor ou percentual — so reconhece a duvida.
  assert.doesNotMatch(decisao.resposta, /R\$|%/);
  const permitidoVazio = { centavos: [], percentuaisPct: [] };
  assert.equal(validarResposta(decisao, permitidoVazio).ok, true);
});
