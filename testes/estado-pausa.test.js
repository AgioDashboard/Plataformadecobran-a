import test from 'node:test';
import assert from 'node:assert/strict';
import {
  lerPausa,
  alternarPausa,
  lerEventosPausa,
  CHAVE_PAUSA,
} from '../estado-pausa.js';

// Dublê de localStorage: mesma interface, em memoria.
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
      throw new Error('armazenamento bloqueado');
    },
    setItem() {
      throw new Error('armazenamento bloqueado');
    },
  };
}

test('lerPausa devolve ativo quando nao ha nada gravado', () => {
  assert.deepEqual(lerPausa(armazenamentoFalso()), { pausado: false, desde: null });
});

test('lerPausa devolve ativo quando o conteudo esta corrompido', () => {
  const armazenamento = armazenamentoFalso({ [CHAVE_PAUSA]: 'nao é json{{' });
  assert.deepEqual(lerPausa(armazenamento), { pausado: false, desde: null });
});

test('lerPausa devolve ativo quando o armazenamento esta indisponivel', () => {
  assert.deepEqual(lerPausa(armazenamentoQueFalha()), { pausado: false, desde: null });
});

test('alternarPausa liga a pausa e registra a data', () => {
  const armazenamento = armazenamentoFalso();
  const agora = new Date(2026, 7, 15, 10, 0);
  const estado = alternarPausa(armazenamento, agora);
  assert.equal(estado.pausado, true);
  assert.equal(estado.desde, agora.toISOString());
  assert.deepEqual(lerPausa(armazenamento), estado);
});

test('alternarPausa desliga a pausa na segunda chamada', () => {
  const armazenamento = armazenamentoFalso();
  alternarPausa(armazenamento, new Date(2026, 7, 15, 10, 0));
  const estado = alternarPausa(armazenamento, new Date(2026, 7, 15, 11, 0));
  assert.equal(estado.pausado, false);
  assert.equal(lerPausa(armazenamento).pausado, false);
});

test('cada alternancia acrescenta um evento, do mais recente para o mais antigo', () => {
  const armazenamento = armazenamentoFalso();
  alternarPausa(armazenamento, new Date(2026, 7, 15, 10, 0));
  alternarPausa(armazenamento, new Date(2026, 7, 15, 11, 0));
  const eventos = lerEventosPausa(armazenamento);
  assert.equal(eventos.length, 2);
  assert.equal(eventos[0].pausado, false);
  assert.equal(eventos[1].pausado, true);
  assert.notEqual(eventos[0].id, eventos[1].id);
});

test('alternarPausa nao lanca quando o armazenamento falha', () => {
  const estado = alternarPausa(armazenamentoQueFalha(), new Date(2026, 7, 15, 10, 0));
  assert.equal(estado.pausado, true);
});

test('lerEventosPausa devolve lista vazia quando nao ha eventos', () => {
  assert.deepEqual(lerEventosPausa(armazenamentoFalso()), []);
});
