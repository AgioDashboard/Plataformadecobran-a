// Identificador de credor. E um tipo ramificado: nenhuma string crua entra
// numa consulta de carteira por acidente, porque as funcoes do repositorio
// so aceitam CredorId — e a unica forma de obter um e passar por
// comoCredorId, que valida o formato.
declare const marcaCredor: unique symbol;
export type CredorId = string & { readonly [marcaCredor]: true };

const FORMATO = /^[a-z0-9][a-z0-9-]{1,48}[a-z0-9]$/;

export function comoCredorId(bruto: string): CredorId | null {
  const limpo = String(bruto ?? '').trim();
  return FORMATO.test(limpo) ? (limpo as CredorId) : null;
}

// As regras comerciais mudaram de forma na configuracao de ofertas e
// mudaram de arquivo junto. Reexportadas aqui para que os importadores
// existentes continuem funcionando.
export type { FaixaParcelamento, RegrasCredor, Validacao } from './faixas.ts';
export { validarRegras, PARCELAS_MAXIMO } from './faixas.ts';
