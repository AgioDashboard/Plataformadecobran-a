import { normalizarNumero } from '../destinatarios.ts';

export type TipoTelefone = 'celular' | 'fixo' | 'invalido';
export type StatusTelefone = 'desconhecido' | 'tem_whatsapp' | 'sem_whatsapp' | 'invalido';

// Cinco e o teto que o cadastro do Cobmais traz. Mais que isso, alguem
// digitou errado.
export const LIMITE_TELEFONES = 5;

// Filtro que nao custa nada: celular brasileiro tem 9 digitos de assinante
// comecando com 9, e praticamente todo celular brasileiro tem WhatsApp.
// Fixo nao deixa de ser tentado — so vai para o fim da fila.
export function classificarTelefone(bruto: string): TipoTelefone {
  const d = normalizarNumero(bruto);
  if (d.length < 10 || d.length > 15) return 'invalido';

  if (!d.startsWith('55')) {
    // Sem regra local para outros paises, nao ha como distinguir. Chutar
    // 'fixo' despriorizaria um numero possivelmente bom.
    return 'celular';
  }

  const assinante = d.slice(4);
  if (assinante.length === 9) return assinante.startsWith('9') ? 'celular' : 'fixo';
  if (assinante.length === 8) return 'fixo';
  return 'invalido';
}

// Faixas separadas por tipo, com espaco para o LIMITE_TELEFONES de cada
// uma: assim nenhum fixo consegue passar na frente de um celular por causa
// da ordem de cadastro.
const BASE: Record<TipoTelefone, number> = { celular: 100, fixo: 200, invalido: 900 };

export function prioridadeInicial(tipo: TipoTelefone, ordemDeCadastro: number): number {
  const posicao = Math.min(Math.max(ordemDeCadastro, 0), LIMITE_TELEFONES - 1);
  return BASE[tipo] + posicao;
}
