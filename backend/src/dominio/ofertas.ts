import type { RegrasCredor } from './faixas.ts';
import { validarRegras } from './faixas.ts';

export interface Oferta {
  indice: number;
  parcelas: number;
  valorParcelaCentavos: number;
  totalCentavos: number;
  descontoPct: number;
}

// Calculo deterministico: mesma divida e mesma configuracao produzem sempre
// as mesmas opcoes. E isso que permite ao portal recalcular a lista para
// validar a escolha do devedor, em vez de confiar no que o navegador mandou
// — e que faz a previa do painel mostrar exatamente o que ele vera.
export function gerarOfertas(saldoCentavos: number, regras: RegrasCredor): Oferta[] {
  if (!Number.isFinite(saldoCentavos) || saldoCentavos <= 0) return [];

  // Configuracao invalida nao gera oferta. Defesa em profundidade: a mesma
  // checagem ja barra na gravacao, mas o portal nao depende disso.
  if (!validarRegras(regras).ok) return [];

  const ofertas: Array<Omit<Oferta, 'indice'>> = [];

  for (const faixa of regras.faixas) {
    for (let n = faixa.de; n <= faixa.ate; n += 1) {
      const total = Math.round(saldoCentavos * (1 - faixa.descontoPct / 100));
      // Arredonda para cima: a soma das parcelas nunca fica abaixo do total,
      // e a sobra de centavos favorece o devedor na ultima.
      const parcela = Math.ceil(total / n);

      // A parcela minima governa PARCELAMENTO. Recusar o pagamento unico por
      // ser pequeno impediria a pessoa de simplesmente quitar a divida.
      if (n > 1 && parcela < regras.parcelaMinimaCentavos) continue;

      ofertas.push({
        parcelas: n,
        valorParcelaCentavos: parcela,
        totalCentavos: total,
        descontoPct: faixa.descontoPct,
      });
    }
  }

  return ofertas.map((o, indice) => ({ indice, ...o }));
}
