import { lerConfig } from './config.ts';
import type { Ambiente } from './config.ts';
import { receber, verificarInscricao } from './whatsapp/webhook.ts';

export default {
  async fetch(requisicao: Request, env: Ambiente): Promise<Response> {
    const url = new URL(requisicao.url);
    const config = lerConfig(env);

    if (url.pathname === '/saude') {
      return Response.json({ ok: true, ambiente: config.ambiente });
    }

    if (url.pathname === '/webhook') {
      if (requisicao.method === 'GET') return verificarInscricao(url, config);
      if (requisicao.method === 'POST') return receber(requisicao, config, env.DB);
      return new Response('Metodo nao permitido', { status: 405 });
    }

    return new Response('Nao encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Ambiente>;
