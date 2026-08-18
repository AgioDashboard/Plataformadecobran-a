import test from 'node:test';
import assert from 'node:assert/strict';
import { ESQUEMA_DECISAO, MOTIVOS_ESCALAR, SYSTEM } from '../src/ia/prompt.ts';

test('MOTIVOS_ESCALAR cobre a lista de escalamento da spec (§8.9-8.13)', () => {
  for (const motivo of [
    'nenhum',
    'contestacao',
    'ja_pagou',
    'ameaca_processo',
    'agressividade',
    'superendividamento',
    'remocao_negativacao',
    'menor_de_idade',
    'obito',
    'exigencia_humano',
    'terceiro_atende',
  ]) {
    assert.ok((MOTIVOS_ESCALAR as readonly string[]).includes(motivo), `faltando: ${motivo}`);
  }
});

test('ESQUEMA_DECISAO exige os campos de descoberta (spec §4.4/§6.3)', () => {
  assert.ok('data_renda_declarada' in ESQUEMA_DECISAO.properties);
  assert.ok('capacidade_declarada_centavos' in ESQUEMA_DECISAO.properties);
  assert.ok(ESQUEMA_DECISAO.required.includes('data_renda_declarada'));
  assert.ok(ESQUEMA_DECISAO.required.includes('capacidade_declarada_centavos'));
});

// Regressao: nenhuma reescrita futura do prompt pode remover silenciosamente
// uma das travas duras. Cada frase aqui e uma proibicao/regra que ja existia
// (Fase 1) ou que a Fase 2 (spec) exige explicitamente.
test('SYSTEM preserva as travas duras essenciais', () => {
  const regras = [
    /nunca calcula desconto/i,
    /nunca revela.*desconto maximo/i,
    /nunca ameace/i,
    /nunca afirme ser humana/i,
    /nunca peca senha/i,
    /nunca cobre valor que o cliente contestou/i,
    /nao fale sobre a divida com essa pessoa/i, // terceiro atende
    /minimo necessario a subsistencia/i, // superendividamento / mínimo existencial
  ];
  for (const regra of regras) {
    assert.match(SYSTEM, regra);
  }
});

test('SYSTEM instrui a ordem de descoberta data-antes-de-valor (spec §6.3)', () => {
  assert.match(SYSTEM, /DATA antes de VALOR/);
});

test('SYSTEM menciona a regra 1-2-3 de pedido de humano', () => {
  assert.match(SYSTEM, /condicao especial.*insiste/is);
});

test('ESQUEMA_DECISAO exige os campos da tatica de espera estrategica', () => {
  assert.ok('usar_espera_estrategica' in ESQUEMA_DECISAO.properties);
  assert.ok('resposta_apos_espera' in ESQUEMA_DECISAO.properties);
  assert.ok('grau_apresentado_apos_espera' in ESQUEMA_DECISAO.properties);
  assert.ok(ESQUEMA_DECISAO.required.includes('usar_espera_estrategica'));
  assert.ok(ESQUEMA_DECISAO.required.includes('resposta_apos_espera'));
  assert.ok(ESQUEMA_DECISAO.required.includes('grau_apresentado_apos_espera'));
});

test('SYSTEM explica quando usar e quando nao usar a espera estrategica', () => {
  assert.match(SYSTEM, /ESPERA ESTRATEGICA/);
  assert.match(SYSTEM, /primeira oferta da conversa/i);
});

test('ESQUEMA_DECISAO exige os campos do Adendo 1 (fechamento e perguntas pendentes)', () => {
  for (const campo of [
    'valor_fechado_centavos',
    'parcelas_fechadas',
    'perguntas_novas',
    'perguntas_resolvidas',
  ]) {
    assert.ok(campo in ESQUEMA_DECISAO.properties, `faltando: ${campo}`);
    assert.ok((ESQUEMA_DECISAO.required as readonly string[]).includes(campo), `nao obrigatorio: ${campo}`);
  }
});

test('SYSTEM nunca reabre desconto numa negociacao ja fechada (Adendo 1, Defeito 1)', () => {
  assert.match(SYSTEM, /NEGOCIACAO JA FECHADA/);
  assert.match(SYSTEM, /nunca mais oferece desconto/i);
});

test('SYSTEM nunca promete acao sem ferramenta disponivel (Adendo 1, Defeito 5)', () => {
  assert.match(SYSTEM, /FERRAMENTAS/);
  assert.match(SYSTEM, /nunca promete uma acao que nao tem como executar/i);
});

test('SYSTEM instrui perguntas fora de FATOS_LIBERADOS a nunca virar fallback de oferta (Adendo 1, Defeito 3\\/6)', () => {
  assert.match(SYSTEM, /FATOS_LIBERADOS/);
  assert.match(SYSTEM, /perguntas_novas/);
  assert.match(SYSTEM, /PERGUNTAS_PENDENTES.*prioridade/is);
});
