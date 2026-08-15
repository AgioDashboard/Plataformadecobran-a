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
import { lerPausa, alternarPausa, lerEventosPausa } from './estado-pausa.js';

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  'mensagem-enviada': 'Mensagem enviada',
  'sem-resposta': 'Sem resposta',
};

const elemento = (id) => document.getElementById(id);

// Em modo restrito o proprio acesso a window.localStorage lanca. O dublê
// devolvido mantem o painel funcional, apenas sem persistencia.
function obterArmazenamento() {
  try {
    const teste = '__cobranca_teste__';
    window.localStorage.setItem(teste, '1');
    window.localStorage.removeItem(teste);
    return window.localStorage;
  } catch {
    return {
      getItem: () => null,
      setItem: () => {},
    };
  }
}

const armazenamento = obterArmazenamento();

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

function itemDeEvento(evento) {
  const item = document.createElement('li');
  item.className = 'historico-sistema';

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  nome.textContent = evento.pausado
    ? 'Sistema — disparos pausados'
    : 'Sistema — disparos retomados';

  const quando = document.createElement('span');
  quando.className = 'historico-quando';
  quando.textContent = formatadorDataHora.format(new Date(evento.quando));

  topo.append(nome, quando);
  item.append(topo);
  return item;
}

function renderizarHistorico() {
  const mensagens = historico.map((entrada) => ({
    quando: entrada.quando,
    elemento: () => itemDeMensagem(entrada),
  }));
  const eventos = lerEventosPausa(armazenamento).map((evento) => ({
    quando: evento.quando,
    elemento: () => itemDeEvento(evento),
  }));

  const tudo = [...mensagens, ...eventos].sort(
    (a, b) => new Date(b.quando) - new Date(a.quando),
  );

  elemento('lista-historico').replaceChildren(...tudo.map((linha) => linha.elemento()));
  elemento('vazio-historico').hidden = tudo.length > 0;
}

function aplicarPausa(estado) {
  const botao = elemento('botao-pausa');
  botao.setAttribute('aria-pressed', String(estado.pausado));
  botao.textContent = estado.pausado ? 'Retomar disparos' : 'Pausar disparos';
  elemento('faixa-pausa').hidden = !estado.pausado;
  elemento('painel').classList.toggle('painel-pausado', estado.pausado);
}

function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarClientes(hoje);
  renderizarHistorico();
}

elemento('botao-pausa').addEventListener('click', () => {
  aplicarPausa(alternarPausa(armazenamento, new Date()));
  renderizarHistorico();
});

aplicarPausa(lerPausa(armazenamento));
renderizar();
