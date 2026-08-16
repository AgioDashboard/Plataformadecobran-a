// Funcoes puras de apresentacao. Sem DOM, sem rede, sem estado global.

const FORMATADOR_BRL = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
});

const MILISSEGUNDOS_POR_DIA = 24 * 60 * 60 * 1000;

export function formatarMoeda(centavos) {
  return FORMATADOR_BRL.format(centavos / 100);
}

// Converte 'AAAA-MM-DD' em Date local a meia-noite. Usar new Date(iso)
// interpretaria como UTC e deslocaria o dia no fuso do Brasil.
function meiaNoiteLocal(dataISO) {
  const [ano, mes, dia] = dataISO.split('-').map(Number);
  return new Date(ano, mes - 1, dia);
}

function inicioDoDia(data) {
  return new Date(data.getFullYear(), data.getMonth(), data.getDate());
}

export function diasEmAtraso(vencimentoISO, hoje) {
  const diferenca = inicioDoDia(hoje) - meiaNoiteLocal(vencimentoISO);
  return Math.round(diferenca / MILISSEGUNDOS_POR_DIA);
}

export function rotuloAtraso(dias) {
  if (dias < 0) return 'a vencer';
  if (dias === 0) return 'vence hoje';
  return dias === 1 ? '1 dia' : `${dias} dias`;
}

// Espera o formato 55DDNNNNNNNNN (13 digitos). Exibe DDD, primeiro digito
// e os quatro ultimos; o miolo nunca aparece na tela.
export function mascararTelefone(telefone) {
  const digitos = String(telefone ?? '').replace(/\D/g, '');
  if (digitos.length !== 13) return 'sem telefone';
  const ddd = digitos.slice(2, 4);
  const primeiro = digitos.slice(4, 5);
  const finais = digitos.slice(-4);
  return `(${ddd}) ${primeiro}****-${finais}`;
}

function normalizarTelefone(bruto) {
  return String(bruto ?? '').replace(/\D/g, '');
}

// Mesma forma canonica do backend (backend/src/destinatarios.ts): a Meta
// entrega celular brasileiro ora com o nono digito, ora sem, e 5535900000001
// e 553500000001 sao a mesma linha. Sem esta tolerancia a tela diria
// "ativo" para alguem que o servidor tem como silenciado — o erro perigoso,
// porque leva a operacao a confiar numa protecao que nao esta ali.
//
// Se a regra mudar no backend, tem de mudar aqui junto.
function formaCanonicaDeTelefone(bruto) {
  const d = normalizarTelefone(bruto);
  if (d.length === 13 && d.startsWith('55') && d[4] === '9') {
    return d.slice(0, 4) + d.slice(5);
  }
  return d;
}

export function mesmoTelefone(a, b) {
  const canonicoA = formaCanonicaDeTelefone(a);
  return canonicoA.length > 0 && canonicoA === formaCanonicaDeTelefone(b);
}

function mesmoDia(dataISO, referencia) {
  const data = new Date(dataISO);
  return (
    data.getFullYear() === referencia.getFullYear() &&
    data.getMonth() === referencia.getMonth() &&
    data.getDate() === referencia.getDate()
  );
}

// Recebe as conversas reais do servidor. Antes esperava o historico
// ficticio, com outro formato, e o app.js acabou calculando o total por
// fora — o campo daqui saia sempre zero e ninguem percebia.
export function calcularTotais(clientes, conversas, hoje) {
  return {
    totalCentavos: clientes.reduce((soma, cliente) => soma + cliente.valorCentavos, 0),
    quantidadeClientes: clientes.length,
    enviadasHoje: conversas.filter(
      (c) => c.direcao === 'saida' && mesmoDia(c.quando, hoje),
    ).length,
  };
}
