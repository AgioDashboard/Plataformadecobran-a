import type { Config } from '../config.ts';
import { definirPausaGlobal, definirSilencio, lerPausaGlobal } from '../dominio/travas.ts';
import { textosIguaisEmTempoConstante } from '../seguranca/comparar.ts';

// O token do painel merece o mesmo cuidado que a assinatura do webhook.
function autorizado(requisicao: Request, config: Config): boolean {
  const cabecalho = requisicao.headers.get('authorization') ?? '';
  return textosIguaisEmTempoConstante(cabecalho, `Bearer ${config.painelToken}`);
}

export async function rotearPainel(
  requisicao: Request,
  url: URL,
  config: Config,
  db: D1Database,
): Promise<Response> {
  if (!autorizado(requisicao, config)) {
    return new Response('Nao autorizado', { status: 401 });
  }

  if (url.pathname === '/api/estado' && requisicao.method === 'GET') {
    const pausado = await lerPausaGlobal(db);
    const { results: silenciados } = await db
      .prepare('SELECT telefone FROM nao_perturbe WHERE silenciado = 1')
      .all<{ telefone: string }>();
    return Response.json({ pausado, silenciados: silenciados.map((s) => s.telefone) });
  }

  if (url.pathname === '/api/pausa' && requisicao.method === 'POST') {
    const { pausado } = (await requisicao.json()) as { pausado: boolean };
    if (typeof pausado !== 'boolean') {
      return new Response('Campo pausado deve ser booleano', { status: 400 });
    }
    await definirPausaGlobal(db, pausado, 'painel');
    return Response.json({ pausado });
  }

  if (url.pathname === '/api/silencio' && requisicao.method === 'POST') {
    const { telefone, silenciado } = (await requisicao.json()) as {
      telefone: string;
      silenciado: boolean;
    };
    if (typeof telefone !== 'string' || telefone.length === 0) {
      return new Response('Campo telefone obrigatorio', { status: 400 });
    }
    if (typeof silenciado !== 'boolean') {
      return new Response('Campo silenciado deve ser booleano', { status: 400 });
    }
    await definirSilencio(db, telefone, silenciado, 'painel');
    return Response.json({ telefone, silenciado });
  }

  if (url.pathname === '/api/conversas' && requisicao.method === 'GET') {
    const { results } = await db
      .prepare(
        `SELECT telefone, direcao, texto, quando, origem FROM conversas
         ORDER BY quando DESC LIMIT 200`,
      )
      .all();
    return Response.json({ conversas: results });
  }

  return new Response('Nao encontrado', { status: 404 });
}
