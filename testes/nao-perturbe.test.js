import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerSilenciados,
  estaSilenciado,
  alternarSilencio,
  lerEventosSilencio,
  CHAVE_SILENCIADOS,
} from '../nao-perturbe.js';

function armazenamentoFalso(inicial = {}) {
  const dados = new Map(Object.entries(inicial));
  return {
    getItem: (chave) => (dados.has(chave) ? dados.get(chave) : null),
    setItem: (chave, valor) => dados.set(chave, String(valor)),
  };
}

function armazenamentoQueFalha() {
  return {
    getItem() {
      throw new Error('bloqueado');
    },
    setItem() {
      throw new Error('bloqueado');
    },
  };
}

const AGORA = new Date(2026, 7, 15, 10, 0);

test('sem nada gravado, ninguem esta silenciado', () => {
  const a = armazenamentoFalso();
  assert.deepEqual(lerSilenciados(a), []);
  assert.equal(estaSilenciado(a, 'c-001'), false);
});

test('conteudo corrompido nao silencia ninguem', () => {
  const a = armazenamentoFalso({ [CHAVE_SILENCIADOS]: '{{quebrado' });
  assert.deepEqual(lerSilenciados(a), []);
});

test('armazenamento indisponivel nao silencia ninguem', () => {
  assert.deepEqual(lerSilenciados(armazenamentoQueFalha()), []);
  assert.equal(estaSilenciado(armazenamentoQueFalha(), 'c-001'), false);
});

test('alternar silencia o cliente', () => {
  const a = armazenamentoFalso();
  assert.equal(alternarSilencio(a, 'c-001', AGORA).silenciado, true);
  assert.equal(estaSilenciado(a, 'c-001'), true);
});

test('alternar duas vezes devolve o cliente ao normal', () => {
  const a = armazenamentoFalso();
  alternarSilencio(a, 'c-001', AGORA);
  assert.equal(alternarSilencio(a, 'c-001', AGORA).silenciado, false);
  assert.equal(estaSilenciado(a, 'c-001'), false);
});

test('silenciar um cliente nao afeta os outros', () => {
  const a = armazenamentoFalso();
  alternarSilencio(a, 'c-001', AGORA);
  assert.equal(estaSilenciado(a, 'c-002'), false);
  assert.deepEqual(lerSilenciados(a), ['c-001']);
});

test('varios clientes podem estar silenciados ao mesmo tempo', () => {
  const a = armazenamentoFalso();
  alternarSilencio(a, 'c-001', AGORA);
  alternarSilencio(a, 'c-002', AGORA);
  assert.deepEqual(lerSilenciados(a).sort(), ['c-001', 'c-002']);
});

test('cada alternancia registra evento, mais recente primeiro', () => {
  const a = armazenamentoFalso();
  alternarSilencio(a, 'c-001', new Date(2026, 7, 15, 10, 0));
  alternarSilencio(a, 'c-002', new Date(2026, 7, 15, 11, 0));
  const eventos = lerEventosSilencio(a);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].clienteId, 'c-002');
  assert.equal(eventos[0].silenciado, true);
  assert.equal(eventos[1].clienteId, 'c-001');
});

test('alternar nao lanca quando o armazenamento falha', () => {
  assert.equal(alternarSilencio(armazenamentoQueFalha(), 'c-001', AGORA).silenciado, true);
});

test('lista de eventos comeca vazia', () => {
  assert.deepEqual(lerEventosSilencio(armazenamentoFalso()), []);
});
