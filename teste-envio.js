// Teste manual de envio.
//
// Existe para responder uma pergunta antes de qualquer disparo: o caminho
// inteiro — número certo, allowlist, janela, IA, portão — funciona mesmo?
//
// Duas decisões moldam esta tela:
//
// 1. O botão de enviar só habilita quando o envio de fato pode acontecer.
//    Deixar habilitado e falhar depois ensina o operador a ignorar erro;
//    desabilitar COM o motivo escrito ao lado ensina o contrário.
// 2. Nenhum telefone completo trafega. O servidor manda mascarado e o
//    painel devolve o índice.

import {
  carregarDiagnosticoWhatsapp,
  enviarMensagemDeTeste,
  gerarMensagemDeTeste,
} from './dados-remotos.js';

const elemento = (id) => document.getElementById(id);

const formatadorDataHora = new Intl.DateTimeFormat('pt-BR', {
  dateStyle: 'short',
  timeStyle: 'short',
});

let diagnostico = null;
let escolhido = null;

/* ---------- Remetente ---------- */

function renderizarRemetente() {
  const caixa = elemento('teste-remetente');
  const { numero, remetenteDeTeste } = diagnostico;

  caixa.replaceChildren();
  caixa.dataset.estado = remetenteDeTeste ? 'ok' : 'erro';

  const titulo = document.createElement('p');
  titulo.className = 'teste-remetente-numero';

  if (!numero.ok) {
    // Não conseguir conferir é diferente de conferir e estar errado — e a
    // tela precisa dizer qual dos dois aconteceu, porque a ação é outra.
    titulo.textContent = 'Não foi possível conferir o número configurado';
    const detalhe = document.createElement('p');
    detalhe.className = 'teste-remetente-detalhe';
    detalhe.textContent = `${numero.erro}. Enquanto isso, o envio fica bloqueado.`;
    caixa.append(titulo, detalhe);
    return;
  }

  titulo.textContent = numero.numeroExibicao ?? 'número não informado pela Meta';

  const detalhe = document.createElement('p');
  detalhe.className = 'teste-remetente-detalhe';
  const nome = numero.nomeVerificado ? `${numero.nomeVerificado} · ` : '';
  detalhe.textContent = remetenteDeTeste
    ? `${nome}é este número que vai aparecer para quem receber.`
    : `${nome}este NÃO é o número de teste (+1). O envio pelo painel fica bloqueado.`;

  caixa.append(titulo, detalhe);
}

/* ---------- Destinatários ---------- */

// O motivo pelo qual este destinatário não pode receber agora, ou string
// vazia se pode. Uma função só, para que o texto ao lado do rádio e a razão
// do botão desabilitado nunca discordem.
function impedimentoDe(destinatario) {
  if (diagnostico.pausado) return 'disparos pausados';
  if (destinatario.silenciado) return 'marcado como não perturbe';
  if (!destinatario.janelaAberta) {
    return destinatario.ultimaEntrada
      ? 'janela de 24h fechada — a última mensagem dele passou de 24 horas'
      : 'janela de 24h fechada — este número ainda não escreveu para nós';
  }
  if (!diagnostico.remetenteDeTeste) {
    return 'número remetente não confirmado como o de teste';
  }
  return '';
}

function itemDeDestinatario(destinatario) {
  const impedimento = impedimentoDe(destinatario);

  const li = document.createElement('li');
  li.className = impedimento
    ? 'teste-destinatario teste-destinatario-bloqueado'
    : 'teste-destinatario';

  const rotulo = document.createElement('label');
  rotulo.className = 'teste-destinatario-rotulo';

  const radio = document.createElement('input');
  radio.type = 'radio';
  radio.name = 'teste-destinatario';
  radio.value = String(destinatario.indice);
  radio.checked = escolhido === destinatario.indice;
  radio.addEventListener('change', () => {
    escolhido = destinatario.indice;
    // Texto rascunhado para outro número não pode seguir na tela: seria
    // fácil enviar a sugestão de uma conversa para a pessoa errada.
    elemento('teste-texto').value = '';
    renderizarDestinatarios();
    atualizarAcoes();
  });

  const numero = document.createElement('span');
  numero.className = 'teste-destinatario-numero';
  numero.textContent = destinatario.mascarado;

  rotulo.append(radio, numero);

  const estado = document.createElement('span');
  estado.className = impedimento
    ? 'teste-estado teste-estado-fechado'
    : 'teste-estado teste-estado-aberto';
  estado.textContent = impedimento || 'janela aberta';

  li.append(rotulo, estado);

  if (destinatario.ultimaEntrada) {
    const quando = document.createElement('span');
    quando.className = 'teste-destinatario-quando';
    quando.textContent = `Última mensagem dele: ${formatadorDataHora.format(
      new Date(destinatario.ultimaEntrada),
    )}`;
    li.append(quando);
  }

  return li;
}

function renderizarDestinatarios() {
  const lista = elemento('teste-destinatarios');
  lista.replaceChildren(...diagnostico.destinatarios.map(itemDeDestinatario));
  elemento('teste-sem-destinatario').hidden = diagnostico.destinatarios.length > 0;
}

/* ---------- Ações ---------- */

function destinatarioEscolhido() {
  return diagnostico.destinatarios.find((d) => d.indice === escolhido) ?? null;
}

function atualizarAcoes() {
  const alvo = destinatarioEscolhido();
  const gerar = elemento('teste-gerar');
  const enviar = elemento('teste-enviar');
  const aviso = elemento('teste-aviso-envio');

  // Gerar sugestão não envia nada: basta ter alguém escolhido.
  gerar.disabled = alvo === null;

  const impedimento = alvo ? impedimentoDe(alvo) : 'escolha um número de teste acima';
  const semTexto = elemento('teste-texto').value.trim().length === 0;

  enviar.disabled = Boolean(impedimento) || semTexto;
  aviso.textContent = impedimento || (semTexto ? 'Escreva ou gere o texto da mensagem.' : '');
  aviso.hidden = !enviar.disabled;
}

function mostrarResultado(texto, estado) {
  const linha = elemento('teste-resultado');
  linha.textContent = texto;
  if (estado) linha.dataset.estado = estado;
  else linha.removeAttribute('data-estado');
  linha.hidden = texto.length === 0;
}

async function aoGerar() {
  const gerar = elemento('teste-gerar');
  gerar.disabled = true;
  mostrarResultado('Consultando a IA…');

  try {
    const r = await gerarMensagemDeTeste(escolhido);
    elemento('teste-texto').value = r.texto ?? '';

    if (!r.ok) {
      // Sugestão reprovada aparece COM o motivo, e não some: é justamente
      // esse motivo que o teste existe para revelar.
      mostrarResultado(
        r.texto
          ? `A IA respondeu, mas o validador reprovou: ${r.motivo}. No fluxo automático isto seria encaminhado para um atendente.`
          : `Não deu para gerar: ${r.motivo}`,
        'erro',
      );
    } else if (r.encaminharHumano) {
      mostrarResultado(
        `A IA classificou como "${r.intencao}" e pediu atendente humano. No fluxo automático nada seria enviado.`,
        'erro',
      );
    } else {
      mostrarResultado(`Sugestão pronta (intenção: ${r.intencao}). Revise antes de enviar.`);
    }
  } catch (erro) {
    mostrarResultado(`Não foi possível gerar: ${erro.message}`, 'erro');
  } finally {
    atualizarAcoes();
  }
}

async function aoEnviar() {
  const alvo = destinatarioEscolhido();
  if (!alvo) return;

  const texto = elemento('teste-texto').value.trim();
  // Confirmação com o texto inteiro à vista: depois do envio não há desfazer.
  const ok = confirm(
    `Enviar para ${alvo.mascarado}?\n\n${texto}\n\nNão é possível desfazer um envio.`,
  );
  if (!ok) return;

  elemento('teste-enviar').disabled = true;
  mostrarResultado('Enviando…');

  try {
    const r = await enviarMensagemDeTeste(alvo.indice, texto);
    if (r.ok) {
      mostrarResultado(`Enviado para ${alvo.mascarado}. Id da Meta: ${r.idExterno ?? '—'}`, 'ok');
    } else {
      mostrarResultado(`O portão bloqueou o envio: ${r.motivo}`, 'erro');
    }
  } catch (erro) {
    mostrarResultado(`Falha ao enviar: ${erro.message}`, 'erro');
  }

  // O diagnóstico volta do servidor: janela, pausa e silêncio podem ter
  // mudado, e a tela não deve adivinhar o estado novo.
  await recarregar();
}

async function recarregar() {
  diagnostico = await carregarDiagnosticoWhatsapp();
  if (!diagnostico.destinatarios.some((d) => d.indice === escolhido)) escolhido = null;
  renderizarRemetente();
  renderizarDestinatarios();
  atualizarAcoes();
}

export async function montarTesteEnvio() {
  const secao = elemento('secao-teste');

  try {
    diagnostico = await carregarDiagnosticoWhatsapp();
  } catch {
    // 403 = sessão de credor, que não testa envio. A seção simplesmente
    // não aparece; não há erro a mostrar.
    secao.hidden = true;
    return;
  }

  elemento('teste-gerar').addEventListener('click', aoGerar);
  elemento('teste-enviar').addEventListener('click', aoEnviar);
  elemento('teste-texto').addEventListener('input', atualizarAcoes);
  elemento('teste-recarregar').addEventListener('click', () => {
    recarregar().catch((erro) =>
      mostrarResultado(`Não foi possível atualizar: ${erro.message}`, 'erro'),
    );
  });

  renderizarRemetente();
  renderizarDestinatarios();
  atualizarAcoes();
  secao.hidden = false;
}
