// Um teste por frase de frases_reais.md, usando o texto literal que ja
// travou o sistema em algum momento — nao uma parafrase. E o arquivo que a
// Fase 1 pede como criterio de aceite: "existe um teste para cada frase".
import test from 'node:test';
import assert from 'node:assert/strict';
import { percentuaisCitadosPct, validarResposta, valoresCitadosCentavos } from '../src/ia/responder.ts';
import { montarContextoNegociacao } from '../src/dominio/negociacao.ts';

test('frase #1 — "15% de desconto": grau_apresentado bate com o percentual citado', () => {
  const ctx = montarContextoNegociacao(120000, 30, 0);
  const decisao = {
    intencao: 'negociacao' as const,
    resposta: 'a vista R$ 1.020,00 (15% de desconto) ou 2x de R$ 546,00 (9% de desconto)',
    motivo_escalar: 'nenhum' as const,
    silenciar: false,
    proposta_do_cliente_centavos: null,
    cliente_aceitou: false,
    grau_apresentado: 1,
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
  assert.equal(validarResposta(decisao, ctx.permitido).ok, true);
});

test('frase #2 — "500 reais": extraido mesmo informal, sem cifra e sem centavos', () => {
  assert.deepEqual(valoresCitadosCentavos('500 reais'), [50000]);
});

test('frase #3 — "só consigo 400": numero solto, sem marcador monetario, nao e extraido', () => {
  assert.deepEqual(valoresCitadosCentavos('só consigo 400'), []);
});

test('frase #4 — "R$ 400": cifra sem centavos e reconhecida', () => {
  assert.deepEqual(valoresCitadosCentavos('R$ 400'), [40000]);
});

test('frase #5 — "da pra fazer 300?": numero solto em pergunta, nao e extraido', () => {
  assert.deepEqual(valoresCitadosCentavos('da pra fazer 300?'), []);
});

test('frase #6 — eco de valor do cliente na resposta da IA passa a validacao', () => {
  const texto = 'Em 4x eu não consigo, mas fico bem abaixo dos R$ 500,00 que você mencionou: são R$ 492,00 por parcela.';
  const decisao = {
    intencao: 'negociacao' as const,
    resposta: texto,
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
    percentuaisPct: percentuaisCitadosPct(texto),
  };
  assert.equal(validarResposta(decisao, permitido).ok, true);
});

test('frase #7 — "1,5 mil" e "1.5k" viram 150000 centavos', () => {
  assert.deepEqual(valoresCitadosCentavos('1,5 mil'), [150000]);
  assert.deepEqual(valoresCitadosCentavos('1.5k'), [150000]);
});

test('frase #8 — "dois mil" e "mil e quinhentos" por extenso', () => {
  assert.deepEqual(valoresCitadosCentavos('dois mil'), [200000]);
  assert.deepEqual(valoresCitadosCentavos('mil e quinhentos'), [150000]);
});

test('frase #9 — "6x de 250": valor de parcela extraido', () => {
  assert.deepEqual(valoresCitadosCentavos('6x de 250'), [25000]);
});

test('frase #10 — "entrada de 300": valor de entrada extraido', () => {
  assert.deepEqual(valoresCitadosCentavos('entrada de 300'), [30000]);
});
