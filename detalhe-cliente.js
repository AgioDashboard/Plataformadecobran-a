// Gaveta lateral com o detalhe de um cliente. Unidade isolada: recebe o
// cliente e os callbacks de que precisa, nao conhece o resto do painel.

import { formatarMoeda, diasEmAtraso, rotuloAtraso, mascararTelefone } from './logica.js';

const ROTULOS_STATUS = {
  aguardando: 'Aguardando',
  'mensagem-enviada': 'Mensagem enviada',
  'sem-resposta': 'Sem resposta',
};

const formatadorData = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short' });
const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

const elemento = (id) => document.getElementById(id);

// Elemento que tinha o foco antes de abrir, para devolve-lo ao fechar.
let focoAnterior = null;
let aoFecharAtual = null;

function criarLinha(termo, definicao, classe) {
  const div = document.createElement('div');
  div.className = 'gaveta-linha';

  const dt = document.createElement('dt');
  dt.textContent = termo;

  const dd = document.createElement('dd');
  dd.textContent = definicao;
  if (classe) dd.className = classe;

  div.append(dt, dd);
  return div;
}

function criarHistoricoDoCliente(entradas) {
  if (entradas.length === 0) {
    const vazio = document.createElement('p');
    vazio.className = 'gaveta-vazio';
    vazio.textContent = 'Nenhuma mensagem enviada para este cliente.';
    return vazio;
  }

  const lista = document.createElement('ul');
  lista.className = 'gaveta-historico';

  for (const entrada of entradas) {
    const item = document.createElement('li');

    const topo = document.createElement('div');
    topo.className = 'gaveta-historico-topo';

    const resultado = document.createElement('span');
    resultado.textContent = entrada.resultado === 'falhou' ? 'Falhou' : 'Enviada';
    if (entrada.resultado === 'falhou') resultado.className = 'atraso-vencido';

    const quando = document.createElement('span');
    quando.className = 'gaveta-historico-quando';
    quando.textContent = formatadorDataHora.format(new Date(entrada.quando));

    topo.append(resultado, quando);

    const trecho = document.createElement('p');
    trecho.className = 'gaveta-historico-trecho';
    trecho.textContent = entrada.trecho;

    item.append(topo, trecho);
    lista.append(item);
  }

  return lista;
}

export function fecharDetalhe() {
  elemento('gaveta').hidden = true;
  elemento('fundo-gaveta').hidden = true;
  document.removeEventListener('keydown', aoTeclar, true);

  if (focoAnterior && document.contains(focoAnterior)) {
    focoAnterior.focus();
  }
  focoAnterior = null;
  aoFecharAtual = null;
}

function aoTeclar(evento) {
  if (evento.key === 'Escape') {
    evento.preventDefault();
    fecharDetalhe();
    return;
  }

  // Foco preso: Tab circula apenas dentro da gaveta enquanto ela esta aberta.
  if (evento.key !== 'Tab') return;

  const focaveis = elemento('gaveta').querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
  );
  if (focaveis.length === 0) return;

  const primeiro = focaveis[0];
  const ultimo = focaveis[focaveis.length - 1];

  if (evento.shiftKey && document.activeElement === primeiro) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primeiro.focus();
  }
}

export function abrirDetalhe({ cliente, historicoDoCliente, silenciado, hoje, aoAlternarSilencio }) {
  const conteudo = elemento('gaveta-conteudo');
  const dias = diasEmAtraso(cliente.vencimento, hoje);
  const partes = [];

  if (silenciado) {
    const aviso = document.createElement('p');
    aviso.className = 'aviso-silencio';
    aviso.textContent =
      'Cliente em não perturbe. Nenhuma cobrança será disparada para ele, mesmo com os disparos ativos.';
    partes.push(aviso);
  }

  const nome = document.createElement('p');
  nome.className = 'gaveta-nome';
  nome.textContent = cliente.nome;
  partes.push(nome);

  const valor = document.createElement('p');
  valor.className = 'gaveta-valor';
  valor.textContent = formatarMoeda(cliente.valorCentavos);
  partes.push(valor);

  const lista = document.createElement('dl');
  lista.className = 'gaveta-linhas';
  lista.append(
    criarLinha('Vencimento', formatadorData.format(new Date(`${cliente.vencimento}T00:00:00`))),
    criarLinha('Atraso', rotuloAtraso(dias), dias > 0 ? 'atraso-vencido' : ''),
    criarLinha('Situação', ROTULOS_STATUS[cliente.status] ?? cliente.status),
    criarLinha('WhatsApp', mascararTelefone(cliente.telefone)),
  );
  partes.push(lista);

  const tituloHistorico = document.createElement('p');
  tituloHistorico.className = 'gaveta-secao';
  tituloHistorico.textContent = 'Mensagens deste cliente';
  partes.push(tituloHistorico, criarHistoricoDoCliente(historicoDoCliente));

  // Sem callback, a acao nao aparece — e o caso do cliente ficticio, que
  // nao pode entrar na tabela de nao-perturbe do servidor. Mostrar um botao
  // inerte seria pior: quem clicasse acharia que protegeu alguem.
  if (aoAlternarSilencio) {
    const acao = document.createElement('button');
    acao.type = 'button';
    acao.className = silenciado ? 'gaveta-acao gaveta-acao-ativa' : 'gaveta-acao';
    acao.textContent = silenciado ? 'Remover não perturbe' : 'Marcar como não perturbe';
    acao.addEventListener('click', () => aoAlternarSilencio());
    partes.push(acao);
  }

  conteudo.replaceChildren(...partes);

  focoAnterior = document.activeElement;
  aoFecharAtual = fecharDetalhe;

  elemento('fundo-gaveta').hidden = false;
  elemento('gaveta').hidden = false;
  elemento('fechar-gaveta').focus();

  document.addEventListener('keydown', aoTeclar, true);
}

export function detalheAberto() {
  return !elemento('gaveta').hidden;
}
