import test from 'node:test';
import assert from 'node:assert/strict';
import { validarResposta } from '../src/ia/responder.ts';
import type { ValoresPermitidos } from '../src/ia/responder.ts';

const base = {
  intencao: 'pede_boleto' as const,
  resposta: 'Claro, vou providenciar a segunda via.',
  motivo_escalar: 'nenhum' as const,
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
  perguntas_novas: [] as string[],
  perguntas_resolvidas: [] as string[],
};

const SO_VALOR_ORIGINAL: ValoresPermitidos = { centavos: [128790], percentuaisPct: [] };
const COM_OFERTA: ValoresPermitidos = { centavos: [128790, 109471], percentuaisPct: [15] };

test('resposta sem valor monetario passa', () => {
  assert.equal(validarResposta(base, SO_VALOR_ORIGINAL).ok, true);
});

test('resposta com o valor correto da divida passa', () => {
  const d = { ...base, resposta: 'O valor em aberto e R$ 1.287,90.' };
  assert.equal(validarResposta(d, SO_VALOR_ORIGINAL).ok, true);
});

test('resposta inventando outro valor e barrada', () => {
  const d = { ...base, resposta: 'Consigo fechar por R$ 800,00.' };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('resposta com percentual fora do autorizado e barrada', () => {
  const d = { ...base, resposta: 'Posso dar 20% de desconto.' };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto/);
});

test('resposta vazia e barrada', () => {
  assert.equal(validarResposta({ ...base, resposta: '   ' }, null).ok, false);
});

test('resposta longa demais e barrada', () => {
  const d = { ...base, resposta: 'a'.repeat(1001) };
  assert.equal(validarResposta(d, null).ok, false);
});

test('pedido de parar sempre silencia, mesmo se a IA esquecer', () => {
  const d = { ...base, intencao: 'pede_para_parar' as const, silenciar: false };
  const r = validarResposta(d, null);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /silenciar/);
});

// --- Valor por extenso e sempre barrado: nao da para confirmar o numero ---

test('valor por extenso e barrado mesmo com contexto de negociacao', () => {
  const d = { ...base, resposta: 'Consigo fechar por mil e duzentos reais.' };
  const r = validarResposta(d, COM_OFERTA);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('percentual por extenso e sempre barrado', () => {
  const d = { ...base, resposta: 'Posso tirar vinte por cento do valor.' };
  const r = validarResposta(d, COM_OFERTA);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto/);
});

test('ameaca de negativacao e barrada mesmo com contexto de negociacao', () => {
  for (const texto of [
    'Se nao pagar, seu nome vai para o SPC.',
    'Vamos negativar seu CPF.',
    'O caso segue para o Serasa.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, COM_OFERTA);
    assert.equal(r.ok, false, `deveria barrar: ${texto}`);
    assert.match(r.motivo, /coercao/);
  }
});

test('ameaca juridica e barrada, com ou sem acento', () => {
  for (const texto of [
    'Vamos entrar com acao judicial.',
    'O protesto em cartório ja foi solicitado.',
    'Nosso advogado vai entrar em contato.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, COM_OFERTA);
    assert.equal(r.ok, false, `deveria barrar: ${texto}`);
    assert.match(r.motivo, /coercao/);
  }
});

// --- Negociacao: numeros dentro do autorizado passam ---

test('desconto e valor dentro do autorizado pelo motor passam', () => {
  const d = {
    ...base,
    resposta: 'Consigo fazer 15% de desconto: fica R$ 1.094,71 a vista.',
  };
  assert.equal(validarResposta(d, COM_OFERTA).ok, true);
});

test('percentual autorizado passa mesmo escrito como "por cento"', () => {
  const d = { ...base, resposta: 'Dou 15 por cento de desconto.' };
  assert.equal(validarResposta(d, COM_OFERTA).ok, true);
});

test('desconto acima do degrau atual e barrado mesmo dentro do teto do credor', () => {
  // COM_OFERTA so autoriza 15% neste turno; 30 nao esta na lista mesmo que
  // seja o teto do credor — a IA nao pode pular degrau sozinha.
  const d = { ...base, resposta: 'Posso fazer 30% de desconto.' };
  const r = validarResposta(d, COM_OFERTA);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto/);
});

test('sem contexto de negociacao (null), nenhum desconto passa', () => {
  const d = { ...base, resposta: 'Posso dar 15% de desconto.' };
  assert.equal(validarResposta(d, null).ok, false);
});

test('formatacao do valor nao importa, so o numero: com ou sem espaco apos R$', () => {
  const d = { ...base, resposta: 'Fica R$1.287,90 fechado.' };
  assert.equal(validarResposta(d, SO_VALOR_ORIGINAL).ok, true);
});

// Guarda contra excesso: se o validador barrar resposta legitima, a IA vira
// inutil e tudo cai no humano.
test('respostas legitimas continuam passando, com e sem negociacao', () => {
  for (const texto of [
    'Claro, vou providenciar a segunda via.',
    'Registrei seu pedido de prazo. Um atendente confirma em breve.',
    'O valor em aberto e R$ 1.287,90, com vencimento em 18/06/2026.',
    'Entendi, vou encaminhar para um atendente retomar o contato.',
    'Certo, nao enviaremos mais mensagens para este numero.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, SO_VALOR_ORIGINAL);
    assert.equal(r.ok, true, `nao deveria barrar: ${texto} (${r.motivo})`);
  }

  for (const texto of [
    'Consigo fazer 15% de desconto: fica R$ 1.094,71 a vista.',
    'Fechado! Confirmando o valor de R$ 1.094,71.',
  ]) {
    const r = validarResposta({ ...base, resposta: texto }, COM_OFERTA);
    assert.equal(r.ok, true, `nao deveria barrar: ${texto} (${r.motivo})`);
  }
});

/* ---------- valoresCitadosCentavos / percentuaisCitadosPct ---------- */

import { percentuaisCitadosPct, valoresCitadosCentavos } from '../src/ia/responder.ts';

test('extrai valor com cifra do texto do cliente', () => {
  assert.deepEqual(valoresCitadosCentavos('Consigo pagar R$ 400,00 no máximo'), [40000]);
});

test('extrai valor sem cifra, "reais" no fim', () => {
  assert.deepEqual(valoresCitadosCentavos('Não quero parcela de 500,00 reais pra cima'), [50000]);
});

test('nao extrai nada de texto sem valor', () => {
  assert.deepEqual(valoresCitadosCentavos('Não tem como parcelar em mais vezes?'), []);
});

// Regressao: o cliente escreve informal, sem centavos — "500 reais", nao
// "500,00 reais". O extrator estrito (usado para validar a resposta da IA)
// exige centavos de proposito; o do texto do cliente precisa ser mais
// frouxo, senao o numero que ele mesmo escreveu nunca entra na lista do
// que a IA pode ecoar de volta.
test('extrai valor "reais" informal, sem centavos', () => {
  assert.deepEqual(valoresCitadosCentavos('parcelas de 500 reais pra cima'), [50000]);
});

test('extrai cifra informal, sem centavos', () => {
  assert.deepEqual(valoresCitadosCentavos('Consigo pagar R$400 no máximo'), [40000]);
});

test('valor com milhar informal e reconhecido', () => {
  assert.deepEqual(valoresCitadosCentavos('minha dívida é de 1.200 reais'), [120000]);
});

test('extrai percentual em digitos, com % ou por cento', () => {
  assert.deepEqual(percentuaisCitadosPct('Consigo 15% ou até 20 por cento'), [15, 20]);
});

// Regressao: o mesmo numero que o cliente escreveu tem que poder ser usado
// para validar uma resposta que o cita de volta, mesmo sem ter sido
// "aceito" — e exatamente o caso que travou em producao em 2026-08-18.
test('resposta que ecoa o valor do cliente passa quando esse valor esta na lista de citados', () => {
  const decisao = {
    intencao: 'negociacao' as const,
    resposta: 'Em 4x eu não consigo, mas fico bem abaixo dos R$ 500,00 que você mencionou: são R$ 492,00 por parcela.',
    motivo_escalar: 'nenhum' as const,
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
  };
  const permitido = {
    centavos: [...valoresCitadosCentavos('parcelas de 500 reais pra cima'), 49200],
    percentuaisPct: [],
  };
  assert.equal(validarResposta(decisao, permitido).ok, true);
});

/* ---------- grau_apresentado: substitui a releitura por regex da prosa ---------- */

const COM_DESCONTOS_POR_DEGRAU: ValoresPermitidos = {
  centavos: [128790, 109471],
  percentuaisPct: [15, 9],
  descontosPorDegrau: { 1: { avistaPct: 15, parceladoPct: 9, percentuaisEstendidos: [] } },
};

test('grau_apresentado correto, com o percentual realmente citado no texto, passa', () => {
  const d = {
    ...base,
    resposta: 'Consigo fazer 15% de desconto a vista.',
    grau_apresentado: 1,
  };
  assert.equal(validarResposta(d, COM_DESCONTOS_POR_DEGRAU).ok, true);
});

test('grau_apresentado para um degrau que nao existe neste turno e barrado', () => {
  const d = {
    ...base,
    resposta: 'Consigo fazer 15% de desconto a vista.',
    grau_apresentado: 2, // so o degrau 1 esta disponivel neste turno
  };
  const r = validarResposta(d, COM_DESCONTOS_POR_DEGRAU);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /grau_apresentado/);
});

test('grau_apresentado preenchido mas o percentual nao aparece no texto e barrado', () => {
  // A IA disse que apresentou o degrau 1, mas a resposta nao cita nem 15%
  // nem 9% — campo estruturado errado nao passa so por estar la.
  const d = { ...base, resposta: 'Vou verificar sua situacao.', grau_apresentado: 1 };
  const r = validarResposta(d, COM_DESCONTOS_POR_DEGRAU);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /grau_apresentado/);
});

test('grau_apresentado null nunca e checado, mesmo com negociacao em curso', () => {
  const d = { ...base, resposta: 'Claro, vou providenciar a segunda via.', grau_apresentado: null };
  assert.equal(validarResposta(d, COM_DESCONTOS_POR_DEGRAU).ok, true);
});

/* ---------- espera estrategica: resposta_apos_espera precisa ser validada JA no turno ---------- */

test('usar_espera_estrategica sem resposta_apos_espera e barrado (senao o cliente fica sem retorno)', () => {
  const d = {
    ...base,
    resposta: 'Deixa eu verificar o que consigo liberar, so um minuto.',
    usar_espera_estrategica: true,
    resposta_apos_espera: null,
  };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /resposta_apos_espera/);
});

test('resposta_apos_espera com numero nao autorizado e barrada, igual a resposta imediata', () => {
  const d = {
    ...base,
    resposta: 'Deixa eu verificar, ja te retorno.',
    usar_espera_estrategica: true,
    resposta_apos_espera: 'Consigo fazer 25% de desconto.',
  };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /resposta_apos_espera/);
});

test('resposta_apos_espera valida, com grau_apresentado_apos_espera correto, passa', () => {
  const d = {
    ...base,
    resposta: 'Deixa eu verificar, ja te retorno.',
    usar_espera_estrategica: true,
    resposta_apos_espera: 'Consigo fazer 15% de desconto a vista.',
    grau_apresentado_apos_espera: 1,
  };
  assert.equal(validarResposta(d, COM_DESCONTOS_POR_DEGRAU).ok, true);
});

test('usar_espera_estrategica false ignora resposta_apos_espera, mesmo se tiver numero invalido', () => {
  const d = {
    ...base,
    resposta: 'Claro, vou providenciar a segunda via.',
    usar_espera_estrategica: false,
    resposta_apos_espera: 'Consigo fazer 99% de desconto.',
  };
  assert.equal(validarResposta(d, SO_VALOR_ORIGINAL).ok, true);
});

/* ---------- Adendo 1 (18/08), Defeito 1/7: fechamento via cliente_aceitou ---------- */

test('cliente_aceitou sem valor_fechado_centavos e barrado (senao o acordo nunca fecha no sistema)', () => {
  const d = { ...base, resposta: 'Fechado!', cliente_aceitou: true, valor_fechado_centavos: null };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor_fechado_centavos/);
});

test('valor_fechado_centavos fora do autorizado e barrado, igual a qualquer outro numero', () => {
  const d = { ...base, resposta: 'Fechado!', cliente_aceitou: true, valor_fechado_centavos: 999900 };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor_fechado_centavos/);
});

test('valor_fechado_centavos preenchido sem cliente_aceitou e barrado (nao pode fechar sozinho)', () => {
  const d = { ...base, resposta: 'Fechado!', cliente_aceitou: false, valor_fechado_centavos: 128790 };
  const r = validarResposta(d, SO_VALOR_ORIGINAL);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor_fechado_centavos/);
});

test('cliente_aceitou com valor_fechado_centavos autorizado passa', () => {
  const d = { ...base, resposta: 'Fechado!', cliente_aceitou: true, valor_fechado_centavos: 128790 };
  assert.equal(validarResposta(d, SO_VALOR_ORIGINAL).ok, true);
});

/* ---------- extrator robusto (1.4): formatos que ja apareceram ou vao aparecer ---------- */

test('extrai "1,5 mil" e "1.5k" como multiplicador de mil', () => {
  assert.deepEqual(valoresCitadosCentavos('consigo pagar 1,5 mil'), [150000]);
  assert.deepEqual(valoresCitadosCentavos('tenho uns 1.5k guardado'), [150000]);
});

test('extrai "dois mil" e "mil e quinhentos" por extenso', () => {
  assert.deepEqual(valoresCitadosCentavos('consigo pagar dois mil'), [200000]);
  assert.deepEqual(valoresCitadosCentavos('tenho mil e quinhentos sobrando'), [150000]);
});

test('numero por extenso solto, sem escala nem "reais", nao e extraido (ambiguo demais)', () => {
  // "tres" sozinho pode ser dia, parcela, hora — so extrai com "mil" ou
  // com um sufixo monetario explicito logo depois.
  assert.deepEqual(valoresCitadosCentavos('posso pagar em tres vezes'), []);
});

test('extrai valor de parcela em "6x de 250"', () => {
  assert.deepEqual(valoresCitadosCentavos('consigo fazer 6x de 250'), [25000]);
});

test('extrai valor de "entrada de 300"', () => {
  assert.deepEqual(valoresCitadosCentavos('topo dar entrada de 300 e o resto depois'), [30000]);
});

test('extrai giria informal "conto" e "pila" como reais', () => {
  assert.deepEqual(valoresCitadosCentavos('só tenho 400 conto agora'), [40000]);
  assert.deepEqual(valoresCitadosCentavos('mando uns 300 pila'), [30000]);
});
