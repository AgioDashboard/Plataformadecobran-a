import test from 'node:test';
import assert from 'node:assert/strict';
import { ddiDe, ehRemetenteDeTeste } from '../src/dominio/ddi.ts';

test('numero de exibicao dos EUA e reconhecido como DDI 1', () => {
  assert.equal(ddiDe('+1 555-555-0100'), '1');
  assert.equal(ddiDe('15550100000'), '1');
});

test('celular brasileiro com e sem o nono digito e reconhecido como DDI 55', () => {
  assert.equal(ddiDe('+55 35 99999-0000'), '55');
  assert.equal(ddiDe('+55 35 9999-0000'), '55');
});

test('numero de outro pais nao e reconhecido', () => {
  assert.equal(ddiDe('+351 21 000 0000'), null);
});

test('numero ausente ou vazio nao e reconhecido', () => {
  assert.equal(ddiDe(null), null);
  assert.equal(ddiDe(undefined), null);
  assert.equal(ddiDe(''), null);
});

test('so o numero de DDI 1 vale como remetente de teste', () => {
  assert.equal(ehRemetenteDeTeste('+1 555-555-0100'), true);
  assert.equal(ehRemetenteDeTeste('+55 35 99999-0000'), false);
});

// A trava so serve para alguma coisa se o desconhecido cair do lado do
// bloqueio. Diagnostico que falhou chega aqui como null.
test('numero que nao deu para conferir NAO vale como remetente de teste', () => {
  assert.equal(ehRemetenteDeTeste(null), false);
  assert.equal(ehRemetenteDeTeste('+351 21 000 0000'), false);
});
