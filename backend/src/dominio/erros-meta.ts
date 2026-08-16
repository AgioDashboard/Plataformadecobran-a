import type { StatusTelefone } from './telefone.ts';

export interface EfeitoDoErro {
  novoStatus: StatusTelefone | null;
  motivo: string;
}

// Lista curta e explicita. O default e NAO mexer no status: condenar um
// telefone por engano custa um devedor que nunca mais e contatado, e o
// erro nao aparece em lugar nenhum depois.
const MAPA = new Map<number, EfeitoDoErro>([
  [131026, { novoStatus: 'sem_whatsapp', motivo: 'mensagem nao entregavel: destinatario nao recebe WhatsApp' }],
  [131021, { novoStatus: 'invalido', motivo: 'remetente e destinatario iguais: cadastro invalido' }],
  [131047, { novoStatus: null, motivo: 'fora da janela de 24 horas: o numero tem WhatsApp, so exige template' }],
  [131051, { novoStatus: null, motivo: 'tipo de mensagem nao suportado: problema nosso, nao do numero' }],
  [132001, { novoStatus: null, motivo: 'template inexistente ou nao aprovado: problema nosso' }],
  [132000, { novoStatus: null, motivo: 'parametros do template nao batem: problema nosso' }],
  [130429, { novoStatus: null, motivo: 'limite de envio atingido: tentar de novo depois' }],
]);

export function efeitoDoErro(codigo: number | null): EfeitoDoErro {
  if (codigo === null) return { novoStatus: null, motivo: 'falha sem codigo de erro' };
  return (
    MAPA.get(codigo) ?? {
      novoStatus: null,
      motivo: `codigo de erro desconhecido (${codigo}): status preservado`,
    }
  );
}
