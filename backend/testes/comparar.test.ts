import test from 'node:test';
import assert from 'node:assert/strict';
import {
  iguaisEmTempoConstante,
  textosIguaisEmTempoConstante,
} from '../src/seguranca/comparar.ts';

const bytes = (s: string) => new TextEncoder().encode(s);

test('bytes iguais retornam true', () => {
  assert.equal(iguaisEmTempoConstante(bytes('abc'), bytes('abc')), true);
});

test('bytes diferentes de mesmo tamanho retornam false', () => {
  assert.equal(iguaisEmTempoConstante(bytes('abc'), bytes('abd')), false);
});

test('tamanhos diferentes retornam false sem lancar', () => {
  assert.equal(iguaisEmTempoConstante(bytes('abc'), bytes('abcd')), false);
});

test('vazios sao iguais', () => {
  assert.equal(iguaisEmTempoConstante(bytes(''), bytes('')), true);
});

test('comparacao de texto funciona com acento', () => {
  assert.equal(textosIguaisEmTempoConstante('senha-ção', 'senha-ção'), true);
  assert.equal(textosIguaisEmTempoConstante('senha-ção', 'senha-cao'), false);
});
