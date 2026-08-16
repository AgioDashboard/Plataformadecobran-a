import type { Config } from '../config.ts';

// CORS restrito a uma origem conhecida.
//
// Nunca "*": a API do painel exige o cabecalho Authorization, e liberar
// qualquer origem convidaria qualquer pagina da internet a tentar usar um
// token vazado. Origem nao configurada = ninguem recebe permissao.

export function cabecalhosCors(requisicao: Request, config: Config): Headers {
  const cabecalhos = new Headers();
  const origem = requisicao.headers.get('origin');

  if (origem && config.origemPainel && origem === config.origemPainel) {
    cabecalhos.set('access-control-allow-origin', origem);
    cabecalhos.set('access-control-allow-methods', 'GET, POST, OPTIONS');
    cabecalhos.set('access-control-allow-headers', 'authorization, content-type');
    cabecalhos.set('access-control-max-age', '86400');
  }

  // A resposta muda conforme a origem: sem isto, um cache poderia servir a
  // permissao de uma origem para outra.
  cabecalhos.set('vary', 'origin');
  return cabecalhos;
}

export function responderPreflight(requisicao: Request, config: Config): Response {
  return new Response(null, { status: 204, headers: cabecalhosCors(requisicao, config) });
}

export function comCors(resposta: Response, requisicao: Request, config: Config): Response {
  const cabecalhos = new Headers(resposta.headers);
  for (const [nome, valor] of cabecalhosCors(requisicao, config)) {
    cabecalhos.set(nome, valor);
  }
  return new Response(resposta.body, {
    status: resposta.status,
    statusText: resposta.statusText,
    headers: cabecalhos,
  });
}
