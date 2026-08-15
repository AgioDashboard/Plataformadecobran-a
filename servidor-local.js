// Servidor estatico minimo para desenvolvimento. Nao vai para producao:
// no GitHub Pages os arquivos sao servidos pela propria plataforma.
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const PORTA = 4173;
const RAIZ = process.cwd();

const TIPOS = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

createServer(async (requisicao, resposta) => {
  const caminhoPedido = decodeURIComponent(
    new URL(requisicao.url, `http://localhost:${PORTA}`).pathname,
  );
  const relativo = normalize(
    caminhoPedido === '/' ? '/index.html' : caminhoPedido,
  ).replace(/^([/\\])+/, '');

  // Impede sair da raiz do projeto via "..".
  if (relativo.split(/[/\\]/).includes('..')) {
    resposta.writeHead(403).end('Acesso negado');
    return;
  }

  try {
    const conteudo = await readFile(join(RAIZ, relativo));
    resposta.writeHead(200, {
      'content-type': TIPOS[extname(relativo)] ?? 'application/octet-stream',
    });
    resposta.end(conteudo);
  } catch {
    resposta.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    resposta.end('Arquivo nao encontrado');
  }
}).listen(PORTA, () => {
  console.log(`Painel em http://localhost:${PORTA}`);
});
