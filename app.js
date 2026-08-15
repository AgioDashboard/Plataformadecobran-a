// Renderizacao do painel. Toda a logica calculavel vive em logica.js;
// aqui so ha manipulacao de DOM.

import { clientes, historico } from './dados-mock.js';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from './logica.js';

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  'mensagem-enviada': 'Mensagem enviada',
  'sem-resposta': 'Sem resposta',
};

const elemento = (id) => document.getElementById(id);

const formatadorData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function nomeDoCliente(clienteId) {
  return clientes.find((cliente) => cliente.id === clienteId)?.nome ?? 'Cliente removido';
}

function renderizarTotais(hoje) {
  const totais = calcularTotais(clientes, historico, hoje);
  elemento('total-divida').textContent = formatarMoeda(totais.totalCentavos);
  elemento('total-clientes').textContent = String(totais.quantidadeClientes);
  elemento('total-enviadas').textContent = String(totais.enviadasHoje);
}

function linhaDeCliente(cliente, hoje) {
  const dias = diasEmAtraso(cliente.vencimento, hoje);
  const linha = document.createElement('tr');

  const celulas = [
    { texto: cliente.nome },
    { texto: mascararTelefone(cliente.telefone) },
    { texto: formatarMoeda(cliente.valorCentavos), classe: 'numerico' },
    { texto: formatadorData.format(new Date(`${cliente.vencimento}T00:00:00`)) },
    { texto: rotuloAtraso(dias), classe: dias > 0 ? 'atraso-vencido' : '' },
  ];

  for (const celula of celulas) {
    const td = document.createElement('td');
    td.textContent = celula.texto;
    if (celula.classe) td.className = celula.classe;
    linha.append(td);
  }

  const tdStatus = document.createElement('td');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta etiqueta-${cliente.status}`;
  etiqueta.textContent = ROTULOS_STATUS[cliente.status] ?? cliente.status;
  tdStatus.append(etiqueta);
  linha.append(tdStatus);

  return linha;
}

function renderizarClientes(hoje) {
  const corpo = elemento('corpo-clientes');
  corpo.replaceChildren(...clientes.map((cliente) => linhaDeCliente(cliente, hoje)));

  const vazio = clientes.length === 0;
  elemento('vazio-clientes').hidden = !vazio;
  elemento('tabela-clientes').hidden = vazio;
}

function itemDeMensagem(entrada) {
  const item = document.createElement('li');
  if (entrada.resultado === 'falhou') item.classList.add('historico-falhou');

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  const sufixo = entrada.resultado === 'falhou' ? ' — falhou' : '';
  nome.textContent = `${nomeDoCliente(entrada.clienteId)}${sufixo}`;

  const quando = document.createElement('span');
  quando.className = 'historico-quando';
  quando.textContent = formatadorDataHora.format(new Date(entrada.quando));

  topo.append(nome, quando);

  const trecho = document.createElement('p');
  trecho.className = 'historico-trecho';
  trecho.textContent = entrada.trecho;

  item.append(topo, trecho);
  return item;
}

function renderizarHistorico() {
  const ordenado = [...historico].sort((a, b) => new Date(b.quando) - new Date(a.quando));
  elemento('lista-historico').replaceChildren(...ordenado.map(itemDeMensagem));
  elemento('vazio-historico').hidden = ordenado.length > 0;
}

function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarClientes(hoje);
  renderizarHistorico();
}

renderizar();
