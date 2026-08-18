import test from 'node:test';
import assert from 'node:assert/strict';
import {
  estaAbsorvente,
  podeRenegociarAposAcordo,
  proximoEstadoAposContatoSemResposta,
  transicaoValida,
} from '../src/dominio/estados.ts';

test('nunca ENGAGED direto para OFFER sem passar por DISCOVERY', () => {
  assert.equal(transicaoValida('ENGAGED', 'OFFER'), false);
  assert.equal(transicaoValida('ENGAGED', 'DISCOVERY'), true);
  assert.equal(transicaoValida('DISCOVERY', 'OFFER'), true);
});

test('DISPUTED e ESCALATED sao absorventes: nenhuma transicao sai deles', () => {
  assert.equal(transicaoValida('DISPUTED', 'NEGOTIATING'), false);
  assert.equal(transicaoValida('DISPUTED', 'OFFER'), false);
  assert.equal(transicaoValida('ESCALATED', 'AGREEMENT'), false);
  assert.equal(estaAbsorvente('DISPUTED'), true);
  assert.equal(estaAbsorvente('ESCALATED'), true);
});

test('PAID nao tem transicao de saida (fim de linha, bem-sucedido)', () => {
  assert.equal(transicaoValida('PAID', 'ENGAGED'), false);
  assert.equal(estaAbsorvente('PAID'), true);
});

test('AGREEMENT so avanca para PAYMENT_PENDING', () => {
  assert.equal(transicaoValida('AGREEMENT', 'PAYMENT_PENDING'), true);
  assert.equal(transicaoValida('AGREEMENT', 'NEGOTIATING'), false);
  assert.equal(transicaoValida('AGREEMENT', 'OFFER'), false);
});

test('so pode voltar a negociar apos acordo vindo de PAYMENT_PENDING (nunca de AGREEMENT direto)', () => {
  assert.equal(podeRenegociarAposAcordo('PAYMENT_PENDING'), true);
  assert.equal(podeRenegociarAposAcordo('AGREEMENT'), false);
});

test('acordo quebrado volta para ENGAGED, nao para AGREEMENT nem OFFER', () => {
  assert.equal(transicaoValida('BROKEN_PROMISE', 'ENGAGED'), true);
  assert.equal(transicaoValida('BROKEN_PROMISE', 'AGREEMENT'), false);
});

test('4 contatos sem resposta leva a DORMANT, menos que isso continua CONTACTED', () => {
  assert.equal(proximoEstadoAposContatoSemResposta(4), 'DORMANT');
  assert.equal(proximoEstadoAposContatoSemResposta(5), 'DORMANT');
  assert.equal(proximoEstadoAposContatoSemResposta(3), 'CONTACTED');
  assert.equal(proximoEstadoAposContatoSemResposta(1), 'CONTACTED');
});

test('DORMANT reengaja em ENGAGED quando o cliente responde', () => {
  assert.equal(transicaoValida('DORMANT', 'ENGAGED'), true);
  assert.equal(estaAbsorvente('DORMANT'), true); // absorvente ate reengajar, nao permanente
});

test('NEGOTIATING pode esgotar em STALLED sem aceite', () => {
  assert.equal(transicaoValida('NEGOTIATING', 'STALLED'), true);
  assert.equal(transicaoValida('STALLED', 'NEGOTIATING'), true); // pode retomar depois
});

test('COUNTER_OFFER abaixo do piso pode voltar para OFFER (protocolo 8.15) ou travar', () => {
  assert.equal(transicaoValida('COUNTER_OFFER', 'OFFER'), true);
  assert.equal(transicaoValida('COUNTER_OFFER', 'STALLED'), true);
  assert.equal(transicaoValida('COUNTER_OFFER', 'AGREEMENT'), true);
});

test('qualquer estado ativo pode escalar para DISPUTED ou ESCALATED', () => {
  for (const de of ['OFFER', 'NEGOTIATING', 'COUNTER_OFFER'] as const) {
    assert.equal(transicaoValida(de, 'DISPUTED'), true);
    assert.equal(transicaoValida(de, 'ESCALATED'), true);
  }
});
