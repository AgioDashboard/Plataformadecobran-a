// Portao unico de envio. Toda saida passa por aqui, sem excecao.
// A ordem das checagens e a ordem de gravidade: o que protege mais gente
// vem primeiro, para que o motivo registrado na auditoria seja o mais
// importante — se a pausa global esta ligada, esse e o fato que interessa,
// nao o detalhe de que a janela tambem estava fechada.

export interface EstadoPortao {
  pausaGlobal: boolean;
  silenciado: boolean;
  naAllowlist: boolean;
  tipo: 'template' | 'livre';
  dentroDaJanela: boolean;
}

export interface ResultadoPortao {
  permitido: boolean;
  motivo: string;
}

export function avaliarPortao(estado: EstadoPortao): ResultadoPortao {
  if (estado.pausaGlobal) {
    return { permitido: false, motivo: 'bloqueado pela pausa global' };
  }
  if (estado.silenciado) {
    return { permitido: false, motivo: 'cliente marcado como nao perturbe' };
  }
  if (!estado.naAllowlist) {
    return { permitido: false, motivo: 'destinatario fora da allowlist de teste' };
  }
  if (estado.tipo === 'livre' && !estado.dentroDaJanela) {
    return { permitido: false, motivo: 'fora da janela de 24 horas' };
  }
  return { permitido: true, motivo: 'ok' };
}
