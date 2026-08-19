import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

// join(import.meta.dirname, ...) e nao new URL(...): o tsconfig carrega
// @cloudflare/workers-types, entao URL global e a da plataforma Workers, de
// tipo incompativel com a URL do Node que readFileSync aceita. Os testes
// rodariam; o tsc e que reclamaria (TS2769).
const raizSrc = join(import.meta.dirname, '..', 'src');

// Tabelas cujo conteudo pertence a uma carteira. Consulta a qualquer uma
// delas sem credor_id mistura credores.
const TABELAS_DE_CARTEIRA = /\b(devedores|dividas|conversas|telefones|tentativas_contato)\b/i;

// Excecoes conscientes, com o motivo. Qualquer nova excecao exige que
// alguem escreva aqui por que ela e segura.
const LIBERADOS = new Map<string, string>([
  [
    'db/repositorio.ts:ultimaEntradaDe',
    'a janela de 24 horas e do numero de telefone, nao da carteira: o mesmo numero nao pode receber texto livre por credor diferente so porque trocou de carteira',
  ],
  [
    'db/repositorio.ts:entradasRecentes',
    'mesma razao de ultimaEntradaDe: a janela de 24 horas e do numero, nao da carteira. A consulta devolve so telefone e o instante da ultima entrada — nunca texto, nome ou valor — e existe para dizer quais numeros da allowlist de teste ainda podem receber texto livre; filtrar por credor_id daria a resposta errada, porque o mesmo numero nao ganha uma janela nova ao trocar de carteira',
  ],
  [
    'db/repositorio.ts:ultimaEntradaComTexto',
    'o telefone consultado vem sempre de DESTINATARIOS_TESTE, lido do ambiente no servidor, e nunca do corpo da requisicao — o painel manda um indice, nao um numero — e a rota que chama e so do operador; alem disso os numeros de teste nao estao em carteira nenhuma, entao exigir credor_id devolveria vazio e a tela leria isso como "este numero nunca escreveu", que e falso',
  ],
  [
    'db/telefones.ts:definirStatusTelefone',
    'quem chama e o processamento do recibo, que chega da Meta com o wamid e nenhuma nocao de carteira; o telefone_id ja veio de fecharTentativa, que resolveu uma linha unica, e a chave primaria nao aceita mais de uma carteira por definicao',
  ],
  [
    'db/telefones.ts:tentativaAberta',
    'a pergunta e se aquele devedor tem tentativa em aberto, e devedor_id ja pertence a exatamente uma carteira; acrescentar credor_id aqui nao estreitaria o resultado, e omiti-lo so poderia liberar uma tentativa a mais, nunca dados de outro credor',
  ],
  [
    'db/telefones.ts:fecharTentativa',
    'o recibo da Meta traz apenas o wamid, que e unico no mundo inteiro e por isso identifica uma tentativa so; exigir credor_id seria exigir do webhook uma informacao que a Meta nao manda, e o efeito seria nunca fechar tentativa nenhuma',
  ],
  [
    'whatsapp/recibos.ts:atualizarStatusDaConversa',
    'o recibo de status da Meta traz apenas o wamid (id_externo), que e unico no mundo inteiro e por isso identifica uma mensagem so, exatamente como fecharTentativa; exigir credor_id exigiria do webhook de status uma informacao que a Meta nao manda junto do recibo',
  ],
  [
    'db/reiniciar-teste.ts:reiniciarConversaDeTeste',
    'o telefone ja foi confirmado contra a allowlist de teste (config.destinatariosTeste) antes de chamar esta funcao, nunca um cliente de verdade; o objetivo e apagar TODO o historico daquele numero para reiniciar o teste do zero, inclusive linhas gravadas sem credor resolvido (credor_id "sem-credor") — filtrar por credor_id deixaria justamente essas sobrarem e o reinicio ficaria incompleto',
  ],
  [
    'index.ts:scheduled',
    'destravar fila e manutencao que atravessa carteiras de proposito: o cron encerra tentativas sem recibo de todas elas de uma vez e nao le nem devolve dado de credor nenhum, so escreve fechada_em e desfecho; exigir escopo obrigaria a varrer credor a credor, com o mesmo efeito e nenhuma protecao a mais',
  ],
]);

// src/painel/arquivos.ts e gerado por scripts/gerar-painel.mjs e carrega o
// HTML e o JS do painel como texto. Nada ali fala com o D1, mas os template
// literals do painel caem na peneira de SQL abaixo e viram alarme falso.
// Varrer codigo gerado tambem nao protege ninguem: a fonte de verdade sao
// os arquivos da raiz, e um problema real apareceria neles primeiro.
const GERADOS = new Set(['painel/arquivos.ts']);

function arquivosTs(dir: string): string[] {
  return readdirSync(dir).flatMap((nome) => {
    const caminho = join(dir, nome);
    if (statSync(caminho).isDirectory()) return arquivosTs(caminho);
    return nome.endsWith('.ts') ? [caminho] : [];
  });
}

function relativoDe(caminho: string): string {
  // +1 descarta o separador que sobra depois da raiz.
  return caminho.slice(raizSrc.length + 1).replace(/\\/g, '/');
}

interface ComandoSql {
  sql: string;
  funcao: string;
}

// A chave da excecao aponta uma FUNCAO, nao um arquivo. Por isso cada SQL
// carrega o nome da funcao que o cerca: liberar o arquivo inteiro deixaria
// toda consulta futura de repositorio.ts entrar sem escopo e sem ninguem
// reparar — o oposto do que este teste existe para fazer.
// Aspas simples e duplas contam junto com a crase. Ate 2026-08-16 o guarda
// so olhava crase, e nove consultas escritas em aspas simples — quatro delas
// tocando devedores e dividas — nunca foram varridas. Passavam verdes por
// nao serem vistas, que e o mesmo defeito que este teste existe para pegar.
const PADRAO_SQL = /(?:`([^`]*(?:SELECT|INSERT|UPDATE|DELETE)[^`]*)`|'([^'\n]*(?:SELECT|INSERT|UPDATE|DELETE)[^'\n]*)'|"([^"\n]*(?:SELECT|INSERT|UPDATE|DELETE)[^"\n]*)")/gi;

// Metodo de objeto conta como funcao. Sem isto, `fetch` e `scheduled` do
// index.ts — que sao metodos do objeto exportado, nao declaracoes
// "function" — caiam ambos no rotulo "(fora de funcao)", e uma unica
// excecao com essa chave liberava o ARQUIVO INTEIRO. Verificado plantando
// um endpoint que despejava nome e telefone de todos os devedores: o
// guarda passava verde.
const PADRAO_FUNCAO =
  /\bfunction\s+([A-Za-z0-9_$]+)|(?:^|[\s,{])(?:async\s+)?([A-Za-z0-9_$]+)\s*\([^()]*\)\s*(?::[^{;=]+)?\{/g;

// Palavras que casam a forma de um metodo mas nao sao um.
const NAO_SAO_FUNCOES = new Set(['if', 'for', 'while', 'switch', 'catch', 'return', 'typeof']);

function nomeDaFuncaoAntesDe(texto: string, posicao: number): string {
  const antes = texto.slice(0, posicao);
  let nome = '(fora de funcao)';
  for (const d of antes.matchAll(PADRAO_FUNCAO)) {
    const candidato = d[1] ?? d[2];
    if (candidato && !NAO_SAO_FUNCOES.has(candidato)) nome = candidato;
  }
  return nome;
}

function comandos(texto: string): ComandoSql[] {
  return [...texto.matchAll(PADRAO_SQL)].map((m) => ({
    // Um dos tres grupos casou: crase, aspas simples ou aspas duplas.
    sql: m[1] ?? m[2] ?? m[3],
    funcao: nomeDaFuncaoAntesDe(texto, m.index),
  }));
}

test('nenhuma consulta a tabela de carteira roda sem credor_id', () => {
  const faltas: string[] = [];

  for (const caminho of arquivosTs(raizSrc)) {
    const relativo = relativoDe(caminho);
    if (GERADOS.has(relativo)) continue;
    for (const { sql, funcao } of comandos(readFileSync(caminho, 'utf8'))) {
      if (!TABELAS_DE_CARTEIRA.test(sql)) continue;
      if (/credor_id/i.test(sql)) continue;
      if (LIBERADOS.has(`${relativo}:${funcao}`)) continue;

      faltas.push(`${relativo}:${funcao}: ${sql.replace(/\s+/g, ' ').trim().slice(0, 120)}`);
    }
  }

  assert.deepEqual(faltas, [], `consultas sem escopo de credor:\n${faltas.join('\n')}`);
});

test('toda excecao liberada tem justificativa escrita', () => {
  for (const [chave, motivo] of LIBERADOS) {
    assert.ok(motivo.length > 40, `excecao sem justificativa util: ${chave}`);
  }
});
