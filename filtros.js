// Filtragem e ordenacao da lista de clientes. Funcoes puras: recebem a
// lista e os criterios, devolvem uma lista nova. Sem DOM, sem estado.

import { diasEmAtraso } from './logica.js';

export const FAIXAS = [
  { valor: 'todas', rotulo: 'Todos os prazos' },
  { valor: 'a-vencer', rotulo: 'A vencer' },
  { valor: '1-30', rotulo: '1 a 30 dias' },
  { valor: '31-60', rotulo: '31 a 60 dias' },
  { valor: '60+', rotulo: 'Mais de 60 dias' },
];

export const STATUS = [
  { valor: 'todos', rotulo: 'Todas as situações' },
  { valor: 'aguardando', rotulo: 'Aguardando' },
  { valor: 'mensagem-enviada', rotulo: 'Mensagem enviada' },
  { valor: 'sem-resposta', rotulo: 'Sem resposta' },
];

// Busca tolerante: "servicos" precisa achar "Serviços".
export function normalizar(texto) {
  return String(texto ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

function dentroDaFaixa(dias, faixa) {
  switch (faixa) {
    case 'a-vencer':
      return dias < 0;
    case '1-30':
      return dias >= 1 && dias <= 30;
    case '31-60':
      return dias >= 31 && dias <= 60;
    case '60+':
      return dias > 60;
    default:
      return true;
  }
}

export function filtrar(clientes, criterios, hoje) {
  const busca = normalizar(criterios.busca);

  return clientes.filter((cliente) => {
    if (busca && !normalizar(cliente.nome).includes(busca)) return false;
    if (criterios.status !== 'todos' && cliente.status !== criterios.status) return false;
    if (!dentroDaFaixa(diasEmAtraso(cliente.vencimento, hoje), criterios.faixa)) return false;
    return true;
  });
}

const comparadorTexto = new Intl.Collator('pt-BR', { sensitivity: 'base' });

function valorDaColuna(cliente, coluna, hoje) {
  switch (coluna) {
    case 'nome':
      return cliente.nome;
    case 'valor':
      return cliente.valorCentavos;
    case 'vencimento':
      return cliente.vencimento;
    case 'atraso':
      return diasEmAtraso(cliente.vencimento, hoje);
    default:
      return null;
  }
}

export const COLUNAS_ORDENAVEIS = ['nome', 'valor', 'vencimento', 'atraso'];

export function ordenar(clientes, coluna, direcao, hoje) {
  if (!COLUNAS_ORDENAVEIS.includes(coluna)) return [...clientes];

  const sinal = direcao === 'desc' ? -1 : 1;

  return [...clientes].sort((a, b) => {
    const valorA = valorDaColuna(a, coluna, hoje);
    const valorB = valorDaColuna(b, coluna, hoje);

    if (typeof valorA === 'string') {
      return sinal * comparadorTexto.compare(valorA, valorB);
    }
    return sinal * (valorA - valorB);
  });
}
