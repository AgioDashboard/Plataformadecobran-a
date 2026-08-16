import test from 'node:test';
import assert from 'node:assert/strict';
import { classificarTelefone, prioridadeInicial, LIMITE_TELEFONES } from '../src/dominio/telefone.ts';

// Todos os numeros abaixo sao FICTICIOS.
test('celular brasileiro de 9 digitos comecando com 9 e celular', () => {
  assert.equal(classificarTelefone('5535900000001'), 'celular');
  assert.equal(classificarTelefone('+55 (35) 90000-0001'), 'celular');
});

test('fixo de 8 digitos e fixo', () => {
  assert.equal(classificarTelefone('553530000001'), 'fixo');
});

test('nove digitos que nao comecam com 9 e fixo, nao celular', () => {
  // 55 35 800000001 — nono digito presente mas assinante comeca com 8.
  assert.equal(classificarTelefone('5535800000001'), 'fixo');
});

test('numero curto demais e invalido', () => {
  assert.equal(classificarTelefone('5535900'), 'invalido');
  assert.equal(classificarTelefone(''), 'invalido');
});

test('numero longo demais e invalido', () => {
  assert.equal(classificarTelefone('553590000000123456'), 'invalido');
});

test('numero de outro pais nao e chutado como fixo brasileiro', () => {
  // 351 e Portugal. Sem regra local, entra como celular para nao
  // despriorizar por engano quem esta fora do Brasil.
  assert.equal(classificarTelefone('351912345678'), 'celular');
});

test('celular tem prioridade melhor que fixo', () => {
  assert.ok(prioridadeInicial('celular', 0) < prioridadeInicial('fixo', 0));
});

test('entre dois celulares vale a ordem de cadastro', () => {
  assert.ok(prioridadeInicial('celular', 0) < prioridadeInicial('celular', 1));
});

test('o ultimo celular ainda vem antes do primeiro fixo', () => {
  assert.ok(prioridadeInicial('celular', LIMITE_TELEFONES - 1) < prioridadeInicial('fixo', 0));
});

test('invalido fica atras de tudo', () => {
  assert.ok(prioridadeInicial('invalido', 0) > prioridadeInicial('fixo', LIMITE_TELEFONES - 1));
});
