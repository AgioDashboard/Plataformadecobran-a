import type { Config } from '../config.ts';
import type { CredorId } from '../dominio/credor.ts';
import { comoCredorId } from '../dominio/credor.ts';
import { autorizado } from './autenticacao.ts';

// Hoje so existe um tipo de sessao: o operador interno, que enxerga
// qualquer carteira desde que diga qual. O tipo 'credor' ja esta previsto
// para quando houver login proprio — nenhum endpoint precisara mudar,
// porque todos derivam o escopo daqui.
export type Escopo = { tipo: 'operador' } | { tipo: 'credor'; credorId: CredorId };

export interface Sessao {
  escopo: Escopo;
}

export function abrirSessao(requisicao: Request, config: Config): Sessao | null {
  if (!autorizado(requisicao, config)) return null;
  return { escopo: { tipo: 'operador' } };
}

export type EscopoResolvido =
  | { ok: true; credorId: CredorId }
  | { ok: false; motivo: string };

// Nao existe consulta "de todos os credores". Operador sem ?credor= recebe
// 400: e melhor uma tela que pede a escolha do que uma tela que mistura
// carteiras sem ninguem perceber.
export function escopoDaConsulta(sessao: Sessao, url: URL): EscopoResolvido {
  if (sessao.escopo.tipo === 'credor') {
    return { ok: true, credorId: sessao.escopo.credorId };
  }

  const bruto = url.searchParams.get('credor');
  if (!bruto) return { ok: false, motivo: 'informe o credor na consulta' };

  const credorId = comoCredorId(bruto);
  if (!credorId) return { ok: false, motivo: 'identificador de credor invalido' };

  return { ok: true, credorId };
}
