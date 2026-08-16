// Orquestracao do painel. Toda logica calculavel vive em logica.js,
// filtros.js e nao-perturbe.js; aqui ha estado de tela e
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
  carregarRegras,
  carregarTelefones,
  definirPausa,
  definirSilencio,
  previaDeOfertas,
  salvarRegras,
} from './dados-remotos.js';
import {
  formatarMoeda,
  diasEmAtraso,
  rotuloAtraso,
  mascararTelefone,
  mesmoTelefone,
  calcularTotais,
} from './logica.js';
import { filtrar, ordenar, FAIXAS, STATUS } from './filtros.js';
// Nao-perturbe vem do servidor, por telefone. Nao ha copia local: o painel
// so pode mostrar silenciado quem o robo tambem enxerga como silenciado.
import { estaSilenciado, contarSilenciados } from './nao-perturbe.js';
import { abrirDetalhe, fecharDetalhe, detalheAberto } from './detalhe-cliente.js';

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  'mensagem-enviada': 'Mensagem enviada',
  'sem-resposta': 'Sem resposta',
};

const elemento = (id) => document.getElementById(id);

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
  const totais = calcularTotais(clientesEmTela, conversas, hoje);
  elemento('total-divida').textContent = formatarMoeda(totais.totalCentavos);
  elemento('total-clientes').textContent = String(totais.quantidadeClientes);
  elemento('total-enviadas').textContent = String(totais.enviadasHoje);
}

function renderizarBarras() {
  const quantosSilenciados = contarSilenciados(servidor.silenciados);
  const contar = (status) => clientesEmTela.filter((c) => c.status === status).length;

  const itens = [
    { classe: 'barra-aguardando', rotulo: 'Aguardando', valor: contar('aguardando') },
    { classe: 'barra-mensagem-enviada', rotulo: 'Enviadas', valor: contar('mensagem-enviada') },
    { classe: 'barra-sem-resposta', rotulo: 'Sem resposta', valor: contar('sem-resposta') },
  ];

  if (quantosSilenciados > 0) {
    itens.push({
      classe: 'barra-silenciados',
      rotulo: 'Não perturbe',
      valor: quantosSilenciados,
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

// O nome vai num span proprio para que so ELE seja truncado. A celula ainda
// recebe o selo "nao perturbe" por ::after, e cortar a celula inteira
// esconderia justamente o indicador de que aquela pessoa esta protegida.
// Razao social de formatura e longa; sem truncar, a tabela cresce e empurra
// os botoes de acao para fora da area visivel.
function celulaDeNome(nome) {
  const td = document.createElement('td');
  td.className = 'celula-nome';
  const texto = document.createElement('span');
  texto.className = 'nome-texto';
  texto.textContent = nome;
  texto.title = nome;
  td.append(texto);
  return td;
}

function linhaDeCliente(cliente, hoje) {
  const dias = diasEmAtraso(cliente.vencimento, hoje);
  const silenciado = estaSilenciado(servidor.silenciados, cliente.telefone);

  const linha = document.createElement('tr');
  if (silenciado) linha.className = 'linha-silenciada';

  let classeAtraso = '';
  if (dias > 0) classeAtraso = 'atraso-vencido';
  else if (dias === 0) classeAtraso = 'atraso-hoje';

  linha.append(
    celulaDeNome(cliente.nome),
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
  // Cliente ficticio nao vai para a tabela do servidor: gravar telefone
  // inventado em nao_perturbe sujaria a trava que protege gente de verdade.
  if (mostrandoFicticios()) {
    silenciar.disabled = true;
    silenciar.title = 'Disponível quando a carteira real do credor for importada.';
  } else {
    silenciar.addEventListener('click', () => trocarSilencio(cliente.telefone));
  }

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

async function trocarSilencio(telefone) {
  const alvo = !estaSilenciado(servidor.silenciados, telefone);

  // A tela so muda depois que o servidor confirma. Atualizar antes daria a
  // impressao de protecao a quem talvez nao esteja protegido — foi
  // exatamente esse descompasso que fez o nao-perturbe nao funcionar ate
  // 2026-08-16, quando ele vivia no localStorage.
  try {
    await definirSilencio(telefone, alvo);
    servidor = await carregarEstado();
    limparErro();
  } catch (erro) {
    mostrarErro(
      `Não foi possível ${alvo ? 'silenciar' : 'reativar'} este número: ${erro.message}. ` +
        'O estado na tela continua sendo o que o servidor confirmou.',
    );
    return;
  }

  renderizar();
  // A gaveta reflete o novo estado sem fechar.
  if (detalheAberto()) mostrarDetalhe(clienteDaGaveta);
}

// Guardado a parte porque a gaveta devolve o telefone no callback, e
// reabri-la exige o id do cliente.
let clienteDaGaveta = null;

function mostrarDetalhe(clienteId) {
  const cliente = clientesEmTela.find((c) => c.id === clienteId);
  if (!cliente) return;
  clienteDaGaveta = clienteId;

  // O historico da gaveta e o real, filtrado pelo telefone do cliente.
  // Antes desta correcao a funcao lia uma variavel `historico` que nunca
  // existiu no modulo: abrir o detalhe lancava ReferenceError e a gaveta
  // nao abria.
  const doCliente = conversas
    .filter((c) => mesmoTelefone(c.telefone, cliente.telefone))
    .sort((a, b) => new Date(b.quando) - new Date(a.quando));

  abrirDetalhe({
    cliente,
    historicoDoCliente: doCliente,
    silenciado: estaSilenciado(servidor.silenciados, cliente.telefone),
    hoje: new Date(),
    // Ficticio nao vai ao servidor: sem callback, a gaveta nao oferece a acao.
    aoAlternarSilencio: mostrandoFicticios()
      ? null
      : () => trocarSilencio(cliente.telefone),
    // O id do cliente ficticio nao existe no banco: sem busca, a gaveta
    // explica isso em vez de afirmar que nao ha telefone cadastrado.
    buscarTelefones: mostrandoFicticios() ? null : () => carregarTelefones(cliente.id),
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
// A comparacao de identidade com a lista importada e o que distingue
// ficticio de real. Vale como guarda em toda acao que sai para o servidor.
function mostrandoFicticios() {
  return clientesEmTela === clientes;
}

function renderizarOrigemDosClientes() {
  const ehFicticia = mostrandoFicticios();

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

/* ---------- Regras comerciais do credor ---------- */

// Faixas de parcelamento, parcela minima, teto de desconto e comissao. Quem
// edita e o operador da assessoria; o servidor recusa qualquer outra sessao
// com 403. A validacao que vale e sempre a do servidor — o formulario apenas
// a espelha, e a previa mostra o resultado da funcao que o portal usa.
let faixasEmEdicao = [];
let regrasSalvas = null;

function lerRegrasDaTela() {
  return {
    faixas: faixasEmEdicao.map((f) => ({
      de: Number(f.de),
      ate: Number(f.ate),
      descontoPct: Number(f.descontoPct),
    })),
    // A tela pede reais porque e assim que o operador pensa; a API so
    // conhece centavos.
    parcelaMinimaCentavos: Math.round(Number(elemento('regra-parcela-minima').value) * 100),
    descontoTetoPct: Number(elemento('regra-teto').value),
    comissaoSobreRecuperadoPct: Number(elemento('regra-comissao').value),
  };
}

const ROTULOS_CAMPO_FAIXA = {
  de: 'De',
  ate: 'Até',
  descontoPct: 'Desconto',
};

function linhaDeFaixa(faixa, indice) {
  const tr = document.createElement('tr');

  for (const campo of ['de', 'ate', 'descontoPct']) {
    const td = document.createElement('td');
    const input = document.createElement('input');
    input.className = 'entrada';
    input.type = 'number';
    input.min = campo === 'descontoPct' ? '0' : '1';
    input.step = campo === 'descontoPct' ? '0.5' : '1';
    input.value = faixa[campo];
    input.setAttribute('aria-label', `${ROTULOS_CAMPO_FAIXA[campo]} da faixa ${indice + 1}`);
    input.addEventListener('input', () => {
      faixasEmEdicao[indice][campo] = input.value;
      agendarPrevia();
    });
    td.append(input);
    tr.append(td);
  }

  const tdRemover = document.createElement('td');
  const remover = document.createElement('button');
  remover.type = 'button';
  remover.className = 'botao-linha';
  remover.textContent = 'Remover';
  remover.setAttribute('aria-label', `Remover a faixa ${indice + 1}`);
  remover.addEventListener('click', () => {
    faixasEmEdicao.splice(indice, 1);
    renderizarFaixas();
    agendarPrevia();
  });
  tdRemover.append(remover);
  tr.append(tdRemover);

  return tr;
}

function renderizarFaixas() {
  elemento('corpo-faixas').replaceChildren(...faixasEmEdicao.map(linhaDeFaixa));
}

// Espera curta para nao chamar o servidor a cada tecla.
let temporizadorPrevia = null;
function agendarPrevia() {
  clearTimeout(temporizadorPrevia);
  temporizadorPrevia = setTimeout(atualizarPrevia, 350);
}

// Duas previas podem estar no ar ao mesmo tempo, e nada garante que voltem na
// ordem em que sairam: uma resposta antiga chegando depois pintaria a tela com
// dinheiro que ja nao corresponde ao formulario. Cada chamada leva um numero e
// so a mais recente tem permissao de escrever na tela.
let previaMaisRecente = 0;

async function atualizarPrevia() {
  const minhaVez = (previaMaisRecente += 1);
  const souAAtual = () => minhaVez === previaMaisRecente;

  const saldo = Math.round(Number(elemento('previa-valor').value) * 100);
  const lista = elemento('previa-ofertas');
  const erro = elemento('previa-erro');

  if (!Number.isFinite(saldo) || saldo <= 0) {
    lista.replaceChildren();
    erro.textContent = 'Informe um valor de exemplo.';
    erro.hidden = false;
    return;
  }

  let resposta;
  try {
    resposta = await previaDeOfertas(lerRegrasDaTela(), saldo);
  } catch (e) {
    if (!souAAtual()) return;
    lista.replaceChildren();
    erro.textContent = `Não foi possível calcular a prévia: ${e.message}`;
    erro.hidden = false;
    return;
  }

  if (!souAAtual()) return;

  // Configuracao invalida volta como 200 com ok:false: enquanto se digita, a
  // configuracao passa por estados invalidos o tempo todo.
  erro.hidden = resposta.ok;
  if (!resposta.ok) {
    erro.textContent = resposta.motivo;
    lista.replaceChildren();
    return;
  }

  lista.replaceChildren(
    ...resposta.ofertas.map((o) => {
      const li = document.createElement('li');
      li.className = 'previa-item';

      const titulo = document.createElement('span');
      titulo.className = 'previa-parcelas';
      // "A vista" nao e um tipo guardado: e simplesmente uma parcela.
      titulo.textContent =
        o.parcelas === 1
          ? `À vista ${formatarMoeda(o.totalCentavos)}`
          : `${o.parcelas}x de ${formatarMoeda(o.valorParcelaCentavos)}`;

      const total = document.createElement('span');
      total.className = 'previa-total';
      total.textContent =
        o.descontoPct > 0
          ? `Total ${formatarMoeda(o.totalCentavos)} — ${o.descontoPct}% de desconto`
          : `Total ${formatarMoeda(o.totalCentavos)}`;

      li.append(titulo, total);
      return li;
    }),
  );
}

// Mudanca grande pede confirmacao: pega o 90 digitado no lugar do 9.
const SALTO_QUE_PEDE_CONFIRMACAO = 10;

function saltoDeDesconto(antes, depois) {
  let maior = 0;
  for (const nova of depois.faixas) {
    const equivalente = antes.faixas.find((f) => f.de === nova.de && f.ate === nova.ate);
    const anterior = equivalente ? equivalente.descontoPct : 0;
    maior = Math.max(maior, nova.descontoPct - anterior);
  }
  return maior;
}

async function montarRegras() {
  const secao = elemento('secao-regras');
  let credor;
  try {
    credor = await carregarRegras();
  } catch {
    // 403 = sessao de credor, que nao edita as proprias regras. A secao
    // simplesmente nao aparece; nao ha erro a mostrar.
    secao.hidden = true;
    return;
  }

  regrasSalvas = credor.regras;
  faixasEmEdicao = credor.regras.faixas.map((f) => ({ ...f }));
  renderizarFaixas();

  elemento('regra-parcela-minima').value = credor.regras.parcelaMinimaCentavos / 100;
  elemento('regra-teto').value = credor.regras.descontoTetoPct;
  elemento('regra-comissao').value = credor.regras.comissaoSobreRecuperadoPct;
  // A previa comeca na media das dividas em aberto: caso real, e nao numero
  // inventado que nao se parece com a carteira.
  elemento('previa-valor').value = (credor.exemploCentavos ?? 100000) / 100;
  secao.hidden = false;

  for (const id of ['regra-parcela-minima', 'regra-teto', 'regra-comissao', 'previa-valor']) {
    elemento(id).addEventListener('input', agendarPrevia);
  }

  elemento('acrescentar-faixa').addEventListener('click', () => {
    const ultima = faixasEmEdicao[faixasEmEdicao.length - 1];
    const inicio = ultima ? Number(ultima.ate) + 1 : 1;
    faixasEmEdicao.push({ de: inicio, ate: inicio, descontoPct: 0 });
    renderizarFaixas();
    agendarPrevia();
  });

  elemento('forma-regras').addEventListener('submit', async (evento) => {
    evento.preventDefault();
    const aviso = elemento('aviso-regras');
    const novas = lerRegrasDaTela();

    const salto = saltoDeDesconto(regrasSalvas, novas);
    if (salto > SALTO_QUE_PEDE_CONFIRMACAO) {
      const ok = confirm(
        `Uma faixa sobe ${salto} pontos de desconto de uma vez.\n\n` +
          `Antes: ${regrasSalvas.faixas.map((f) => `${f.de}-${f.ate}x ${f.descontoPct}%`).join(', ')}\n` +
          `Depois: ${novas.faixas.map((f) => `${f.de}-${f.ate}x ${f.descontoPct}%`).join(', ')}\n\n` +
          'Confirma?',
      );
      if (!ok) return;
    }

    aviso.textContent = 'Salvando…';
    aviso.removeAttribute('data-estado');

    try {
      await salvarRegras(novas);
      regrasSalvas = novas;
      aviso.textContent = 'Regras salvas.';
    } catch (erro) {
      aviso.textContent = `Não foi possível salvar: ${erro.message}`;
      aviso.dataset.estado = 'erro';
    }
  });

  await atualizarPrevia();
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
    await montarRegras();
    limparErro();
  } catch (erro) {
    mostrarErro(
      `Não foi possível carregar os dados do servidor: ${erro.message} ` +
        'O histórico abaixo pode estar vazio ou desatualizado.',
    );
  }
}

iniciar();
