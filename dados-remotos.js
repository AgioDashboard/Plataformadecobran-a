// Fonte de dados da Fase 2. Substitui dados-mock.js quando o painel aponta
// para o backend.
//
// O token NUNCA fica neste arquivo — ele vai para o Pages, que e publico.
// E pedido ao operador e guardado so na sessao do navegador.

const BASE = localStorage.getItem('cobranca:api') ?? '';

function token() {
  let t = sessionStorage.getItem('cobranca:token');
  if (!t) {
    t = window.prompt('Token de acesso ao painel:') ?? '';
    if (t) sessionStorage.setItem('cobranca:token', t);
  }
  return t;
}

async function buscar(caminho, opcoes = {}) {
  const resposta = await fetch(`${BASE}${caminho}`, {
    ...opcoes,
    headers: {
      ...(opcoes.headers ?? {}),
      authorization: `Bearer ${token()}`,
    },
  });

  if (resposta.status === 401) {
    // Token errado nao pode ficar preso na sessao, senao todo recarregamento
    // repete a falha sem nunca perguntar de novo.
    sessionStorage.removeItem('cobranca:token');
    throw new Error('Token invalido');
  }
  if (!resposta.ok) throw new Error(`Falha ao carregar ${caminho}`);
  return resposta.json();
}

export async function carregarConversas() {
  const { conversas } = await buscar('/api/conversas');
  return conversas;
}

export async function carregarEstado() {
  return buscar('/api/estado');
}

export async function definirPausa(pausado) {
  return buscar('/api/pausa', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ pausado }),
  });
}

export async function definirSilencio(telefone, silenciado) {
  return buscar('/api/silencio', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ telefone, silenciado }),
  });
}
