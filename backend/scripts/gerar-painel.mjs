// Embute os arquivos do painel no bundle do Worker.
//
// A raiz do repositorio continua sendo a fonte unica: este script apenas
// gera src/painel/arquivos.ts a partir dela. Rode antes de cada deploy —
// o script "deploy" do package.json ja faz isso.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const aqui = dirname(fileURLToPath(import.meta.url));
const raiz = join(aqui, '..', '..');
const destino = join(aqui, '..', 'src', 'painel', 'arquivos.ts');

// Lista explicita, nao glob: um arquivo novo so entra se alguem o
// acrescentar aqui de proposito.
const ARQUIVOS = [
  ['index.html', 'text/html; charset=utf-8'],
  ['estilos.css', 'text/css; charset=utf-8'],
  ['app.js', 'text/javascript; charset=utf-8'],
  ['logica.js', 'text/javascript; charset=utf-8'],
  ['filtros.js', 'text/javascript; charset=utf-8'],
  ['nao-perturbe.js', 'text/javascript; charset=utf-8'],
  ['detalhe-cliente.js', 'text/javascript; charset=utf-8'],
  ['dados-mock.js', 'text/javascript; charset=utf-8'],
  ['dados-remotos.js', 'text/javascript; charset=utf-8'],
  ['credores.js', 'text/javascript; charset=utf-8'],
  ['teste-envio.js', 'text/javascript; charset=utf-8'],
];

const PADROES_PROIBIDOS = [
  /EAA[A-Za-z0-9]{20,}/,
  /sk-ant-[A-Za-z0-9]{10,}/,
  /xoxb-[A-Za-z0-9-]{10,}/,
];

const entradas = ARQUIVOS.map(([nome, tipo]) => {
  const conteudo = readFileSync(join(raiz, nome), 'utf8');

  for (const padrao of PADROES_PROIBIDOS) {
    if (padrao.test(conteudo)) {
      throw new Error(`Credencial encontrada em ${nome}. Geracao abortada.`);
    }
  }

  return `  ${JSON.stringify('/' + nome)}: { tipo: ${JSON.stringify(tipo)}, conteudo: ${JSON.stringify(conteudo)} },`;
});

const saida = `// GERADO POR scripts/gerar-painel.mjs — NAO EDITE A MAO.
// A fonte sao os arquivos da raiz do repositorio.

export interface ArquivoPainel {
  tipo: string;
  conteudo: string;
}

export const ARQUIVOS_PAINEL: Record<string, ArquivoPainel> = {
${entradas.join('\n')}
};
`;

mkdirSync(dirname(destino), { recursive: true });
writeFileSync(destino, saida, 'utf8');
console.log(`Painel embutido: ${ARQUIVOS.length} arquivos em src/painel/arquivos.ts`);
