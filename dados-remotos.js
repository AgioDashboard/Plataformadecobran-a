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
    throw new Error(`Falha ao acessar ${caminho} (HTTP ${resposta.status})`);
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

export async function carregarRegras() {
  return chamar(comCredor('/api/regras'));
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
