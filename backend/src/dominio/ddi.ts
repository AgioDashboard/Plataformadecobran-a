// DDI do numero de exibicao que a Meta devolve em display_phone_number
// (ex.: "+1 555-0100", "+55 35 99999-0000").
//
// So distingue os dois DDIs que existem neste projeto. Qualquer outra
// coisa volta null, e quem chama trata "nao reconhecido" como recusa —
// nunca como liberacao. O modo de falha e nao enviar.

export type Ddi = '1' | '55';

export function ddiDe(numeroExibicao: string | null | undefined): Ddi | null {
  const d = String(numeroExibicao ?? '').replace(/\D/g, '');

  // Brasil: 55 + DD + 8 ou 9 digitos.
  if (d.startsWith('55') && (d.length === 12 || d.length === 13)) return '55';

  // EUA/Canada: 1 + area de 3 + 7 digitos, sempre 11 ao todo.
  if (d.startsWith('1') && d.length === 11) return '1';

  return null;
}

// O numero de teste da operacao e o +1. Enquanto os numeros brasileiros
// atendem clientes reais em outra plataforma, disparar por engano a partir
// de um deles e o pior defeito possivel desta tela — pior que nao enviar.
export function ehRemetenteDeTeste(numeroExibicao: string | null | undefined): boolean {
  return ddiDe(numeroExibicao) === '1';
}
