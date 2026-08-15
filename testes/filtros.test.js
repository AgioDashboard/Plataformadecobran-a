import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizar, filtrar, ordenar, FAIXAS } from '../filtros.js';

const HOJE = new Date(2026, 7, 15); // 15/08/2026

const base = [
  { id: 'c-1', nome: 'Cristal Serviços Digitais', valorCentavos: 90000, vencimento: '2026-06-03', status: 'sem-resposta' },
  { id: 'c-2', nome: 'Aurora Comercio', valorCentavos: 10000, vencimento: '2026-07-30', status: 'aguardando' },
  { id: 'c-3', nome: 'Benedito Nunes', valorCentavos: 50000, vencimento: '2026-08-14', status: 'mensagem-enviada' },
  { id: 'c-4', nome: 'Zenite Clinica', valorCentavos: 30000, vencimento: '2026-09-02', status: 'aguardando' },
];

const semFiltro = { busca: '', status: 'todos', faixa: 'todas' };

test('normalizar remove acentos e caixa', () => {
  assert.equal(normalizar('Serviços'), 'servicos');
  assert.equal(normalizar('AÇÃO Ltda'), 'acao ltda');
  assert.equal(normalizar(''), '');
});

test('filtrar sem criterios devolve tudo', () => {
  assert.equal(filtrar(base, semFiltro, HOJE).length, 4);
});

test('busca ignora acentos e maiusculas', () => {
  const r = filtrar(base, { ...semFiltro, busca: 'servicos' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1']);
});

test('busca casa por pedaco do nome', () => {
  const r = filtrar(base, { ...semFiltro, busca: 'nune' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-3']);
});

test('busca sem resultado devolve lista vazia', () => {
  assert.deepEqual(filtrar(base, { ...semFiltro, busca: 'inexistente' }, HOJE), []);
});

test('filtro por status seleciona so aquele status', () => {
  const r = filtrar(base, { ...semFiltro, status: 'aguardando' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-2', 'c-4']);
});

test('faixa "a-vencer" pega apenas vencimento futuro', () => {
  const r = filtrar(base, { ...semFiltro, faixa: 'a-vencer' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-4']);
});

test('faixa "1-30" pega atraso de 1 a 30 dias', () => {
  const r = filtrar(base, { ...semFiltro, faixa: '1-30' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-2', 'c-3']);
});

test('faixa "60+" pega atraso acima de 60 dias', () => {
  const r = filtrar(base, { ...semFiltro, faixa: '60+' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1']);
});

test('criterios combinam com E', () => {
  const r = filtrar(base, { busca: 'a', status: 'aguardando', faixa: '1-30' }, HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-2']);
});

test('filtrar nao altera a lista original', () => {
  const copia = [...base];
  filtrar(base, { ...semFiltro, busca: 'aurora' }, HOJE);
  assert.deepEqual(base, copia);
});

test('FAIXAS expoe as opcoes na ordem de exibicao', () => {
  assert.deepEqual(
    FAIXAS.map((f) => f.valor),
    ['todas', 'a-vencer', '1-30', '31-60', '60+'],
  );
});

test('ordenar por nome respeita acentuacao do portugues', () => {
  const r = ordenar(base, 'nome', 'asc', HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-2', 'c-3', 'c-1', 'c-4']);
});

test('ordenar por valor decrescente', () => {
  const r = ordenar(base, 'valor', 'desc', HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1', 'c-3', 'c-4', 'c-2']);
});

test('ordenar por atraso decrescente poe o mais antigo primeiro', () => {
  const r = ordenar(base, 'atraso', 'desc', HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1', 'c-2', 'c-3', 'c-4']);
});

test('ordenar por vencimento crescente', () => {
  const r = ordenar(base, 'vencimento', 'asc', HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1', 'c-2', 'c-3', 'c-4']);
});

test('ordenar nao altera a lista original', () => {
  const copia = [...base];
  ordenar(base, 'valor', 'desc', HOJE);
  assert.deepEqual(base, copia);
});

test('ordenar com coluna desconhecida devolve a ordem original', () => {
  const r = ordenar(base, 'inexistente', 'asc', HOJE);
  assert.deepEqual(r.map((c) => c.id), ['c-1', 'c-2', 'c-3', 'c-4']);
});
