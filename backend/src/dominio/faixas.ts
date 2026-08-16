// Faixas de parcelamento por credor. Substituem o par
// (descontoMaximoPct, parcelamentoMaximo) da Fase 3, que descrevia um
// limite e nao uma oferta: com ele o portal so sabia dar o desconto maximo
// a vista e nada nas demais parcelas.
//
// A validacao vive aqui, pura e testada. O formulario do painel apenas
// espelha estas regras — a que vale e esta, no servidor.

export interface FaixaParcelamento {
  de: number;
  ate: number;
  descontoPct: number;
}

export interface RegrasCredor {
  faixas: FaixaParcelamento[];
  parcelaMinimaCentavos: number;
  descontoTetoPct: number;
  comissaoSobreRecuperadoPct: number;
}

export type Validacao = { ok: true } | { ok: false; motivo: string };

export const PARCELAS_MAXIMO = 60;

function percentualValido(v: number): boolean {
  return Number.isFinite(v) && v >= 0 && v <= 100;
}

export function validarRegras(r: RegrasCredor): Validacao {
  if (!percentualValido(r.descontoTetoPct)) {
    return { ok: false, motivo: 'o teto de desconto deve ficar entre 0 e 100' };
  }
  if (!percentualValido(r.comissaoSobreRecuperadoPct)) {
    return { ok: false, motivo: 'a comissão deve ficar entre 0 e 100' };
  }
  if (!Number.isInteger(r.parcelaMinimaCentavos) || r.parcelaMinimaCentavos <= 0) {
    return { ok: false, motivo: 'a parcela mínima deve ser um valor positivo' };
  }

  const faixas = Array.isArray(r.faixas) ? r.faixas : [];
  if (faixas.length === 0) {
    // Salvar vazio por engano deixaria o portal mudo sem ninguem perceber.
    return { ok: false, motivo: 'configure ao menos uma faixa de parcelamento' };
  }

  // A cobertura precisa ser continua a partir de 1: sobreposicao daria dois
  // descontos possiveis para a mesma quantidade de parcelas, e buraco faria
  // uma quantidade sumir do portal sem explicacao nenhuma.
  let esperado = 1;
  for (const [i, f] of faixas.entries()) {
    if (!Number.isInteger(f.de) || !Number.isInteger(f.ate)) {
      return { ok: false, motivo: 'as quantidades de parcelas devem ser números inteiros' };
    }
    if (f.de > f.ate) {
      return { ok: false, motivo: `na faixa ${i + 1}, o início é maior que o fim` };
    }
    if (f.ate > PARCELAS_MAXIMO) {
      return { ok: false, motivo: `o máximo é ${PARCELAS_MAXIMO} parcelas` };
    }
    if (!percentualValido(f.descontoPct)) {
      return { ok: false, motivo: `na faixa ${i + 1}, o desconto deve ficar entre 0 e 100` };
    }
    if (f.descontoPct > r.descontoTetoPct) {
      return {
        ok: false,
        motivo: `na faixa ${i + 1}, o desconto de ${f.descontoPct}% passa do teto de ${r.descontoTetoPct}%`,
      };
    }
    if (f.de < esperado) {
      return {
        ok: false,
        motivo: i === 0 ? 'a primeira faixa precisa começar em 1' : `a faixa ${i + 1} se sobrepõe à anterior`,
      };
    }
    if (f.de > esperado) {
      return {
        ok: false,
        motivo:
          i === 0
            ? 'a primeira faixa precisa começar em 1'
            : `faltam faixas entre ${esperado} e ${f.de - 1} parcelas: a sequência precisa ser contínua`,
      };
    }
    esperado = f.ate + 1;
  }

  return { ok: true };
}
