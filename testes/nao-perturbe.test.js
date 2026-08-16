import test from 'node:test';
import assert from 'node:assert/strict';
import { estaSilenciado, contarSilenciados } from '../nao-perturbe.js';

// Todos os numeros aqui sao FICTICIOS.

test('telefone na lista aparece como silenciado', () => {
  assert.equal(estaSilenciado(['5535900000001'], '5535900000001'), true);
});

test('telefone fora da lista nao aparece como silenciado', () => {
  assert.equal(estaSilenciado(['5535900000001'], '5535900000002'), false);
});

test('formato com e sem o nono digito casa nos dois sentidos', () => {
  // O servidor pode ter gravado de um jeito e a carteira trazer o outro.
  // Errar aqui faz a tela dizer "ativo" para quem esta protegido.
  assert.equal(estaSilenciado(['5535900000001'], '553500000001'), true);
  assert.equal(estaSilenciado(['553500000001'], '5535900000001'), true);
});

test('mascara e pontuacao nao atrapalham a comparacao', () => {
  assert.equal(estaSilenciado(['5535900000001'], '+55 (35) 90000-0001'), true);
});

test('lista vazia, nula ou telefone vazio nao silencia ninguem', () => {
  assert.equal(estaSilenciado([], '5535900000001'), false);
  assert.equal(estaSilenciado(null, '5535900000001'), false);
  assert.equal(estaSilenciado(['5535900000001'], ''), false);
});

test('contagem reflete a lista do servidor', () => {
  assert.equal(contarSilenciados(['5535900000001', '5535900000002']), 2);
  assert.equal(contarSilenciados([]), 0);
  assert.equal(contarSilenciados(undefined), 0);
});
