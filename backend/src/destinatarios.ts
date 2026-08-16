// Allowlist de destinatarios. Segunda trava, independente do limite de 5
// numeros do proprio numero de teste da Meta: quando o numero de producao
// entrar, o limite da Meta some e esta lista continua valendo.
//
// O modo de falha e sempre NAO ENVIAR. Lista vazia ou mal configurada
// bloqueia todo mundo, em vez de liberar todo mundo.

export function normalizarNumero(bruto: string): string {
  return String(bruto ?? '').replace(/\D/g, '');
}

// A Meta entrega celular brasileiro ora com o nono digito, ora sem
// (5535900000001 e 553500000001 sao a mesma linha). Comparar dígito a
// dígito barraria o proprio numero autorizado, com um sintoma dificil de
// diagnosticar: "por que ele nao respondeu?".
//
// A forma canonica e a SEM o nono digito. So se aplica a numero brasileiro
// de 13 digitos cujo primeiro digito do assinante e 9 — numero de outro
// pais passa intacto.
//
// Limite conhecido: um fixo 55DD3216-3968 tem a mesma forma canonica que o
// celular 55DD9 3216-3968. Autorizar um fixo liberaria esse celular. Como
// so se manda WhatsApp para celular, o caso e teorico; se um dia entrar
// fixo na lista, esta tolerancia precisa ser revista.
function formaCanonica(numero: string): string {
  const d = normalizarNumero(numero);
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    return d.slice(0, 4) + d.slice(5);
  }
  return d;
}

export function podeEnviarPara(numero: string, autorizados: string[]): boolean {
  const alvo = formaCanonica(numero);
  if (alvo.length === 0) return false;
  return autorizados.some((a) => formaCanonica(a) === alvo);
}
