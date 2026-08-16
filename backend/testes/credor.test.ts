import test from 'node:test';
import assert from 'node:assert/strict';
import { comoCredorId } from '../src/dominio/credor.ts';

// A validacao das regras comerciais mudou de forma e de arquivo: os casos
// dela vivem agora em faixas.test.ts. Aqui sobra o que sempre foi deste
// modulo — o identificador de credor.

test('identificador de credor aceita minusculas com hifen', () => {
  assert.equal(comoCredorId('formatura-abc'), 'formatura-abc');
});

test('identificador com aspas ou espaco e recusado', () => {
  assert.equal(comoCredorId("a' OR 1=1"), null);
  assert.equal(comoCredorId('com espaco'), null);
  assert.equal(comoCredorId(''), null);
});
