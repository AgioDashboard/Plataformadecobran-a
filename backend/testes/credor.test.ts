import test from 'node:test';
import assert from 'node:assert/strict';
import { comoCredorId, validarRegras } from '../src/dominio/credor.ts';

const validas = { descontoMaximoPct: 20, parcelamentoMaximo: 6, comissaoSobreRecuperadoPct: 15 };

test('regras dentro dos limites passam', () => {
  assert.deepEqual(validarRegras(validas), { ok: true });
});

test('desconto acima de 100 por cento e recusado', () => {
  const r = validarRegras({ ...validas, descontoMaximoPct: 101 });
  assert.equal(r.ok, false);
});

test('desconto negativo e recusado', () => {
  const r = validarRegras({ ...validas, descontoMaximoPct: -1 });
  assert.equal(r.ok, false);
});

test('parcelamento menor que uma parcela e recusado', () => {
  const r = validarRegras({ ...validas, parcelamentoMaximo: 0 });
  assert.equal(r.ok, false);
});

test('parcelamento nao inteiro e recusado', () => {
  const r = validarRegras({ ...validas, parcelamentoMaximo: 2.5 });
  assert.equal(r.ok, false);
});

test('comissao acima de 100 por cento e recusada', () => {
  const r = validarRegras({ ...validas, comissaoSobreRecuperadoPct: 120 });
  assert.equal(r.ok, false);
});

test('identificador de credor aceita minusculas com hifen', () => {
  assert.equal(comoCredorId('formatura-abc'), 'formatura-abc');
});

test('identificador com aspas ou espaco e recusado', () => {
  assert.equal(comoCredorId("a' OR 1=1"), null);
  assert.equal(comoCredorId('com espaco'), null);
  assert.equal(comoCredorId(''), null);
});
