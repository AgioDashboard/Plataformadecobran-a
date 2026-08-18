import test from 'node:test';
import assert from 'node:assert/strict';
import { consultarNumeroConfigurado } from '../src/whatsapp/diagnostico.ts';
import type { Config } from '../src/config.ts';

const config = {
  ambiente: 'teste',
  whatsapp: {
    token: 'token-de-teste',
    numeroId: '123456',
    contaId: '654321',
    verifyToken: 'v',
    appSecret: 's',
  },
  anthropicApiKey: 'k',
  painelToken: 'p',
  destinatariosTeste: [],
} as Config;

// Nenhum teste toca a Graph API de verdade: o fetch global e trocado por um
// dublê que devolve o que o caso precisa e registra o que foi pedido.
function comFetch(
  resposta: () => Promise<Response> | Response,
): { chamadas: Array<{ url: string; headers: Record<string, string> }>; restaurar: () => void } {
  const original = globalThis.fetch;
  const chamadas: Array<{ url: string; headers: Record<string, string> }> = [];
  globalThis.fetch = (async (entrada: RequestInfo | URL, init?: RequestInit) => {
    chamadas.push({
      url: String(entrada),
      headers: (init?.headers ?? {}) as Record<string, string>,
    });
    return resposta();
  }) as typeof fetch;
  return { chamadas, restaurar: () => { globalThis.fetch = original; } };
}

test('devolve o numero de exibicao e o nome verificado', async (t) => {
  const dublê = comFetch(() =>
    Response.json({
      display_phone_number: '+1 555-555-0100',
      verified_name: 'Agio Solucoes',
      quality_rating: 'GREEN',
    }),
  );
  t.after(dublê.restaurar);

  const r = await consultarNumeroConfigurado(config);
  assert.equal(r.ok, true);
  assert.equal(r.numeroExibicao, '+1 555-555-0100');
  assert.equal(r.nomeVerificado, 'Agio Solucoes');
  assert.equal(r.qualidade, 'GREEN');
  assert.equal(r.erro, null);
});

test('consulta o ID configurado e nao envia nada', async (t) => {
  const dublê = comFetch(() => Response.json({ display_phone_number: '+1 555-555-0100' }));
  t.after(dublê.restaurar);

  await consultarNumeroConfigurado(config);
  assert.equal(dublê.chamadas.length, 1);
  const { url } = dublê.chamadas[0];
  assert.match(url, /\/123456\?fields=/);
  // /messages e a rota de envio. Passar por ela aqui seria mandar mensagem
  // durante um diagnostico.
  assert.equal(url.includes('/messages'), false);
});

test('erro da Graph API vira ok:false com o motivo, sem lancar', async (t) => {
  const dublê = comFetch(() =>
    Response.json({ error: { message: 'Invalid OAuth access token' } }, { status: 401 }),
  );
  t.after(dublê.restaurar);

  const r = await consultarNumeroConfigurado(config);
  assert.equal(r.ok, false);
  assert.equal(r.numeroExibicao, null);
  assert.match(r.erro ?? '', /Invalid OAuth/);
});

test('o token nunca aparece no erro devolvido', async (t) => {
  // A Graph API as vezes ecoa trechos da requisicao na mensagem de erro.
  const dublê = comFetch(() =>
    Response.json(
      { error: { message: 'Bad request' }, request: 'Bearer token-de-teste' },
      { status: 400 },
    ),
  );
  t.after(dublê.restaurar);

  const r = await consultarNumeroConfigurado(config);
  assert.equal((r.erro ?? '').includes('token-de-teste'), false);
});

test('rede fora do ar vira ok:false, nao excecao', async (t) => {
  const dublê = comFetch(() => Promise.reject(new Error('rede indisponivel')));
  t.after(dublê.restaurar);

  const r = await consultarNumeroConfigurado(config);
  assert.equal(r.ok, false);
  assert.match(r.erro ?? '', /rede indisponivel/);
});
