import { ARQUIVOS_PAINEL } from './arquivos.ts';

// Serve o painel a partir do bundle do Worker. Nao existe URL publica: o
// roteador so chega aqui depois da autenticacao.

export function servirPainel(url: URL): Response {
  const caminho = url.pathname === '/' ? '/index.html' : url.pathname;
  const arquivo = ARQUIVOS_PAINEL[caminho];

  if (!arquivo) {
    return new Response('Nao encontrado', { status: 404 });
  }

  return new Response(arquivo.conteudo, {
    headers: {
      'content-type': arquivo.tipo,
      // Painel com dado real nao pode ficar em cache compartilhado.
      'cache-control': 'private, no-store',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
    },
  });
}

export function ehRotaDoPainel(url: URL): boolean {
  return url.pathname === '/' || Object.hasOwn(ARQUIVOS_PAINEL, url.pathname);
}
