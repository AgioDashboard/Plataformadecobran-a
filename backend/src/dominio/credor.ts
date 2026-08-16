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

export interface RegrasCredor {
  descontoMaximoPct: number;
  parcelamentoMaximo: number;
  comissaoSobreRecuperadoPct: number;
}

export type Validacao = { ok: true } | { ok: false; motivo: string };

function percentualValido(valor: number): boolean {
  return Number.isFinite(valor) && valor >= 0 && valor <= 100;
}

// O CHECK do SQLite ja barra valor fora de faixa, mas errar aqui devolve
// 400 com explicacao em vez de 500 com erro de banco.
export function validarRegras(r: RegrasCredor): Validacao {
  if (!percentualValido(r.descontoMaximoPct)) {
    return { ok: false, motivo: 'desconto maximo deve ficar entre 0 e 100' };
  }
  if (!percentualValido(r.comissaoSobreRecuperadoPct)) {
    return { ok: false, motivo: 'comissao deve ficar entre 0 e 100' };
  }
  if (
    !Number.isInteger(r.parcelamentoMaximo) ||
    r.parcelamentoMaximo < 1 ||
    r.parcelamentoMaximo > 60
  ) {
    return { ok: false, motivo: 'parcelamento maximo deve ser inteiro entre 1 e 60' };
  }
  return { ok: true };
}
