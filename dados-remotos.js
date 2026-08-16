// Fonte de dados real da Fase 2.
//
// O painel e servido pelo proprio Worker, atras de autenticacao basica.
// As chamadas abaixo sao de mesma origem, e o navegador reenvia a
// credencial automaticamente — por isso nao ha token neste arquivo, nem
// prompt, nem armazenamento de segredo no navegador.

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

export async function carregarConversas() {
  const { conversas } = await chamar('/api/conversas');
  return conversas;
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
