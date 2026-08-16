import type { Sessao } from './sessao.ts';
import { escopoDaConsulta } from './sessao.ts';
import type { RegrasCredor } from '../dominio/faixas.ts';
import { validarRegras } from '../dominio/faixas.ts';
import {
  definirPausaGlobal,
  definirSilencio,
  lerPausaGlobal,
  registrarAuditoria,
} from '../dominio/travas.ts';
import { importarParaCarteira } from '../cobmais/importar.ts';
import { conversasDoCredor } from '../db/repositorio.ts';
import { listarDevedores, listarDividas } from '../db/cadastro.ts';
import { listarCredores, lerCredor, salvarRegras } from '../db/credores.ts';
import { telefonesDoDevedor } from '../db/telefones.ts';

// Le as regras do corpo sem julgar nada: quem julga e validarRegras, uma
// so vez, no dominio. Number() de coisa ausente vira NaN, que a validacao
// recusa — nao ha por que repetir a checagem aqui.
function regrasDoCorpo(corpo: Record<string, unknown>): RegrasCredor {
  return {
    faixas: Array.isArray(corpo.faixas)
      ? (corpo.faixas as unknown[]).map((f) => {
          const bruto = f as Record<string, unknown>;
          return {
            de: Number(bruto.de),
            ate: Number(bruto.ate),
            descontoPct: Number(bruto.descontoPct),
          };
        })
      : [],
    parcelaMinimaCentavos: Number(corpo.parcelaMinimaCentavos),
    descontoTetoPct: Number(corpo.descontoTetoPct),
    comissaoSobreRecuperadoPct: Number(corpo.comissaoSobreRecuperadoPct),
  };
}

// A autenticacao acontece no roteador principal. Aqui a preocupacao e
// outra: nenhum endpoint de carteira responde sem um credor resolvido.
export async function rotearPainel(
  requisicao: Request,
  url: URL,
  sessao: Sessao,
  db: D1Database,
): Promise<Response> {
  const metodo = requisicao.method;

  // --- Rotas sem escopo de carteira -------------------------------------

  if (url.pathname === '/api/credores' && metodo === 'GET') {
    const todos = await listarCredores(db);
    const escopo = sessao.escopo;
    const visiveis =
      escopo.tipo === 'credor' ? todos.filter((c) => c.id === escopo.credorId) : todos;
    return Response.json({ credores: visiveis });
  }

  if (url.pathname === '/api/estado' && metodo === 'GET') {
    // Pausa global e nao-perturbe sao da operacao inteira, nao de uma
    // carteira. Ver "Decisoes de projeto".
    const pausado = await lerPausaGlobal(db);
    const { results } = await db
      .prepare('SELECT telefone FROM nao_perturbe WHERE silenciado = 1')
      .all<{ telefone: string }>();
    return Response.json({ pausado, silenciados: results.map((s) => s.telefone) });
  }

  if (url.pathname === '/api/pausa' && metodo === 'POST') {
    const { pausado } = (await requisicao.json()) as { pausado: boolean };
    if (typeof pausado !== 'boolean') {
      return new Response('Campo pausado deve ser booleano', { status: 400 });
    }
    await definirPausaGlobal(db, pausado, 'painel');
    return Response.json({ pausado });
  }

  if (url.pathname === '/api/silencio' && metodo === 'POST') {
    const { telefone, silenciado } = (await requisicao.json()) as {
      telefone: string;
      silenciado: boolean;
    };
    if (typeof telefone !== 'string' || telefone.length === 0) {
      return new Response('Campo telefone obrigatorio', { status: 400 });
    }
    if (typeof silenciado !== 'boolean') {
      return new Response('Campo silenciado deve ser booleano', { status: 400 });
    }
    await definirSilencio(db, telefone, silenciado, 'painel');
    return Response.json({ telefone, silenciado });
  }

  // --- Daqui para baixo, tudo exige carteira resolvida -------------------

  const escopo = escopoDaConsulta(sessao, url);
  if (!escopo.ok) return new Response(escopo.motivo, { status: 400 });
  const { credorId } = escopo;

  if (url.pathname === '/api/regras' && metodo === 'GET') {
    const credor = await lerCredor(db, credorId);
    if (!credor) return new Response('Credor nao encontrado', { status: 404 });
    return Response.json(credor);
  }

  if (url.pathname === '/api/regras' && metodo === 'POST') {
    // Credor logado nao edita as proprias regras comerciais: quem define
    // desconto e comissao e a assessoria, no contrato.
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria altera regras', { status: 403 });
    }
    const corpo = (await requisicao.json()) as Record<string, unknown>;
    const regras = regrasDoCorpo(corpo);
    const v = validarRegras(regras);
    if (!v.ok) return new Response(v.motivo, { status: 400 });

    const credor = await lerCredor(db, credorId);
    if (!credor) return new Response('Credor nao encontrado', { status: 404 });

    await salvarRegras(db, credorId, regras);
    return Response.json({ credorId, regras });
  }

  if (url.pathname === '/api/importar' && metodo === 'POST') {
    // Importar mexe na carteira: e trabalho da assessoria, nao do credor.
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria importa carteira', { status: 403 });
    }
    const csv = await requisicao.text();
    if (csv.trim().length === 0) return new Response('Planilha vazia', { status: 400 });

    const resultado = await importarParaCarteira(db, credorId, csv);
    await registrarAuditoria(db, {
      acao: 'carteira-importada',
      telefone: null,
      detalhe: `credor ${credorId}: ${resultado.criados} novos, ${resultado.atualizados} ja existentes, ${resultado.descartados} descartados`,
    });
    return Response.json(resultado);
  }

  if (url.pathname === '/api/devedores' && metodo === 'GET') {
    return Response.json({ devedores: await listarDevedores(db, credorId) });
  }

  if (url.pathname === '/api/dividas' && metodo === 'GET') {
    return Response.json({ dividas: await listarDividas(db, credorId) });
  }

  if (url.pathname === '/api/telefones' && metodo === 'GET') {
    const devedorId = url.searchParams.get('devedor') ?? '';
    if (devedorId.length === 0) {
      return new Response('Informe o devedor', { status: 400 });
    }
    // telefonesDoDevedor filtra por credor_id tambem: pedir o telefone de
    // um devedor de outra carteira devolve lista vazia, nao os dados dele.
    return Response.json({ telefones: await telefonesDoDevedor(db, credorId, devedorId) });
  }

  if (url.pathname === '/api/conversas' && metodo === 'GET') {
    return Response.json({ conversas: await conversasDoCredor(db, credorId) });
  }

  return new Response('Nao encontrado', { status: 404 });
}
