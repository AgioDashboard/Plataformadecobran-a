import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarNumero, podeEnviarPara } from '../src/destinatarios.ts';

test('normalizarNumero remove formatacao', () => {
  assert.equal(normalizarNumero('+55 (11) 90000-0001'), '5511900000001');
  assert.equal(normalizarNumero('5511900000001'), '5511900000001');
});

test('numero na lista pode receber', () => {
  assert.equal(podeEnviarPara('5511900000001', ['5511900000001']), true);
});

test('numero fora da lista nao pode receber', () => {
  assert.equal(podeEnviarPara('5511999999999', ['5511900000001']), false);
});

test('formatacao diferente ainda casa', () => {
  assert.equal(podeEnviarPara('+55 11 90000-0001', ['5511900000001']), true);
});

test('lista vazia bloqueia todo mundo', () => {
  assert.equal(podeEnviarPara('5511900000001', []), false);
});

test('numero vazio nunca passa', () => {
  assert.equal(podeEnviarPara('', ['5511900000001']), false);
  assert.equal(podeEnviarPara('', []), false);
});

// --- Nono digito: a Meta entrega celular brasileiro sem o 9 em alguns
// casos. Sem tolerancia, a allowlist barra o proprio numero autorizado. ---

test('lista com 9, Meta entrega sem 9', () => {
  assert.equal(podeEnviarPara('553500000001', ['5535900000001']), true);
});

test('lista sem 9, Meta entrega com 9', () => {
  assert.equal(podeEnviarPara('5535900000001', ['553500000001']), true);
});

test('os dois formatos casam consigo mesmos', () => {
  assert.equal(podeEnviarPara('5535900000001', ['5535900000001']), true);
  assert.equal(podeEnviarPara('553500000001', ['553500000001']), true);
});

test('tolerancia nao aproxima numeros diferentes', () => {
  assert.equal(podeEnviarPara('5535900000001', ['5535900000002']), false);
  assert.equal(podeEnviarPara('553500000001', ['553500000002']), false);
  assert.equal(podeEnviarPara('5535900000001', ['5511900000001']), false);
});

test('numero de outro pais nao sofre remocao de digito', () => {
  // +1 415 900 00001 — o 9 na quinta posicao nao e o nono digito brasileiro.
  assert.equal(podeEnviarPara('1415900000001', ['14159000000']), false);
});

test('celular de 13 digitos sem 9 na posicao esperada fica intacto', () => {
  assert.equal(podeEnviarPara('5535800000001', ['55358000000']), false);
});

test('formatacao continua sendo ignorada junto com o nono digito', () => {
  assert.equal(podeEnviarPara('+55 (35) 90000-0001', ['553500000001']), true);
});
