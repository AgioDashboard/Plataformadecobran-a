import test from 'node:test';
import assert from 'node:assert/strict';
import { avaliarPortao } from '../src/dominio/portao.ts';

const liberado = {
  pausaGlobal: false,
  silenciado: false,
  naAllowlist: true,
  tipo: 'template' as const,
  dentroDaJanela: false,
};

test('tudo liberado permite o envio de template', () => {
  assert.deepEqual(avaliarPortao(liberado), { permitido: true, motivo: 'ok' });
});

test('pausa global bloqueia', () => {
  const r = avaliarPortao({ ...liberado, pausaGlobal: true });
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /pausa global/);
});

test('cliente silenciado bloqueia mesmo sem pausa global', () => {
  const r = avaliarPortao({ ...liberado, silenciado: true });
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /nao perturbe/);
});

test('fora da allowlist bloqueia', () => {
  const r = avaliarPortao({ ...liberado, naAllowlist: false });
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /allowlist/);
});

test('texto livre fora da janela e bloqueado', () => {
  const r = avaliarPortao({ ...liberado, tipo: 'livre', dentroDaJanela: false });
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /janela/);
});

test('texto livre dentro da janela e permitido', () => {
  const r = avaliarPortao({ ...liberado, tipo: 'livre', dentroDaJanela: true });
  assert.equal(r.permitido, true);
});

test('a pausa global vence a janela aberta', () => {
  const r = avaliarPortao({
    ...liberado,
    pausaGlobal: true,
    tipo: 'livre',
    dentroDaJanela: true,
  });
  assert.equal(r.permitido, false);
  assert.match(r.motivo, /pausa global/);
});
