// Orquestracao do painel. Toda logica calculavel vive em logica.js,
// filtros.js, estado-pausa.js e nao-perturbe.js; aqui ha estado de tela e
// manipulacao de DOM.

// A lista ficticia so aparece quando a carteira do credor esta vazia — e,
// nesse caso, com o selo e o aviso de "dados ficticios" bem visiveis. Com
// devedores reais na carteira, mostra os reais e o selo some. Nunca dado
// real com selo de ficticio, nem ficticio sem selo.
import { clientes } from './dados-mock.js';
import { credorSelecionado, definirCredorSelecionado } from './credores.js';
import {
  carregarConversas,
  carregarCredores,
  carregarDevedores,
  carregarEstado,
  definirPausa,
} from './dados-remotos.js';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  calcularTotais,
} from './logica.js';
import { filtrar, ordenar, FAIXAS, STATUS } from './filtros.js';
// Nao-perturbe da lista ficticia continua local. O nao-perturbe real, por
// telefone, vive no servidor e e consultado antes de qualquer disparo.
import { lerSilenciados, estaSilenciado, alternarSilencio } from './nao-perturbe.js';
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

// Dado vindo do servidor. Comeca vazio e pausado: se a carga falhar, a tela
// mostra "pausado", que e a leitura segura.
let conversas = [];
let servidor = { pausado: true, silenciados: [] };

// Comeca no mock. Vira a carteira real assim que o servidor devolver
// devedores. A comparacao de identidade com `clientes` e o que decide o
// selo de dados ficticios — por isso a variavel guarda a propria lista
// importada, sem copia.
let clientesEmTela = clientes;

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

function haFiltroAtivo() {
  return tela.busca !== '' || tela.status !== 'todos' || tela.faixa !== 'todas';
}

/* ---------- Resumo ---------- */

function renderizarTotais(hoje) {
  const totais = calcularTotais(clientesEmTela, [], hoje);
  elemento('total-divida').textContent = formatarMoeda(totais.totalCentavos);
  elemento('total-clientes').textContent = String(totais.quantidadeClientes);

  const enviadasHoje = conversas.filter((c) => {
    if (c.direcao !== 'saida') return false;
    const quando = new Date(c.quando);
    return (
      quando.getFullYear() === hoje.getFullYear() &&
      quando.getMonth() === hoje.getMonth() &&
      quando.getDate() === hoje.getDate()
    );
  }).length;
  elemento('total-enviadas').textContent = String(enviadasHoje);
}

function renderizarBarras() {
  const silenciados = lerSilenciados(armazenamento);
  const contar = (status) => clientesEmTela.filter((c) => c.status === status).length;

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

// O devedor do banco ainda nao tem situacao nem saldo calculados; ate a
// fase que cuidar disso, entra como 'aguardando' com valor zerado.
function comoClienteDePainel(devedor) {
  return {
    id: devedor.id,
    nome: devedor.nome,
    telefone: devedor.telefone,
    valorCentavos: 0,
    vencimento: String(devedor.criadoEm ?? '').slice(0, 10),
    status: 'aguardando',
  };
}

function renderizarClientes(hoje) {
  const filtrados = filtrar(clientesEmTela, tela, hoje);
  const visiveis = ordenar(filtrados, tela.coluna, tela.direcao, hoje);

  elemento('corpo-clientes').replaceChildren(
    ...visiveis.map((cliente) => linhaDeCliente(cliente, hoje)),
  );

  const semClientes = clientesEmTela.length === 0;
  const filtroEscondeuTudo = !semClientes && visiveis.length === 0;

  elemento('tabela-clientes').hidden = semClientes || filtroEscondeuTudo;
  elemento('vazio-clientes').hidden = !semClientes;
  elemento('vazio-filtro').hidden = !filtroEscondeuTudo;

  // Sem o contador, um filtro ativo esconde gente sem o operador perceber.
  elemento('contador-resultados').textContent =
    visiveis.length === clientesEmTela.length
      ? `${clientesEmTela.length} clientes na carteira`
      : `Mostrando ${visiveis.length} de ${clientesEmTela.length} clientes`;

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

const ROTULOS_ORIGEM = {
  cliente: 'recebida',
  ia: 'resposta automática',
  humano: 'enviada por atendente',
  sistema: 'sistema',
};

function itemDeConversa(conversa) {
  const item = document.createElement('li');
  if (conversa.origem === 'sistema') item.classList.add('historico-sistema');

  const topo = document.createElement('div');
  topo.className = 'historico-topo';

  const nome = document.createElement('span');
  nome.className = 'historico-nome';
  // Telefone mascarado tambem aqui: o painel nunca estampa o numero inteiro.
  nome.textContent = `${mascararTelefone(conversa.telefone)} — ${
    ROTULOS_ORIGEM[conversa.origem] ?? conversa.origem
  }`;

  const quando = document.createElement('span');
  quando.className = 'historico-quando';
  quando.textContent = formatadorDataHora.format(new Date(conversa.quando));

  topo.append(nome, quando);

  const trecho = document.createElement('p');
  trecho.className = 'historico-trecho';
  trecho.textContent = conversa.texto;

  item.append(topo, trecho);
  return item;
}

function renderizarHistorico() {
  const ordenadas = [...conversas].sort(
    (a, b) => new Date(b.quando) - new Date(a.quando),
  );
  elemento('lista-historico').replaceChildren(...ordenadas.map(itemDeConversa));
  elemento('vazio-historico').hidden = ordenadas.length > 0;
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
  const cliente = clientesEmTela.find((c) => c.id === clienteId);
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

  elemento('botao-pausa').addEventListener('click', async () => {
    const botao = elemento('botao-pausa');
    botao.disabled = true;
    try {
      // A pausa vive no servidor: e ela que o robo consulta antes de
      // disparar. Trocar so na tela seria mentira.
      const { pausado } = await definirPausa(!servidor.pausado);
      servidor.pausado = pausado;
      aplicarPausa({ pausado });
      await recarregarDoServidor();
    } catch (erro) {
      mostrarErro(`Não foi possível alterar a pausa: ${erro.message}`);
    } finally {
      botao.disabled = false;
    }
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

// O selo e o aviso acompanham a origem da lista, sempre. Dado real com selo
// de ficticio, ou ficticio sem selo, sao os dois piores resultados possiveis
// nesta tela — por isso a marcacao e recalculada a cada render, e nao
// definida uma vez na carga.
function renderizarOrigemDosClientes() {
  const ehFicticia = clientesEmTela === clientes;

  elemento('titulo-clientes').querySelector('.selo-ficticio').hidden = !ehFicticia;
  elemento('secao-clientes').querySelector('.aviso-ficticio').hidden = !ehFicticia;
  elemento('subtitulo-resumo').textContent = ehFicticia
    ? 'Histórico de conversas real — lista de clientes ainda fictícia'
    : 'Histórico de conversas e lista de clientes vindos da carteira do credor';
}

function renderizar() {
  const hoje = new Date();
  renderizarTotais(hoje);
  renderizarBarras();
  renderizarClientes(hoje);
  renderizarOrigemDosClientes();
  renderizarHistorico();
}

function mostrarErro(mensagem) {
  const faixa = elemento('faixa-erro');
  faixa.textContent = mensagem;
  faixa.hidden = false;
}

function limparErro() {
  elemento('faixa-erro').hidden = true;
}

// Devolve true quando ha uma carteira escolhida e vale carregar os dados.
// O painel nao usa novoElemento: o proprio arquivo ja monta <option> com o
// construtor Option, e manter um jeito so evita duas convencoes na mesma
// tela.
async function montarSeletorDeCredores() {
  const lista = await carregarCredores();
  const seletor = elemento('seletor-credor');
  const atual = credorSelecionado();

  seletor.replaceChildren(
    new Option('Escolha um credor…', ''),
    ...lista.map((c) => new Option(c.nome, c.id)),
  );
  seletor.value = atual;
  seletor.addEventListener('change', () => definirCredorSelecionado(seletor.value));

  // Uma carteira so: escolher e cerimonia inutil, seleciona sozinho.
  if (!atual && lista.length === 1) {
    definirCredorSelecionado(lista[0].id);
    return false;
  }

  // Credor que nao esta na lista deixa o <select> sem opcao correspondente;
  // o valor volta vazio e a tela precisa dizer isso em vez de ficar muda.
  if (atual && seletor.value !== atual) {
    throw new Error(`O credor "${atual}" não existe ou não está ativo.`);
  }

  return Boolean(atual);
}

async function recarregarDoServidor() {
  const [estado, lista, devedores] = await Promise.all([
    carregarEstado(),
    carregarConversas(),
    carregarDevedores(),
  ]);
  servidor = estado;
  conversas = lista;
  // A lista de clientes agora vem da carteira do credor. Carteira vazia cai
  // de volta no mock — e o selo de dados ficticios volta junto.
  clientesEmTela = devedores.length > 0 ? devedores.map(comoClienteDePainel) : clientes;
  aplicarPausa({ pausado: estado.pausado });
  renderizar();
}

async function iniciar() {
  preencherSeletores();
  ligarEventos();
  // Ate a carga terminar, a tela mostra pausado — a leitura segura.
  aplicarPausa({ pausado: true });
  renderizar();

  try {
    const temCredor = await montarSeletorDeCredores();
    elemento('faixa-sem-credor').hidden = temCredor;
    if (!temCredor) return;

    await recarregarDoServidor();
    limparErro();
  } catch (erro) {
    mostrarErro(
      `Não foi possível carregar os dados do servidor: ${erro.message} ` +
        'O histórico abaixo pode estar vazio ou desatualizado.',
    );
  }
}

iniciar();
