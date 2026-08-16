import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizarCpf, cpfValido, mascararCpf } from '../src/dominio/cpf.ts';

// CPFs FICTICIOS com digitos verificadores corretos, gerados para teste.
const VALIDO = '52998224725';
const VALIDO_2 = '11144477735';

test('normaliza tirando pontuacao', () => {
  assert.equal(normalizarCpf('529.982.247-25'), VALIDO);
  assert.equal(normalizarCpf(null as unknown as string), '');
});

test('cpf com digitos verificadores corretos e valido', () => {
  assert.equal(cpfValido(VALIDO), true);
  assert.equal(cpfValido(VALIDO_2), true);
  assert.equal(cpfValido('529.982.247-25'), true);
});

test('cpf com digito verificador errado e invalido', () => {
  assert.equal(cpfValido('52998224726'), false);
});

test('cpf com todos os digitos iguais e invalido', () => {
  // 11111111111 passa na conta dos verificadores mas nao existe.
  assert.equal(cpfValido('11111111111'), false);
  assert.equal(cpfValido('00000000000'), false);
});

test('cpf com tamanho errado e invalido', () => {
  assert.equal(cpfValido('123'), false);
  assert.equal(cpfValido(''), false);
  assert.equal(cpfValido('529982247250'), false);
});

test('mascara mostra so os tres ultimos digitos antes do verificador', () => {
  assert.equal(mascararCpf(VALIDO), '***.***.247-25');
  assert.equal(mascararCpf('invalido'), 'sem CPF');
});
