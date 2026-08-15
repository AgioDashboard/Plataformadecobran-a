// Orquestracao do painel. Toda logica calculavel vive em logica.js,
// filtros.js, estado-pausa.js e nao-perturbe.js; aqui ha estado de tela e
// manipulacao de DOM.

import { clientes, historico } from './dados-mock.js';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from './logica.js';
import { filtrar, ordenar, FAIXAS, STATUS } from './filtros.js';
import { lerPausa, alternarPausa, lerEventosPausa } from './estado-pausa.js';
import {
  lerSilenciados,
  estaSilenciado,
  alternarSilencio,
  lerEventosSilencio,
} from './nao-perturbe.js';
import { abrirDetalhe, fecharDetalhe, detalheAberto } from './detalhe-cliente.js';

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
    return { getItem: () => null, setItem: () => {} };
  }
}

const armazenamento = obterArmazenamento();

// Estado da tela. Toda interacao altera este objeto e chama renderizar().
const tela = {
  busca: '',
  status: 'todos',
  faixa: 'todas',
  coluna: 'atraso',
  direcao: 'desc',
};

const formatadorData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

function nomeDoCliente(clienteId) {
  return clientes.find((cliente) => cliente.id === clienteId)?.nome ?? 'Cliente removido';
}

function haFiltroAtivo() {
  return tela.busca !== '' || tela.status !== 'todos' || tela.faixa !== 'todas';
}

/* ---------- Resumo ---------- */

function renderizarTotais(hoje) {
  const totais = calcularTotais(clientes, historico, hoje);
  elemento('total-divida').textContent = formatarMoeda(totais.totalCentavos);
  elemento('total-clientes').textContent = String(totais.quantidadeClientes);
  elemento('total-enviadas').textContent = String(totais.enviadasHoje);
}

function renderizarBarras() {
  const silenciados = lerSilenciados(armazenamento);
  const contar = (status) => clientes.filter((c) => c.status === status).length;

  const itens = [
    { classe: 'barra-aguardando', rotulo: 'Aguardando', valor: contar('aguardando') },
    { classe: 'barra-mensagem-enviada', rotulo: 'Enviadas', valor: contar('mensagem-enviada') },
    { classe: 'barra-sem-resposta', rotulo: 'Sem resposta', valor: contar('sem-resposta') },
  ];

  if (silenciados.length > 0) {
    itens.push({
      classe: 'barra-silenciados',
      rotulo: 'Não perturbe',
      valor: silenciados.length,
    });
  }

  elemento('barras-status').replaceChildren(
    ...itens.map((item) => {
      const li = document.createElement('li');
      li.className = `barra ${item.classe}`;

      const rotulo = document.createElement('span');
      rotulo.className = 'barra-rotulo';
      rotulo.textContent = item.rotulo;

      const contagem = document.createElement('span');
      contagem.className = 'barra-contagem';
      contagem.textContent = String(item.valor);

      li.append(rotulo, contagem);
      return li;
    }),
  );
}

/* ---------- Tabela ---------- */

function celula(texto, classe) {
  const td = document.createElement('td');
  td.textContent = texto;
  if (classe) td.className = classe;
  return td;
}

function linhaDeCliente(cliente, hoje) {
  const dias = diasEmAtraso(cliente.vencimento, hoje);
  const silenciado = estaSilenciado(armazenamento, cliente.id);

  const linha = document.createElement('tr');
  if (silenciado) linha.className = 'linha-silenciada';

  let classeAtraso = '';
  if (dias > 0) classeAtraso = 'atraso-vencido';
  else if (dias === 0) classeAtraso = 'atraso-hoje';

  linha.append(
    celula(cliente.nome, 'celula-nome'),
    celula(mascararTelefone(cliente.telefone), 'telefone'),
    celula(formatarMoeda(cliente.valorCentavos), 'numerico'),
    celula(formatadorData.format(new Date(`${cliente.vencimento}T00:00:00`))),
    celula(rotuloAtraso(dias), classeAtraso),
  );

  const tdStatus = document.createElement('td');
  const etiqueta = document.createElement('span');
  etiqueta.className = `etiqueta etiqueta-${cliente.status}`;
  etiqueta.textContent = ROTULOS_STATUS[cliente.status] ?? cliente.status;
  tdStatus.append(etiqueta);
  linha.append(tdStatus);

  const tdAcoes = document.createElement('td');
  const acoes = document.createElement('div');
  acoes.className = 'acoes';

  const verDetalhe = document.createElement('button');
  verDetalhe.type = 'button';
  verDetalhe.className = 'botao-linha';
  verDetalhe.textContent = 'Detalhe';
  verDetalhe.addEventListener('click', () => mostrarDetalhe(cliente.id));

  const silenciar = document.createElement('button');
  silenciar.type = 'button';
  silenciar.className = silenciado ? 'botao-linha botao-linha-ativo' : 'botao-linha';
  // Verbo curto no botao; o estado em si aparece na etiqueta da linha.
  silenciar.textContent = silenciado ? 'Reativar' : 'Silenciar';
  silenciar.setAttribute(
    'aria-label',
    silenciado
      ? `Reativar cobrança de ${cliente.nome}`
      : `Marcar ${cliente.nome} como não perturbe`,
  );
  silenciar.addEventListener('click', () => trocarSilencio(cliente.id));

  acoes.append(verDetalhe, silenciar);
  tdAcoes.append(acoes);
  linha.append(tdAcoes);

  return linha;
}

function renderizarClientes(hoje) {
  const filtrados = filtrar(clientes, tela, hoje);
  const visiveis = ordenar(filtrados, tela.coluna, tela.direcao, hoje);

  elemento('corpo-clientes').replaceChildren(
    ...visiveis.map((cliente) => linhaDeCliente(cliente, hoje)),
  );

  const semClientes = clientes.length === 0;
  const filtroEscondeuTudo = !semClientes && visiveis.length === 0;

  elemento('tabela-clientes').hidden = semClientes || filtroEscondeuTudo;
  elemento('vazio-clientes').hidden = !semClientes;
  elemento('vazio-filtro').hidden = !filtroEscondeuTudo;

  // Sem o contador, um filtro ativo esconde gente sem o operador perceber.
  elemento('contador-resultados').textContent =
    visiveis.length === clientes.length
      ? `${clientes.length} clientes na carteira`
      : `Mostrando ${visiveis.length} de ${clientes.length} clientes`;

  elemento('limpar-filtros').hidden = !haFiltroAtivo();
  atualizarCabecalhos();
}

function atualizarCabecalhos() {
  for (const botao of document.querySelectorAll('.ordenador')) {
    const cabecalho = botao.closest('th');
    const ativa = botao.dataset.coluna === tela.coluna;
    cabecalho.setAttribute(
      'aria-sort',
      ativa ? (tela.direcao === 'asc' ? 'ascending' : 'descending') : 'none',
    );
  }
}

/* ---------- Historico ---------- */

function itemDeMensagem(entrada) {
  const item = document.createElement('li');
  if (entrada.resultado === 'falhou') item.classList.add('historico-falhou');

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  nome.textContent = `${nomeDoCliente(entrada.clienteId)}${
    entrada.resultado === 'falhou' ? ' — falhou' : ''
  }`;

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

function itemDeSistema(texto, quando) {
  const item = document.createElement('li');
  item.className = 'historico-sistema';

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  nome.textContent = texto;

  const momento = document.createElement('span');
  momento.className = 'historico-quando';
  momento.textContent = formatadorDataHora.format(new Date(quando));

  topo.append(nome, momento);
  item.append(topo);
  return item;
}

function renderizarHistorico() {
  const linhas = [
    ...historico.map((entrada) => ({
      quando: entrada.quando,
      criar: () => itemDeMensagem(entrada),
    })),
    ...lerEventosPausa(armazenamento).map((evento) => ({
      quando: evento.quando,
      criar: () =>
        itemDeSistema(
          evento.pausado ? 'Sistema — disparos pausados' : 'Sistema — disparos retomados',
          evento.quando,
        ),
    })),
    ...lerEventosSilencio(armazenamento).map((evento) => ({
      quando: evento.quando,
      criar: () =>
        itemDeSistema(
          `${nomeDoCliente(evento.clienteId)} — ${
            evento.silenciado ? 'não perturbe ativado' : 'não perturbe removido'
          }`,
          evento.quando,
        ),
    })),
  ].sort((a, b) => new Date(b.quando) - new Date(a.quando));

  elemento('lista-historico').replaceChildren(...linhas.map((linha) => linha.criar()));
  elemento('vazio-historico').hidden = linhas.length > 0;
}

/* ---------- Pausa e nao-perturbe ---------- */

function aplicarPausa(estado) {
  const botao = elemento('botao-pausa');
  botao.setAttribute('aria-pressed', String(estado.pausado));
  botao.querySelector('.rotulo-pausa').textContent = estado.pausado
    ? 'Retomar disparos'
    : 'Pausar disparos';
  elemento('faixa-pausa').hidden = !estado.pausado;
  elemento('painel').classList.toggle('painel-pausado', estado.pausado);
}

function trocarSilencio(clienteId) {
  alternarSilencio(armazenamento, clienteId, new Date());
  renderizar();

  // A gaveta reflete o novo estado sem fechar.
  if (detalheAberto()) mostrarDetalhe(clienteId);
}

function mostrarDetalhe(clienteId) {
  const cliente = clientes.find((c) => c.id === clienteId);
  if (!cliente) return;

  abrirDetalhe({
    cliente,
    historicoDoCliente: historico
      .filter((entrada) => entrada.clienteId === clienteId)
      .sort((a, b) => new Date(b.quando) - new Date(a.quando)),
    silenciado: estaSilenciado(armazenamento, clienteId),
    hoje: new Date(),
    aoAlternarSilencio: trocarSilencio,
  });
}

/* ---------- Montagem ---------- */

function preencherSeletores() {
  const seletorStatus = elemento('filtro-status');
  seletorStatus.replaceChildren(
    ...STATUS.map((opcao) => new Option(opcao.rotulo, opcao.valor)),
  );

  const seletorFaixa = elemento('filtro-faixa');
  seletorFaixa.replaceChildren(...FAIXAS.map((opcao) => new Option(opcao.rotulo, opcao.valor)));
}

function limparFiltros() {
  tela.busca = '';
  tela.status = 'todos';
  tela.faixa = 'todas';
  elemento('busca').value = '';
  elemento('filtro-status').value = 'todos';
  elemento('filtro-faixa').value = 'todas';
  renderizar();
  elemento('busca').focus();
}

function ligarEventos() {
  elemento('busca').addEventListener('input', (evento) => {
    tela.busca = evento.target.value;
    renderizar();
  });

  elemento('filtro-status').addEventListener('change', (evento) => {
    tela.status = evento.target.value;
    renderizar();
  });

  elemento('filtro-faixa').addEventListener('change', (evento) => {
    tela.faixa = evento.target.value;
    renderizar();
  });

  elemento('limpar-filtros').addEventListener('click', limparFiltros);

  for (const botao of document.querySelectorAll('[data-limpar]')) {
    botao.addEventListener('click', limparFiltros);
  }

  for (const botao of document.querySelectorAll('.ordenador')) {
    botao.addEventListener('click', () => {
      const coluna = botao.dataset.coluna;
      if (tela.coluna === coluna) {
        tela.direcao = tela.direcao === 'asc' ? 'desc' : 'asc';
      } else {
        tela.coluna = coluna;
        tela.direcao = coluna === 'nome' ? 'asc' : 'desc';
      }
      renderizar();
    });
  }

  elemento('botao-pausa').addEventListener('click', () => {
    aplicarPausa(alternarPausa(armazenamento, new Date()));
    renderizarHistorico();
  });

  elemento('fechar-gaveta').addEventListener('click', fecharDetalhe);
  elemento('fundo-gaveta').addEventListener('click', fecharDetalhe);

  for (const pilula of document.querySelectorAll('.pilula')) {
    pilula.addEventListener('click', () => {
      for (const outra of document.querySelectorAll('.pilula')) {
        outra.classList.remove('pilula-ativa');
      }
      pilula.classList.add('pilula-ativa');
    });
  }
}

function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarBarras();
  renderizarClientes(hoje);
  renderizarHistorico();
}

preencherSeletores();
ligarEventos();
aplicarPausa(lerPausa(armazenamento));
renderizar();
