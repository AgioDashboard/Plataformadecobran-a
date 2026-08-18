// Formata valor e data para o texto que a IA le e que o cliente ve. Vive no
// dominio porque o formato do valor precisa bater exatamente com o que
// validarResposta espera comparar (PADRAO_VALOR, em ia/responder.ts) —
// mudar um sem mudar o outro faria a IA citar o valor certo e o validador
// rejeitar mesmo assim.

export function formatarMoeda(centavos: number): string {
  const reais = (Math.round(centavos) / 100).toFixed(2);
  const [inteiro, decimal] = reais.split('.');
  const comMilhar = inteiro.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `R$ ${comMilhar},${decimal}`;
}

// Recebe 'AAAA-MM-DD' (formato do banco). O 'T00:00:00' faz o Date tratar
// como meia-noite no fuso do runtime (Workers roda em UTC), em vez de UTC
// interpretado como o dia anterior em fusos negativos — mesma tecnica que o
// painel ja usa em app.js para nao errar o dia por causa de fuso.
export function formatarData(isoData: string): string {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' }).format(
    new Date(`${isoData}T00:00:00`),
  );
}
