import { lerConfig } from './config.ts';
import type { Ambiente } from './config.ts';
import { receber, verificarInscricao } from './whatsapp/webhook.ts';
import { rotearPainel } from './api/painel.ts';
import { pedirCredencial } from './api/autenticacao.ts';
import { abrirSessao } from './api/sessao.ts';
import { ehRotaDoPainel, servirPainel } from './painel/servir.ts';
import { lerPausaGlobal, registrarAuditoria } from './dominio/travas.ts';

// Tentativa sem recibo nao pode travar a fila para sempre: silencio da
// Meta nao e prova de nada. Depois de uma hora, a tentativa e encerrada
// como 'sem_recibo' e o telefone CONTINUA 'desconhecido' — so a fila anda.
const MINUTOS_ATE_DESTRAVAR = 60;

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
      // A sessao substitui o booleano de antes: cada rota de dados deriva
      // dela de qual carteira pode falar, em vez de confiar na URL.
      const sessao = abrirSessao(requisicao, config);
      if (!sessao) {
        return pedirCredencial();
      }

      if (url.pathname.startsWith('/api/')) {
        return rotearPainel(requisicao, url, sessao, env.DB);
      }
      return servirPainel(url);
    }

    return new Response('Nao encontrado', { status: 404 });
  },

  async scheduled(_evento: ScheduledController, env: Ambiente): Promise<void> {
    const config = lerConfig(env);

    const limite = new Date(Date.now() - MINUTOS_ATE_DESTRAVAR * 60_000).toISOString();
    const paradas = await env.DB.prepare(
      `UPDATE tentativas_contato SET fechada_em = ?, desfecho = 'sem_recibo'
       WHERE fechada_em IS NULL AND aberta_em < ?`,
    )
      .bind(new Date().toISOString(), limite)
      .run();

    const destravadas = paradas.meta.changes ?? 0;
    if (destravadas > 0) {
      await registrarAuditoria(env.DB, {
        acao: 'tentativas-destravadas',
        telefone: null,
        detalhe: `${destravadas} tentativa(s) sem recibo apos ${MINUTOS_ATE_DESTRAVAR} minutos`,
      });
    }

    // O destravamento roda ANTES da checagem de pausa de proposito: limpar
    // fila travada nao envia nada e precisa acontecer mesmo com a operacao
    // parada.
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
