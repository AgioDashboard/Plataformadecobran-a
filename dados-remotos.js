// Fonte de dados real da Fase 2.
//
// O painel e servido pelo proprio Worker, atras de autenticacao basica.
// As chamadas abaixo sao de mesma origem, e o navegador reenvia a
// credencial automaticamente — por isso nao ha token neste arquivo, nem
// prompt, nem armazenamento de segredo no navegador.

import { credorSelecionado } from './credores.js';

// Toda rota de carteira exige ?credor=. Sem credor escolhido nem chegamos a
// pedir: a API responderia 400 e o operador veria um erro de HTTP em vez da
// instrucao do que fazer.
function comCredor(caminho) {
  const credor = credorSelecionado();
  if (!credor) throw new Error('Escolha um credor para ver a carteira.');
  return `${caminho}?credor=${encodeURIComponent(credor)}`;
}

async function chamar(caminho, opcoes = {}) {
  const resposta = await fetch(caminho, opcoes);

  if (resposta.status === 401) {
    throw new Error('Sessao expirada. Recarregue a pagina para entrar de novo.');
  }
  if (!resposta.ok) {
    // A API devolve o motivo em texto puro (ex.: "desconto maximo deve ficar
    // entre 0 e 100"). Sem ele, uma recusa de validacao chegaria a tela como
    // "HTTP 400" e o operador nao saberia o que corrigir.
    const motivo = await resposta.text().catch(() => '');
    const detalhe = motivo.trim() ? `: ${motivo.trim()}` : '';
    throw new Error(`Falha ao acessar ${caminho} (HTTP ${resposta.status})${detalhe}`);
  }
  return resposta.json();
}

// A lista de credores nao pertence a nenhuma carteira: e o menu de escolha.
export async function carregarCredores() {
  const { credores } = await chamar('/api/credores');
  return credores;
}

export async function carregarConversas() {
  const { conversas } = await chamar(comCredor('/api/conversas'));
  return conversas;
}

export async function carregarDevedores() {
  const { devedores } = await chamar(comCredor('/api/devedores'));
  return devedores;
}

// Telefones de um devedor so. O servidor filtra pela carteira do credor
// escolhido — pedir o devedor de outra carteira devolve lista vazia.
export async function carregarTelefones(devedorId) {
  const { telefones } = await chamar(
    `${comCredor('/api/telefones')}&devedor=${encodeURIComponent(devedorId)}`,
  );
  return telefones;
}

export async function carregarRegras() {
  return chamar(comCredor('/api/regras'));
}

// So o operador da assessoria consegue gravar. Sessao de credor recebe 403
// do servidor — o painel nao tenta contornar isso, apenas esconde a secao.
export async function salvarRegras(regras) {
  return chamar(comCredor('/api/regras'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(regras),
  });
}

// Previa das ofertas: calcula e NAO grava. O calculo fica no servidor de
// proposito — e a mesma funcao que o portal usa. Refazer a conta aqui no
// navegador criaria duas fontes de verdade, e a previa mostraria uma coisa
// enquanto o devedor veria outra.
export async function previaDeOfertas(regras, saldoCentavos) {
  return chamar(comCredor('/api/previa-ofertas'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...regras, saldoCentavos }),
  });
}

export async function carregarEstado() {
  return chamar('/api/estado');
}

export async function definirPausa(pausado) {
  return chamar('/api/pausa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pausado }),
  });
}

export async function definirSilencio(telefone, silenciado) {
  return chamar('/api/silencio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone, silenciado }),
  });
}

// --- Teste manual de envio -------------------------------------------
//
// Nenhuma destas rotas leva telefone: o servidor devolve os numeros da
// allowlist mascarados e o painel se refere a eles pelo indice. O numero
// completo nunca chega ao navegador.

export async function carregarDiagnosticoWhatsapp() {
  return chamar('/api/diagnostico-whatsapp');
}

// Gera a sugestao da IA e NAO envia. E o passo que da para repetir a
// vontade sem consumir nada nem incomodar ninguem.
export async function gerarMensagemDeTeste(indice) {
  return chamar('/api/teste-mensagem', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ indice }),
  });
}

export async function enviarMensagemDeTeste(indice, texto) {
  return chamar('/api/teste-envio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ indice, texto }),
  });
}
