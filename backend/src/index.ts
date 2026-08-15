import { lerConfig } from './config.ts';
import type { Ambiente } from './config.ts';
import { receber, verificarInscricao } from './whatsapp/webhook.ts';
import { rotearPainel } from './api/painel.ts';
import { lerPausaGlobal, registrarAuditoria } from './dominio/travas.ts';

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

    if (url.pathname.startsWith('/api/')) {
      return rotearPainel(requisicao, url, config, env.DB);
    }

    return new Response('Nao encontrado', { status: 404 });
  },

  async scheduled(_evento: ScheduledController, env: Ambiente): Promise<void> {
    const config = lerConfig(env);

    if (await lerPausaGlobal(env.DB)) {
      await registrarAuditoria(env.DB, {
        acao: 'cron-ignorado',
        telefone: null,
        detalhe: 'pausa global ligada',
      });
      return;
    }

    // O disparo em lote nasce DESLIGADO. Liga-lo e uma decisao separada,
    // tomada depois de ver o fluxo funcionando com um cliente so.
    await registrarAuditoria(env.DB, {
      acao: 'cron-executado',
      telefone: null,
      detalhe: `ambiente ${config.ambiente}, disparo em lote desativado`,
    });
  },
} satisfies ExportedHandler<Ambiente>;
