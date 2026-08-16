import { normalizarNumero } from '../destinatarios.ts';

export interface Cliente {
  nome: string;
  telefone: string;
  valorCentavos: number;
  vencimento: string;
}

// Planilha exportada do Cobmais: ponto e virgula, valor em pt-BR,
// data em dd/mm/aaaa.
//
// Linha que nao interpreta e DESCARTADA, nunca adivinhada. Cobrar o valor
// errado e pior do que nao cobrar.
export function interpretarCsv(texto: string): Cliente[] {
  const linhas = texto.trim().split(/\r?\n/).slice(1);

  return linhas.flatMap((linha) => {
    const [nome, telefoneBruto, valorBruto, vencimentoBruto] = linha.split(';');
    if (!nome || !telefoneBruto || !valorBruto || !vencimentoBruto) return [];

    const telefone = normalizarNumero(telefoneBruto);
    if (telefone.length < 12) return [];

    const centavos = Math.round(
      Number(valorBruto.trim().replace(/\./g, '').replace(',', '.')) * 100,
    );
    if (!Number.isFinite(centavos) || centavos <= 0) return [];

    const [dia, mes, ano] = vencimentoBruto.trim().split('/');
    if (!dia || !mes || !ano) return [];

    return [
      {
        nome: nome.trim(),
        telefone,
        valorCentavos: centavos,
        vencimento: `${ano}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`,
      },
    ];
  });
}
