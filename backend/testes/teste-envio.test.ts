import test from 'node:test';
import assert from 'node:assert/strict';
import {
  autorizadoNoIndice,
  montarDestinatarios,
  resolverTelefone,
} from '../src/dominio/teste-envio.ts';

const AGORA = new Date('2026-08-17T12:00:00.000Z');
const HA_UMA_HORA = '2026-08-17T11:00:00.000Z';
const HA_TRINTA_HORAS = '2026-08-16T06:00:00.000Z';

test('destinatario com entrada recente tem a janela aberta', () => {
  const [d] = montarDestinatarios(
    ['5535999993968'],
    [{ telefone: '5535999993968', quando: HA_UMA_HORA }],
    AGORA,
  );
  assert.equal(d.janelaAberta, true);
  assert.equal(d.ultimaEntrada, HA_UMA_HORA);
});

test('destinatario com entrada velha demais tem a janela fechada', () => {
  const [d] = montarDestinatarios(
    ['5535999993968'],
    [{ telefone: '5535999993968', quando: HA_TRINTA_HORAS }],
    AGORA,
  );
  assert.equal(d.janelaAberta, false);
});

test('destinatario que nunca escreveu tem a janela fechada', () => {
  const [d] = montarDestinatarios(['5535999993968'], [], AGORA);
  assert.equal(d.janelaAberta, false);
  assert.equal(d.ultimaEntrada, null);
});

// A tolerancia do nono digito ja existe em destinatarios.ts; aqui o que
// importa e que ela valha tambem para casar a entrada com a allowlist.
test('a entrada casa com a allowlist mesmo sem o nono digito', () => {
  const [d] = montarDestinatarios(
    ['+55 35 99999-3968'],
    [{ telefone: '553599993968', quando: HA_UMA_HORA }],
    AGORA,
  );
  assert.equal(d.janelaAberta, true);
});

test('a mascara esconde o miolo do numero e mantem os quatro ultimos', () => {
  const [d] = montarDestinatarios(['+55 35 99999-3968'], [], AGORA);
  assert.equal(d.mascarado.startsWith('+5535'), true);
  assert.equal(d.mascarado.endsWith('3968'), true);
  assert.equal(d.mascarado.includes('9999'), false);
});

test('o envio usa o telefone que a Meta ja entregou, nao o texto da allowlist', () => {
  const alvo = resolverTelefone('+55 35 99999-3968', [
    { telefone: '553599993968', quando: HA_UMA_HORA },
  ]);
  assert.equal(alvo, '553599993968');
});

test('sem entrada conhecida, o envio cai no numero configurado normalizado', () => {
  assert.equal(resolverTelefone('+55 35 99999-3968', []), '5535999993968');
});

test('indice fora da allowlist nao resolve numero nenhum', () => {
  const lista = ['5535999993968', '15550100000'];
  assert.equal(autorizadoNoIndice(lista, 1), '15550100000');
  assert.equal(autorizadoNoIndice(lista, 2), null);
  assert.equal(autorizadoNoIndice(lista, -1), null);
  assert.equal(autorizadoNoIndice(lista, '0'), null);
  assert.equal(autorizadoNoIndice(lista, 1.5), null);
  assert.equal(autorizadoNoIndice(lista, null), null);
});

// Allowlist vazia e o estado atual da configuracao local. O modo de falha
// desejado e nao haver destinatario nenhum para escolher.
test('allowlist vazia nao produz destinatario nenhum', () => {
  assert.deepEqual(montarDestinatarios([], [], AGORA), []);
  assert.equal(autorizadoNoIndice([], 0), null);
});
