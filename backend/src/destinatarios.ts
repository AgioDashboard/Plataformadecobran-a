// Allowlist de destinatarios. Segunda trava, independente do limite de 5
// numeros do proprio numero de teste da Meta: quando o numero de producao
// entrar, o limite da Meta some e esta lista continua valendo.
//
// O modo de falha e sempre NAO ENVIAR. Lista vazia ou mal configurada
// bloqueia todo mundo, em vez de liberar todo mundo.

export function normalizarNumero(bruto: string): string {
  return String(bruto ?? '').replace(/\D/g, '');
}

export function podeEnviarPara(numero: string, autorizados: string[]): boolean {
  const alvo = normalizarNumero(numero);
  if (alvo.length === 0) return false;
  return autorizados.some((a) => normalizarNumero(a) === alvo);
}
