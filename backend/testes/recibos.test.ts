import test from 'node:test';
import assert from 'node:assert/strict';
import { extrairRecibos } from '../src/whatsapp/recibos.ts';

// Todos os numeros abaixo sao FICTICIOS.
function envelope(statuses: unknown[]) {
  return { entry: [{ changes: [{ field: 'messages', value: { statuses } }] }] };
}

test('recibo de entrega e extraido', () => {
  const r = extrairRecibos(
    envelope([{ id: 'wamid.AAA', status: 'delivered', recipient_id: '5535900000001' }]),
  );
  assert.deepEqual(r, [
    { idExterno: 'wamid.AAA', destinatario: '5535900000001', status: 'delivered', codigoErro: null },
  ]);
});

test('recibo de falha traz o codigo do erro', () => {
  const r = extrairRecibos(
    envelope([
      {
        id: 'wamid.BBB',
        status: 'failed',
        recipient_id: '5535900000002',
        errors: [{ code: 131026, title: 'Message undeliverable' }],
      },
    ]),
  );
  assert.equal(r[0].codigoErro, 131026);
});

test('envelope so com mensagens nao produz recibo', () => {
  const r = extrairRecibos({
    entry: [{ changes: [{ value: { messages: [{ from: '5535900000001', id: 'x' }] } }] }],
  });
  assert.deepEqual(r, []);
});

test('status desconhecido e descartado em vez de virar recibo torto', () => {
  const r = extrairRecibos(envelope([{ id: 'wamid.CCC', status: 'inventado', recipient_id: '55' }]));
  assert.deepEqual(r, []);
});

test('recibo sem id e descartado', () => {
  const r = extrairRecibos(envelope([{ status: 'delivered', recipient_id: '5535900000001' }]));
  assert.deepEqual(r, []);
});

test('corpo vazio ou torto nao lanca', () => {
  assert.deepEqual(extrairRecibos(null), []);
  assert.deepEqual(extrairRecibos({}), []);
  assert.deepEqual(extrairRecibos({ entry: 'nao e array' }), []);
});

test('varios recibos no mesmo envelope saem todos', () => {
  const r = extrairRecibos(
    envelope([
      { id: 'wamid.A', status: 'sent', recipient_id: '5535900000001' },
      { id: 'wamid.B', status: 'read', recipient_id: '5535900000002' },
    ]),
  );
  assert.equal(r.length, 2);
});
