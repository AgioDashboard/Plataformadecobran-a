import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from '../logica.js';

test('formatarMoeda converte centavos em reais', () => {
  assert.equal(formatarMoeda(128790).replace(/ /g, ' '), 'R$ 1.287,90');
  assert.equal(formatarMoeda(0).replace(/ /g, ' '), 'R$ 0,00');
  assert.equal(formatarMoeda(5).replace(/ /g, ' '), 'R$ 0,05');
});

test('diasEmAtraso conta dias inteiros desde o vencimento', () => {
  const hoje = new Date(2026, 7, 15, 14, 30); // 15/08/2026, meio da tarde
  assert.equal(diasEmAtraso('2026-08-15', hoje), 0);
  assert.equal(diasEmAtraso('2026-08-05', hoje), 10);
  assert.equal(diasEmAtraso('2026-08-20', hoje), -5);
});

test('diasEmAtraso ignora a hora do dia', () => {
  const cedo = new Date(2026, 7, 15, 0, 5);
  const tarde = new Date(2026, 7, 15, 23, 55);
  assert.equal(diasEmAtraso('2026-08-05', cedo), diasEmAtraso('2026-08-05', tarde));
});

test('rotuloAtraso descreve atraso, vencimento hoje e a vencer', () => {
  assert.equal(rotuloAtraso(10), '10 dias');
  assert.equal(rotuloAtraso(1), '1 dia');
  assert.equal(rotuloAtraso(0), 'vence hoje');
  assert.equal(rotuloAtraso(-5), 'a vencer');
});

test('mascararTelefone esconde o miolo do numero', () => {
  assert.equal(mascararTelefone('5511900000001'), '(11) 9****-0001');
  assert.equal(mascararTelefone('5521912345678'), '(21) 9****-5678');
});

test('mascararTelefone devolve marcador para entrada invalida', () => {
  assert.equal(mascararTelefone(''), 'sem telefone');
  assert.equal(mascararTelefone('123'), 'sem telefone');
});

test('calcularTotais soma divida, conta clientes e mensagens de hoje', () => {
  const hoje = new Date(2026, 7, 15, 9, 0);
  const clientes = [
    { id: 'c-1', valorCentavos: 100000 },
    { id: 'c-2', valorCentavos: 25050 },
  ];
  const historico = [
    { id: 'h-1', quando: '2026-08-15T08:00:00-03:00', resultado: 'enviada' },
    { id: 'h-2', quando: '2026-08-14T08:00:00-03:00', resultado: 'enviada' },
    { id: 'h-3', quando: '2026-08-15T09:30:00-03:00', resultado: 'falhou' },
  ];
  assert.deepEqual(calcularTotais(clientes, historico, hoje), {
    totalCentavos: 125050,
    quantidadeClientes: 2,
    enviadasHoje: 1,
  });
});

test('calcularTotais lida com listas vazias', () => {
  assert.deepEqual(calcularTotais([], [], new Date(2026, 7, 15)), {
    totalCentavos: 0,
    quantidadeClientes: 0,
    enviadasHoje: 0,
  });
});
