import test from 'node:test';
import assert from 'node:assert/strict';
import { dentroDaJanela } from '../src/dominio/janela.ts';

const AGORA = new Date('2026-08-15T12:00:00.000Z');

test('sem mensagem do cliente, nao ha janela', () => {
  assert.equal(dentroDaJanela(null, AGORA), false);
});

test('mensagem de uma hora atras esta na janela', () => {
  assert.equal(dentroDaJanela('2026-08-15T11:00:00.000Z', AGORA), true);
});

test('mensagem de 23h59 atras ainda esta na janela', () => {
  assert.equal(dentroDaJanela('2026-08-14T12:01:00.000Z', AGORA), true);
});

test('mensagem de 24h01 atras esta fora', () => {
  assert.equal(dentroDaJanela('2026-08-14T11:59:00.000Z', AGORA), false);
});

test('exatamente 24h esta fora — a borda fecha', () => {
  assert.equal(dentroDaJanela('2026-08-14T12:00:00.000Z', AGORA), false);
});

test('data invalida fecha a janela', () => {
  assert.equal(dentroDaJanela('nao é data', AGORA), false);
});
