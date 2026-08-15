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
