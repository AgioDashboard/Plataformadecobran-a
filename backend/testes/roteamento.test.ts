import test from 'node:test';
import assert from 'node:assert/strict';
import { separarPorNumero } from '../src/whatsapp/roteamento.ts';

const NOSSO = '111111111111111';
const ALHEIO = '999999999999999';

function envelope(...valores: unknown[]) {
  return { entry: [{ changes: valores.map((value) => ({ value })) }] };
}

function mensagensDe(s: ReturnType<typeof separarPorNumero>) {
  return s.proprio.entry![0].changes!.flatMap((c) => c.value?.messages ?? []);
}

test('mensagem do nosso numero passa', () => {
  const s = separarPorNumero(
    envelope({
      metadata: { phone_number_id: NOSSO },
      messages: [{ from: '5535900000001', id: 'wamid.A', text: { body: 'oi' } }],
    }),
    NOSSO,
  );
  assert.equal(mensagensDe(s).length, 1);
  assert.deepEqual(s.alheios, []);
});

test('mensagem de outro numero da conta e descartada', () => {
  // O caso real de 2026-08-16: numeros de producao de outros sistemas na
  // mesma conta. Responder a esses clientes seria interferir num sistema
  // que funciona.
  const s = separarPorNumero(
    envelope({
      metadata: { phone_number_id: ALHEIO },
      messages: [{ from: '5514900000001', id: 'wamid.B', text: { body: 'oi' } }],
    }),
    NOSSO,
  );
  assert.equal(mensagensDe(s).length, 0);
  assert.deepEqual(s.alheios, [{ numeroId: ALHEIO, mensagens: 1, statuses: 0 }]);
});

test('o resumo do descarte nao carrega telefone nem texto do cliente alheio', () => {
  const s = separarPorNumero(
    envelope({
      metadata: { phone_number_id: ALHEIO },
      messages: [{ from: '5514900000001', id: 'wamid.C', text: { body: 'segredo' } }],
    }),
    NOSSO,
  );
  const serializado = JSON.stringify(s.alheios);
  assert.ok(!serializado.includes('5514900000001'));
  assert.ok(!serializado.includes('segredo'));
  assert.ok(!serializado.includes('wamid.C'));
});

test('evento sem metadata e descartado, nao processado', () => {
  const s = separarPorNumero(
    envelope({ messages: [{ from: '5535900000001', id: 'wamid.D', text: { body: 'oi' } }] }),
    NOSSO,
  );
  assert.equal(mensagensDe(s).length, 0);
  assert.equal(s.alheios[0].numeroId, '(sem metadata)');
});

test('numero configurado vazio nao deixa nada passar', () => {
  // Config quebrada bloqueia tudo em vez de liberar tudo.
  const s = separarPorNumero(envelope({ metadata: {}, messages: [] }), '');
  assert.equal(mensagensDe(s).length, 0);
});

test('mistura de nosso e alheio no mesmo envelope separa os dois', () => {
  const s = separarPorNumero(
    envelope(
      {
        metadata: { phone_number_id: NOSSO },
        messages: [{ from: '5535900000001', id: 'wamid.E', text: { body: 'nosso' } }],
      },
      {
        metadata: { phone_number_id: ALHEIO },
        messages: [{ from: '5514900000001', id: 'wamid.F', text: { body: 'alheio' } }],
        statuses: [{ id: 'wamid.G', status: 'delivered' }],
      },
    ),
    NOSSO,
  );
  assert.equal(mensagensDe(s).length, 1);
  assert.equal(mensagensDe(s)[0].text?.body, 'nosso');
  assert.deepEqual(s.alheios, [{ numeroId: ALHEIO, mensagens: 1, statuses: 1 }]);
});

test('recibo de entrega alheio tambem e descartado', () => {
  // Sem isto, um recibo de outro numero fecharia uma tentativa nossa por
  // coincidencia de wamid e classificaria o telefone errado.
  const s = separarPorNumero(
    envelope({
      metadata: { phone_number_id: ALHEIO },
      statuses: [{ id: 'wamid.H', status: 'delivered' }],
    }),
    NOSSO,
  );
  const statuses = s.proprio.entry![0].changes!.flatMap((c) => c.value?.statuses ?? []);
  assert.equal(statuses.length, 0);
});

test('corpo torto nao lanca', () => {
  assert.deepEqual(separarPorNumero(null, NOSSO).alheios, []);
  assert.deepEqual(separarPorNumero({}, NOSSO).alheios, []);
  assert.deepEqual(separarPorNumero({ entry: 'nao e array' }, NOSSO).alheios, []);
});
