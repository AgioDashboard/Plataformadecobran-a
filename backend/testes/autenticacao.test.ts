import test from 'node:test';
import assert from 'node:assert/strict';
import { autorizado } from '../src/api/autenticacao.ts';

const config = { painelToken: 'senha-secreta' } as never;

function req(cabecalho?: string): Request {
  return new Request('https://exemplo/api/estado', {
    headers: cabecalho ? { authorization: cabecalho } : {},
  });
}

const basic = (usuario: string, senha: string) =>
  'Basic ' + Buffer.from(`${usuario}:${senha}`).toString('base64');

test('sem cabecalho nao autoriza', () => {
  assert.equal(autorizado(req(), config), false);
});

test('bearer correto autoriza', () => {
  assert.equal(autorizado(req('Bearer senha-secreta'), config), true);
});

test('bearer errado nao autoriza', () => {
  assert.equal(autorizado(req('Bearer outra'), config), false);
});

test('basic com a senha correta autoriza, qualquer usuario', () => {
  assert.equal(autorizado(req(basic('operador', 'senha-secreta')), config), true);
  assert.equal(autorizado(req(basic('', 'senha-secreta')), config), true);
});

test('basic com senha errada nao autoriza', () => {
  assert.equal(autorizado(req(basic('operador', 'chute')), config), false);
});

test('basic com senha contendo dois pontos funciona', () => {
  const c = { painelToken: 'a:b:c' } as never;
  assert.equal(autorizado(req(basic('u', 'a:b:c')), c), true);
});

test('basic malformado nao lanca', () => {
  assert.equal(autorizado(req('Basic nao-e-base64!!!'), config), false);
  assert.equal(autorizado(req('Basic ' + Buffer.from('semdoispontos').toString('base64')), config), false);
});

test('esquema desconhecido nao autoriza', () => {
  assert.equal(autorizado(req('Digest algo'), config), false);
});
