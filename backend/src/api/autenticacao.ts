import type { Config } from '../config.ts';
import { textosIguaisEmTempoConstante } from '../seguranca/comparar.ts';

// Duas formas de provar o mesmo segredo:
//
// - Bearer: para chamadas programaticas (curl, script).
// - Basic: para o navegador. Uma navegacao comum nao consegue mandar
//   cabecalho Authorization, entao o painel depende do prompt nativo do
//   navegador — que depois reenvia a credencial sozinho em cada fetch.
//
// O usuario do Basic e ignorado de proposito: o segredo e a senha.

export function autorizado(requisicao: Request, config: Config): boolean {
  const cabecalho = requisicao.headers.get('authorization') ?? '';

  if (cabecalho.startsWith('Bearer ')) {
    return textosIguaisEmTempoConstante(cabecalho, `Bearer ${config.painelToken}`);
  }

  if (cabecalho.startsWith('Basic ')) {
    let decodificado: string;
    try {
      decodificado = atob(cabecalho.slice('Basic '.length));
    } catch {
      return false;
    }
    const separador = decodificado.indexOf(':');
    if (separador === -1) return false;
    const senha = decodificado.slice(separador + 1);
    return textosIguaisEmTempoConstante(senha, config.painelToken);
  }

  return false;
}

// 401 com WWW-Authenticate faz o navegador abrir o prompt de senha.
export function pedirCredencial(): Response {
  return new Response('Nao autorizado', {
    status: 401,
    headers: { 'www-authenticate': 'Basic realm="Painel de Cobranca", charset="UTF-8"' },
  });
}
