// Janela de horario permitido para contato PROATIVO (a empresa iniciando
// contato — follow-up, disparo em lote). CDC art. 42/71 trata cobranca em
// horario inadequado como pratica abusiva; spec §8.16 concretiza isso como
// nada antes das 8h, depois das 20h, nem domingo.
//
// Nao se aplica a resposta a uma mensagem que o CLIENTE mandou primeiro:
// responder de volta a alguem que acabou de escrever não é iniciar contato
// fora de hora. Este modulo existe para o disparo em lote (index.ts
// ::scheduled, hoje desligado) e para os follow-ups do playbook P2/8.16,
// que ainda dependem desse fluxo de saida existir.

const HORA_INICIO = 8;
const HORA_FIM = 20;

// O Worker roda em UTC. "8h as 20h, nunca domingo" e uma regra sobre a
// hora que o DEVEDOR ve no relogio dele — precisa ser hora de Brasilia,
// nao a hora do servidor, senao a trava desliza com o fuso.
const FORMATADOR = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/Sao_Paulo',
  hour: 'numeric',
  hour12: false,
  weekday: 'short',
});

export function dentroDoHorarioPermitido(agora: Date): boolean {
  const partes = FORMATADOR.formatToParts(agora);
  const diaTexto = partes.find((p) => p.type === 'weekday')?.value;
  if (diaTexto === 'Sun') return false;

  const horaTexto = partes.find((p) => p.type === 'hour')?.value ?? '0';
  // hour12:false pode devolver "24" para meia-noite em alguns runtimes.
  const hora = Number(horaTexto) % 24;
  return hora >= HORA_INICIO && hora < HORA_FIM;
}
