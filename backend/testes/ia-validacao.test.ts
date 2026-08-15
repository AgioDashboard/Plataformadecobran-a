import test from 'node:test';
import assert from 'node:assert/strict';
import { validarResposta } from '../src/ia/responder.ts';

const base = {
  intencao: 'pede_boleto' as const,
  resposta: 'Claro, vou providenciar a segunda via.',
  encaminhar_humano: false,
  silenciar: false,
};

test('resposta sem valor monetario passa', () => {
  assert.equal(validarResposta(base, 'R$ 1.287,90').ok, true);
});

test('resposta com o valor correto da divida passa', () => {
  const d = { ...base, resposta: 'O valor em aberto e R$ 1.287,90.' };
  assert.equal(validarResposta(d, 'R$ 1.287,90').ok, true);
});

test('resposta inventando outro valor e barrada', () => {
  const d = { ...base, resposta: 'Consigo fechar por R$ 800,00.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /valor/);
});

test('resposta com percentual de desconto e barrada', () => {
  const d = { ...base, resposta: 'Posso dar 20% de desconto.' };
  const r = validarResposta(d, 'R$ 1.287,90');
  assert.equal(r.ok, false);
  assert.match(r.motivo, /desconto/);
});

test('resposta vazia e barrada', () => {
  assert.equal(validarResposta({ ...base, resposta: '   ' }, null).ok, false);
});

test('resposta longa demais e barrada', () => {
  const d = { ...base, resposta: 'a'.repeat(1001) };
  assert.equal(validarResposta(d, null).ok, false);
});

test('pedido de parar sempre silencia, mesmo se a IA esquecer', () => {
  const d = { ...base, intencao: 'pede_para_parar' as const, silenciar: false };
  const r = validarResposta(d, null);
  assert.equal(r.ok, false);
  assert.match(r.motivo, /silenciar/);
});
