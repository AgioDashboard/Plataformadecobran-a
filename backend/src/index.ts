import { lerConfig } from './config.ts';
import type { Ambiente } from './config.ts';

export default {
  async fetch(requisicao: Request, env: Ambiente): Promise<Response> {
    const url = new URL(requisicao.url);

    if (url.pathname === '/saude') {
      // Nao expoe valor de configuracao — so confirma que ela carregou.
      try {
        lerConfig(env);
        return Response.json({ ok: true, ambiente: env.AMBIENTE });
      } catch (erro) {
        return Response.json({ ok: false, erro: String(erro) }, { status: 500 });
      }
    }

    return new Response('Nao encontrado', { status: 404 });
  },
} satisfies ExportedHandler<Ambiente>;
