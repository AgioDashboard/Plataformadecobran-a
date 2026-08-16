import test from 'node:test';
import assert from 'node:assert/strict';
import { abrirSessao, escopoDaConsulta } from '../src/api/sessao.ts';
import { comoCredorId } from '../src/dominio/credor.ts';

const config = {
  ambiente: 'teste',
  whatsapp: { token: 'x', numeroId: 'x', contaId: 'x', verifyToken: 'x', appSecret: 'x' },
  anthropicApiKey: 'x',
  painelToken: 'segredo-do-painel',
  destinatariosTeste: [],
};

function req(autorizacao: string | null): Request {
  return new Request('https://exemplo/api/conversas', {
    headers: autorizacao ? { authorization: autorizacao } : {},
  });
}

test('sem credencial nao abre sessao', () => {
  assert.equal(abrirSessao(req(null), config), null);
});

test('token do painel abre sessao de operador', () => {
  const s = abrirSessao(req('Bearer segredo-do-painel'), config);
  assert.deepEqual(s, { escopo: { tipo: 'operador' } });
});

test('operador precisa dizer de qual credor quer os dados', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas'));
  assert.equal(r.ok, false);
});

test('operador escolhe o credor pela query', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas?credor=credor-padrao'));
  assert.deepEqual(r, { ok: true, credorId: 'credor-padrao' });
});

test('credor invalido na query e recusado, nao ignorado', () => {
  const s = { escopo: { tipo: 'operador' as const } };
  const r = escopoDaConsulta(s, new URL("https://exemplo/api/conversas?credor=x'+OR+1=1"));
  assert.equal(r.ok, false);
});

test('sessao de credor ignora a query e usa o proprio escopo', () => {
  const s = { escopo: { tipo: 'credor' as const, credorId: comoCredorId('formatura-abc')! } };
  const r = escopoDaConsulta(s, new URL('https://exemplo/api/conversas?credor=credor-padrao'));
  assert.deepEqual(r, { ok: true, credorId: 'formatura-abc' });
});
