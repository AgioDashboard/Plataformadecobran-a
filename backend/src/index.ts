import { lerConfig } from './config.ts';
import type { Ambiente } from './config.ts';
import { receber, verificarInscricao } from './whatsapp/webhook.ts';
import { rotearPainel } from './api/painel.ts';
import { autorizado, pedirCredencial } from './api/autenticacao.ts';
import { ehRotaDoPainel, servirPainel } from './painel/servir.ts';
import { lerPausaGlobal, registrarAuditoria } from './dominio/travas.ts';

export default {
  // ctx nao pode ser desestruturado: waitUntil perde o this e lanca.
  async fetch(requisicao: Request, env: Ambiente, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(requisicao.url);
    const config = lerConfig(env);

    // /saude nao expoe nada e serve de sonda de disponibilidade.
    if (url.pathname === '/saude') {
      return Response.json({ ok: true, ambiente: config.ambiente });
    }

    // O webhook autentica pela assinatura da Meta, nao pelo token do painel.
    if (url.pathname === '/webhook') {
      if (requisicao.method === 'GET') return verificarInscricao(url, config);
      if (requisicao.method === 'POST') return receber(requisicao, config, env.DB, ctx);
      return new Response('Metodo nao permitido', { status: 405 });
    }

    // Daqui para baixo, tudo exige o token do painel. O painel e a API sao
    // servidos da mesma origem, entao nao ha CORS envolvido.
    if (url.pathname.startsWith('/api/') || ehRotaDoPainel(url)) {
      if (!autorizado(requisicao, config)) {
        return pedirCredencial();
      }

      if (url.pathname.startsWith('/api/')) {
        return rotearPainel(requisicao, url, config, env.DB);
      }
      return servirPainel(url);
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
