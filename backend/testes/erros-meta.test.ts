import test from 'node:test';
import assert from 'node:assert/strict';
import { efeitoDoErro } from '../src/dominio/erros-meta.ts';

test('mensagem nao entregavel marca o telefone como sem whatsapp', () => {
  assert.equal(efeitoDoErro(131026).novoStatus, 'sem_whatsapp');
});

test('erro de reengajamento NAO marca sem whatsapp', () => {
  // 131047 significa "fora da janela de 24 horas". O numero existe no
  // WhatsApp; marca-lo como morto perderia um telefone bom para sempre.
  const efeito = efeitoDoErro(131047);
  assert.equal(efeito.novoStatus, null);
  assert.match(efeito.motivo, /janela/i);
});

test('remetente igual ao destinatario e cadastro invalido', () => {
  assert.equal(efeitoDoErro(131021).novoStatus, 'invalido');
});

test('codigo desconhecido nao muda status nenhum', () => {
  const efeito = efeitoDoErro(999999);
  assert.equal(efeito.novoStatus, null);
  assert.match(efeito.motivo, /desconhecido/i);
});

test('falha sem codigo nao muda status', () => {
  assert.equal(efeitoDoErro(null).novoStatus, null);
});

test('erro de template nao condena o telefone', () => {
  // 132001: template inexistente. O problema e nosso, nao do numero.
  assert.equal(efeitoDoErro(132001).novoStatus, null);
});
