// Nao-perturbe por TELEFONE, espelhando a tabela nao_perturbe do servidor.
//
// Ate 2026-08-16 este modulo gravava em localStorage, chaveado por id de
// cliente. O painel mostrava "silenciado" e o robo, que consulta o banco,
// nunca ficava sabendo: a trava existia dos dois lados e eles nao se
// falavam. Quem operava via a confirmacao na tela e concluia, errado, que
// aquela pessoa estava protegida.
//
// Agora nao ha estado local nenhum. A lista vem do servidor em
// /api/estado e a escrita vai por /api/silencio. Uma fonte so.

import { mesmoTelefone } from './logica.js';

export function estaSilenciado(silenciados, telefone) {
  return (silenciados ?? []).some((s) => mesmoTelefone(s, telefone));
}

export function contarSilenciados(silenciados) {
  return (silenciados ?? []).length;
}
