import { mascarar, normalizarNumero, podeEnviarPara } from '../destinatarios.ts';
import { dentroDaJanela } from './janela.ts';

// Prepara a lista de destinatarios do teste manual. Puro de proposito: a
// decisao "esta janela esta aberta?" e a que desabilita o botao de enviar,
// e ela precisa ser testavel sem banco e sem rede.

export interface DestinatarioDeTeste {
  // O painel manda de volta o indice, nunca o numero. Assim o telefone
  // completo nao trafega para o navegador em nenhum momento — so a mascara.
  indice: number;
  mascarado: string;
  janelaAberta: boolean;
  ultimaEntrada: string | null;
}

export interface EntradaRecente {
  telefone: string;
  quando: string;
}

// O telefone usado no envio e o que a Meta ja nos entregou numa mensagem de
// entrada, e nao o que esta escrito na allowlist: e a forma que sabidamente
// chega. So quando nunca houve entrada e que caimos no texto configurado.
export function resolverTelefone(
  autorizado: string,
  recentes: EntradaRecente[],
): string {
  const conhecido = recentes.find((r) => podeEnviarPara(r.telefone, [autorizado]));
  return conhecido ? conhecido.telefone : normalizarNumero(autorizado);
}

export function montarDestinatarios(
  autorizados: string[],
  recentes: EntradaRecente[],
  agora: Date,
): DestinatarioDeTeste[] {
  return autorizados.map((autorizado, indice) => {
    const conhecido = recentes.find((r) => podeEnviarPara(r.telefone, [autorizado]));
    const ultimaEntrada = conhecido ? conhecido.quando : null;
    return {
      indice,
      mascarado: mascarar(autorizado),
      janelaAberta: dentroDaJanela(ultimaEntrada, agora),
      ultimaEntrada,
    };
  });
}

// Indice vindo do navegador e entrada nao confiavel como qualquer outra.
export function autorizadoNoIndice(
  autorizados: string[],
  indice: unknown,
): string | null {
  if (!Number.isInteger(indice)) return null;
  const i = indice as number;
  if (i < 0 || i >= autorizados.length) return null;
  return autorizados[i];
}
