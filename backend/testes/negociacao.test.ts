import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEGRAU_MAXIMO,
  avaliarContraproposta,
  calcularOferta,
  descontoDoDegrau,
  proximoDegrau,
} from '../src/dominio/negociacao.ts';
import type { RegrasCredor } from '../src/dominio/faixas.ts';

// Mesma tabela do exemplo mostrado no painel: 1x sem desconto, 2-3x com 5%,
// 4-6x com 10%. Usada para testar o parcelamento estendido (3x/4x) da
// negociacao, que agora vem desta MESMA tabela — nao de uma penalidade
// inventada pela IA.
const REGRAS_TESTE: RegrasCredor = {
  faixas: [
    { de: 1, ate: 1, descontoPct: 0 },
    { de: 2, ate: 3, descontoPct: 5 },
    { de: 4, ate: 6, descontoPct: 10 },
  ],
  parcelaMinimaCentavos: 2000,
  descontoTetoPct: 30,
  comissaoSobreRecuperadoPct: 0,
};

/* ---------- descontoDoDegrau ---------- */

test('degrau 1 e metade do teto, degrau 2 e 80% do teto, degrau 3 e o teto inteiro', () => {
  // Fase 2 (spec 5.1/5.2): incrementos decrescentes entre degraus — 15,
  // 24, 30 (incrementos 15, 9, 6) — em vez de incrementos quase constantes.
  assert.equal(descontoDoDegrau(1, 30), 15);
  assert.equal(descontoDoDegrau(2, 30), 24);
  assert.equal(descontoDoDegrau(3, 30), 30);
});

test('degrau fora do intervalo e limitado a [1, DEGRAU_MAXIMO]', () => {
  assert.equal(descontoDoDegrau(0, 30), descontoDoDegrau(1, 30));
  assert.equal(descontoDoDegrau(99, 30), descontoDoDegrau(DEGRAU_MAXIMO, 30));
});

/* ---------- proximoDegrau ---------- */

test('avanca um degrau por vez e nunca passa do maximo', () => {
  assert.equal(proximoDegrau(0), 1);
  assert.equal(proximoDegrau(1), 2);
  assert.equal(proximoDegrau(2), 3);
  assert.equal(proximoDegrau(3), 3);
});

/* ---------- calcularOferta ---------- */

test('oferta do degrau 1 sobre R$ 1.200 com teto 30%', () => {
  const o = calcularOferta(120000, 1, 30);
  assert.equal(o.descontoAVistaPct, 15);
  assert.equal(o.valorAVistaCentavos, 102000); // 1200 * 0.85
  assert.equal(o.parcelas, 2);
  assert.equal(o.descontoParceladoPct, 9); // 15 * 0.6
});

test('o parcelado nunca desconta mais que o a vista do mesmo degrau', () => {
  for (const degrau of [1, 2, 3]) {
    const o = calcularOferta(120000, degrau, 30);
    assert.ok(o.descontoParceladoPct < o.descontoAVistaPct);
  }
});

test('a soma das parcelas nunca fica abaixo do total parcelado', () => {
  const o = calcularOferta(120001, 2, 30); // valor que nao divide exato
  assert.ok(o.valorParcelaCentavos * o.parcelas >= o.totalParceladoCentavos);
});

test('degrau 3 (condicao especial) da o desconto maximo configurado', () => {
  const o = calcularOferta(120000, 3, 30);
  assert.equal(o.descontoAVistaPct, 30);
  assert.equal(o.valorAVistaCentavos, 84000);
});

/* ---------- avaliarContraproposta ---------- */

test('contraproposta dentro do degrau atual e aceita pelo valor exato pedido', () => {
  // degrau 1, teto 30% -> disponivel 15%. Proposta de 900 sobre 1200 = 25%,
  // nao cabe. Proposta de 1050 sobre 1200 = 12.5%, cabe.
  const r = avaliarContraproposta(105000, 120000, 1, 30);
  assert.equal(r.aceitar, true);
  assert.equal(r.valorAceitoCentavos, 105000);
});

test('contraproposta acima do degrau disponivel nao e aceita e avanca o degrau', () => {
  const r = avaliarContraproposta(90000, 120000, 1, 30); // pede 25%, so ha 15%
  assert.equal(r.aceitar, false);
  assert.equal(r.valorAceitoCentavos, null);
  assert.equal(r.proximoDegrau, 2);
});

test('contraproposta acima mesmo no degrau 3 nao e aceita e nao passa do maximo', () => {
  const r = avaliarContraproposta(50000, 120000, 3, 30); // pede muito mais que 30%
  assert.equal(r.aceitar, false);
  assert.equal(r.proximoDegrau, DEGRAU_MAXIMO);
});

test('contraproposta exatamente no limite do degrau e aceita (borda fechada)', () => {
  // degrau 2, teto 30 -> disponivel 24%. 1200 * (1-0.24) = 912.
  const r = avaliarContraproposta(91200, 120000, 2, 30);
  assert.equal(r.aceitar, true);
});

test('estagio 0 (nenhuma oferta feita) usa o degrau 1 como disponivel', () => {
  const r = avaliarContraproposta(105000, 120000, 0, 30);
  assert.equal(r.aceitar, true);
});

test('proposta ou valor original invalidos nunca sao aceitos', () => {
  assert.equal(avaliarContraproposta(0, 120000, 1, 30).aceitar, false);
  assert.equal(avaliarContraproposta(-100, 120000, 1, 30).aceitar, false);
  assert.equal(avaliarContraproposta(100000, 0, 1, 30).aceitar, false);
});

/* ---------- montarContextoNegociacao, ofertaDoGrau e montarFallback ---------- */

import {
  formatarReais,
  montarContextoNegociacao,
  montarFallback,
  ofertaDoGrau,
} from '../src/dominio/negociacao.ts';

// Regressao: o estado da negociacao nao pode mais depender de reler com
// regex a prosa que a propria IA escreveu (isso travou a negociacao no
// degrau 1 em producao). Quem avanca o estagio agora e o campo estruturado
// grau_apresentado, conferido em ia/responder.ts::validarResposta contra os
// percentuais que a resposta de fato citou — ver testes la. Aqui so se
// testa a parte que o motor de negociacao continua responsavel: montar o
// mapa de qual oferta corresponde a qual degrau, e o texto que ensina a IA
// a preencher o campo certo.

test('permitido.descontosPorDegrau mapeia cada degrau para seus proprios percentuais', () => {
  const ctx = montarContextoNegociacao(120000, 30, 1); // atual = degrau 1, proxima = degrau 2
  const mapa = ctx.permitido.descontosPorDegrau!;
  assert.equal(mapa[1].avistaPct, 15);
  assert.equal(mapa[2].avistaPct, 24);
  assert.equal(mapa[3], undefined); // degrau 3 nao foi revelado neste turno
});

test('ofertaDoGrau devolve a oferta certa, e null para um degrau nao disponivel neste turno', () => {
  const ctx = montarContextoNegociacao(120000, 30, 1);
  assert.equal(ofertaDoGrau(ctx, 1)?.descontoAVistaPct, 15);
  assert.equal(ofertaDoGrau(ctx, 2)?.descontoAVistaPct, 24);
  assert.equal(ofertaDoGrau(ctx, 3), null);
});

test('o texto para a IA marca cada oferta com "[degrau N]", para ela preencher grau_apresentado', () => {
  const ctx = montarContextoNegociacao(120000, 30, 0);
  assert.match(ctx.texto, /\[degrau 1\]/);
});

test('no degrau maximo (3), so ha oferta atual — sem proxima', () => {
  const ctx = montarContextoNegociacao(120000, 30, 3);
  assert.equal(ctx.ofertaProxima, null);
  assert.equal(ofertaDoGrau(ctx, 3)?.descontoAVistaPct, 30);
});

test('montarFallback sem contexto de negociacao devolve mensagem tecnica generica', () => {
  const texto = montarFallback('Maria', null);
  assert.match(texto, /problema tecnico/);
});

test('montarFallback com negociacao usa numeros ja calculados e aprovados', () => {
  const ctx = montarContextoNegociacao(120000, 30, 0);
  const texto = montarFallback('Maria', ctx);
  assert.match(texto, /Maria/);
  assert.match(texto, /15% de desconto/);
  assert.equal(texto.includes(formatarReais(ctx.ofertaAbertura.valorAVistaCentavos)), true);
});

test('o parcelado nunca aparece com desconto igual ou maior que o a vista, em nenhum degrau do contexto', () => {
  for (const estagio of [0, 1, 2, 3]) {
    const ctx = montarContextoNegociacao(120000, 30, estagio);
    for (const o of [ctx.ofertaAbertura, ctx.ofertaAtual, ctx.ofertaProxima]) {
      if (!o) continue;
      assert.ok(o.descontoParceladoPct < o.descontoAVistaPct);
    }
  }
});

test('o texto pronto para a IA nunca revela que ha mais margem, mesmo no degrau 1', () => {
  const ctx = montarContextoNegociacao(120000, 30, 0);
  // A frase que orienta a IA existe; o numero do proximo degrau, nao.
  assert.match(ctx.texto, /nunca revele/i);
  assert.equal(ctx.texto.includes('24%'), false);
  assert.equal(ctx.texto.includes('30%'), false);
});

/* ---------- Fase 2: contrapartida, pode_conceder, bloco estruturado ---------- */

import { blocoOfertasLiberadas } from '../src/dominio/negociacao.ts';

test('degrau 1 nao exige entrada minima; degraus 2 e 3 exigem', () => {
  const o1 = calcularOferta(120000, 1, 30);
  const o2 = calcularOferta(120000, 2, 30);
  const o3 = calcularOferta(120000, 3, 30);
  assert.equal(o1.entradaMinimaCentavos, 0);
  assert.ok(o2.entradaMinimaCentavos > 0);
  assert.ok(o3.entradaMinimaCentavos > o2.entradaMinimaCentavos);
});

// Regressao (2026-08-18, producao): a resposta que cita a entrada minima
// do degrau 2/3 como contrapartida — exatamente o que descreverOferta
// instrui a IA a fazer — precisa passar no validador. Antes desta correcao
// esse numero nunca estava em permitido.centavos, e a IA ficava presa
// repetindo o fallback estatico toda vez que o cliente pedia mais parcelas
// e a negociacao avancava para um degrau com entrada exigida.
test('permitido.centavos inclui a entrada minima de cada degrau que a tiver', () => {
  const ctx = montarContextoNegociacao(120000, 30, 2); // atual = degrau 2
  const entradaDoDegrau2 = ctx.ofertaAtual!.entradaMinimaCentavos;
  assert.ok(entradaDoDegrau2 > 0);
  assert.ok(ctx.permitido.centavos.includes(entradaDoDegrau2));
});

test('cada oferta calcula uma recuperacao esperada (ER) positiva', () => {
  const o = calcularOferta(120000, 1, 30);
  assert.ok(o.erAVistaCentavos > 0);
  assert.ok(o.erParceladoCentavos > 0);
});

test('podeConceder e false so depois do degrau maximo ja revelado', () => {
  assert.equal(montarContextoNegociacao(120000, 30, 0).podeConceder, true);
  assert.equal(montarContextoNegociacao(120000, 30, 2).podeConceder, true);
  assert.equal(montarContextoNegociacao(120000, 30, 3).podeConceder, false);
});

test('blocoOfertasLiberadas produz JSON valido com ids e pode_conceder', () => {
  const ctx = montarContextoNegociacao(120000, 30, 1);
  const bloco = JSON.parse(blocoOfertasLiberadas(ctx));
  assert.equal(bloco.pode_conceder, true);
  assert.ok(Array.isArray(bloco.ofertas_liberadas));
  assert.ok(bloco.ofertas_liberadas.some((o: { id: string }) => o.id === '1A'));
  assert.ok(bloco.ofertas_liberadas.some((o: { id: string }) => o.id === '1B'));
});

// Regressao (2026-08-18, producao): o cliente pedindo mais parcelas do que
// as 2x padrao ("aumenta o numero de parcelas", "queria em 4x") nao tinha
// numero nenhum para a IA oferecer — toda tentativa real dela era barrada
// (numero fora do autorizado) e o sistema caia sempre no mesmo fallback
// estatico repetido, mesmo apos o cliente insistir varias vezes. Agora cada
// oferta traz opcoes de parcelamento estendido (3x/4x) — vindas da MESMA
// tabela de faixas que o credor configura no painel (nao de uma penalidade
// separada: duas fontes de verdade para "quanto desconto vale N parcelas"
// e como o bug apareceu na revisao anterior desta funcionalidade).
test('parceladoEstendido usa os numeros exatos da tabela de faixas do credor', () => {
  const o = calcularOferta(120000, 2, 30, REGRAS_TESTE);
  assert.equal(o.parceladoEstendido.length, 2);
  const [tresX, quatroX] = o.parceladoEstendido;
  assert.equal(tresX.parcelas, 3);
  assert.equal(tresX.descontoPct, 5); // faixa 2-3x = 5%, configurada no painel
  assert.equal(quatroX.parcelas, 4);
  assert.equal(quatroX.descontoPct, 10); // faixa 4-6x = 10%
  assert.ok(tresX.valorParcelaCentavos * tresX.parcelas >= tresX.totalCentavos);
});

test('sem tabela de faixas informada, nao ha parcelamento estendido nenhum', () => {
  const o = calcularOferta(120000, 2, 30);
  assert.deepEqual(o.parceladoEstendido, []);
});

test('permitido.centavos e percentuaisPct incluem as parcelas estendidas, e descontosPorDegrau tambem', () => {
  const ctx = montarContextoNegociacao(120000, 30, 1, REGRAS_TESTE);
  const [tresX, quatroX] = ctx.ofertaAtual!.parceladoEstendido;
  assert.ok(ctx.permitido.centavos.includes(tresX.valorParcelaCentavos));
  assert.ok(ctx.permitido.centavos.includes(quatroX.totalCentavos));
  assert.ok(ctx.permitido.percentuaisPct.includes(tresX.descontoPct));
  const mapa = ctx.permitido.descontosPorDegrau![1];
  assert.ok(mapa.percentuaisEstendidos.includes(tresX.descontoPct));
  assert.ok(mapa.percentuaisEstendidos.includes(quatroX.descontoPct));
});

test('blocoOfertasLiberadas marca as parcelas estendidas com id proprio e uso restrito', () => {
  const ctx = montarContextoNegociacao(120000, 30, 1, REGRAS_TESTE);
  const bloco = JSON.parse(blocoOfertasLiberadas(ctx));
  const estendida = bloco.ofertas_liberadas.find((o: { id: string }) => o.id === '1C');
  assert.ok(estendida);
  assert.equal(estendida.parcelas, 3);
  assert.match(estendida.uso, /so se o cliente pedir/);
});
