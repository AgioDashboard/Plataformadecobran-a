// Geracao de PIX e boleto FICTICIOS, so para teste. Nao existe integracao
// real com nenhum banco ou PSP — nunca usar fora do ambiente de teste
// (index.ts/config.ts controlam isso, aqui e so a geracao pura).
//
// Existir de verdade (mesmo ficticio) e o que faz a trava do Adendo 1,
// Defeito 5 valer: a IA so pode "prometer" PIX/boleto porque agora ha uma
// ferramenta de verdade por tras, nao mais uma frase solta sem nada
// acontecendo.

function digitosDe(texto: string, tamanho: number): string {
  let soma = 0;
  for (let i = 0; i < texto.length; i += 1) {
    soma = (soma * 31 + texto.charCodeAt(i)) % 1_000_000_000;
  }
  return String(soma).padStart(tamanho, '0').slice(-tamanho);
}

export interface PixFicticio {
  chaveCopiaECola: string;
  valorCentavos: number;
  referencia: string;
}

// Formato "copia e cola" fictício — parece um PIX real (EMV) na estrutura,
// mas o selo TESTFICTICIO deixa claro que nao e valido em nenhum banco.
export function gerarPixFicticio(valorCentavos: number, referencia: string): PixFicticio {
  const valor = (valorCentavos / 100).toFixed(2);
  const selo = digitosDe(`${referencia}:${valorCentavos}`, 8);
  const chaveCopiaECola =
    `00020126TESTFICTICIONAOUSARPARAPAGAR5204000053039865` +
    `54${valor.length}${valor}5802BR5913AGIO TESTE6009SAO PAULO` +
    `62070503${selo}6304FFFF`;
  return { chaveCopiaECola, valorCentavos, referencia };
}

export interface BoletoFicticio {
  linhaDigitavel: string;
  valorCentavos: number;
  vencimento: string;
  referencia: string;
}

// Mesma logica: formato visual de linha digitavel de boleto (5 blocos),
// numeros derivados da referencia — nunca compensavel de verdade.
export function gerarBoletoFicticio(
  valorCentavos: number,
  vencimento: string,
  referencia: string,
): BoletoFicticio {
  const bloco1 = `00090.${digitosDe(referencia, 5)}`;
  const bloco2 = `${digitosDe(`${referencia}2`, 5)}.${digitosDe(`${referencia}3`, 6)}`;
  const bloco3 = `${digitosDe(`${referencia}4`, 5)}.${digitosDe(`${referencia}5`, 6)}`;
  const digitoVerificador = digitosDe(`${referencia}:${valorCentavos}:${vencimento}`, 1);
  const valorFmt = String(valorCentavos).padStart(10, '0');
  const linhaDigitavel = `${bloco1} ${bloco2} ${bloco3} ${digitoVerificador} ${valorFmt}`;
  return { linhaDigitavel, valorCentavos, vencimento, referencia };
}

export interface LinkCartaoFicticio {
  url: string;
  valorCentavos: number;
  referencia: string;
}

// Link de pagamento por cartao — nao ha gateway de cartao integrado ainda,
// entao o link e um endereco FICTICIO que nunca resolve para uma pagina de
// cobranca real. O dominio "-teste" e o selo no texto (webhook.ts) e que
// deixam isso claro para o cliente.
export function gerarLinkCartaoFicticio(valorCentavos: number, referencia: string): LinkCartaoFicticio {
  const selo = digitosDe(`${referencia}:${valorCentavos}:cartao`, 12);
  const url = `https://pagamento-teste.agio.local/c/${selo}`;
  return { url, valorCentavos, referencia };
}
