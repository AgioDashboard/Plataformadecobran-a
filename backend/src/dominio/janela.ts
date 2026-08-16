// Janela de servico do WhatsApp: texto livre so e permitido nas 24 horas
// seguintes a ULTIMA mensagem do cliente. Fora dela, so template aprovado.

const VINTE_E_QUATRO_HORAS = 24 * 60 * 60 * 1000;

export function dentroDaJanela(ultimaEntrada: string | null, agora: Date): boolean {
  if (!ultimaEntrada) return false;

  const marco = new Date(ultimaEntrada).getTime();
  if (Number.isNaN(marco)) return false;

  // Borda fechada: exatamente 24h ja esta fora. Errar para o lado restritivo
  // custa um template; errar para o outro lado e uma mensagem rejeitada pela
  // Meta e uma reclamacao de politica.
  return agora.getTime() - marco < VINTE_E_QUATRO_HORAS;
}
