import type { StatusTelefone } from './telefone.ts';

export interface CandidatoTelefone {
  id: number;
  numero: string;
  status: StatusTelefone;
  prioridade: number;
}

export type Decisao =
  | { acao: 'tentar'; telefone: CandidatoTelefone }
  | { acao: 'esperar'; motivo: string }
  | { acao: 'desistir'; motivo: string };

// Fila, nao leque. Disparar para os 5 numeros de uma vez incomodaria quatro
// pessoas por engano e derrubaria a nota de qualidade do nosso numero.
export function proximoPasso(
  telefones: CandidatoTelefone[],
  temTentativaAberta: boolean,
): Decisao {
  if (temTentativaAberta) {
    return { acao: 'esperar', motivo: 'ja existe uma tentativa aguardando recibo' };
  }

  const confirmado = telefones.find((t) => t.status === 'tem_whatsapp');
  if (confirmado) return { acao: 'tentar', telefone: confirmado };

  const candidatos = telefones
    .filter((t) => t.status === 'desconhecido')
    .sort((a, b) => a.prioridade - b.prioridade);

  if (candidatos.length === 0) {
    return { acao: 'desistir', motivo: 'nenhum telefone com WhatsApp possivel' };
  }

  return { acao: 'tentar', telefone: candidatos[0] };
}
