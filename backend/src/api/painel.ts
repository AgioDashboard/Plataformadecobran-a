import type { Sessao } from './sessao.ts';
import { escopoDaConsulta } from './sessao.ts';
import type { RegrasCredor } from '../dominio/faixas.ts';
import { validarRegras } from '../dominio/faixas.ts';
import { gerarOfertas } from '../dominio/ofertas.ts';
import {
  definirPausaGlobal,
  definirSilencio,
  lerPausaGlobal,
  registrarAuditoria,
} from '../dominio/travas.ts';
import { importarParaCarteira } from '../cobmais/importar.ts';
import {
  conversaDe,
  conversasDoCredor,
  entradasRecentes,
  gravarMensagem,
  ultimaEntradaComTexto,
  ultimaEntradaDe,
} from '../db/repositorio.ts';
import {
  avancarNegociacao,
  contextoDeCobranca,
  credorDoTelefone,
  fecharNegociacao,
  listarDevedores,
  listarDividas,
} from '../db/cadastro.ts';
import { formatarData, formatarMoeda } from '../dominio/formatacao.ts';
import {
  avaliarContraproposta,
  blocoOfertasLiberadas,
  montarContextoNegociacao,
  ofertaDoGrau,
} from '../dominio/negociacao.ts';
import type { ValoresPermitidos } from '../dominio/negociacao.ts';
import { blocoFatosLiberados, FATOS_PADRAO } from '../dominio/fatos.ts';
import { listarCredores, lerCredor, salvarRegras } from '../db/credores.ts';
import { telefonesDoDevedor } from '../db/telefones.ts';
import type { Config } from '../config.ts';
import { estaSilenciado } from '../dominio/travas.ts';
import { avaliarPortao } from '../dominio/portao.ts';
import { dentroDaJanela } from '../dominio/janela.ts';
import { ehRemetenteDeTeste } from '../dominio/ddi.ts';
import { formaDeEnvio, podeEnviarPara } from '../destinatarios.ts';
import {
  autorizadoNoIndice,
  montarDestinatarios,
  resolverTelefone,
} from '../dominio/teste-envio.ts';
import { consultarNumeroConfigurado } from '../whatsapp/diagnostico.ts';
import { enviarTexto } from '../whatsapp/enviar.ts';
import {
  decidir,
  percentuaisCitadosPct,
  validarResposta,
  valoresCitadosCentavos,
} from '../ia/responder.ts';

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
  config: Config,
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

  // --- Teste manual de envio --------------------------------------------
  //
  // Existe para uma coisa so: provar, com um numero da allowlist, que o
  // caminho inteiro funciona antes de qualquer disparo em escala. Nao abre
  // excecao nenhuma — usa o mesmo portao, a mesma allowlist e o mesmo
  // validador de resposta do fluxo automatico.

  if (url.pathname === '/api/diagnostico-whatsapp' && metodo === 'GET') {
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria roda o diagnostico', { status: 403 });
    }

    const agora = new Date();
    const desde = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const [numero, recentes, pausado] = await Promise.all([
      consultarNumeroConfigurado(config),
      entradasRecentes(db, desde),
      lerPausaGlobal(db),
    ]);

    const destinatarios = montarDestinatarios(config.destinatariosTeste, recentes, agora);
    const comSilencio = await Promise.all(
      destinatarios.map(async (d) => ({
        ...d,
        silenciado: await estaSilenciado(
          db,
          resolverTelefone(config.destinatariosTeste[d.indice], recentes),
        ),
      })),
    );

    return Response.json({
      ambiente: config.ambiente,
      pausado,
      numero,
      // A tela nao precisa saber a regra de DDI; precisa saber se pode.
      remetenteDeTeste: ehRemetenteDeTeste(numero.numeroExibicao),
      destinatarios: comSilencio,
    });
  }

  if (url.pathname === '/api/teste-mensagem' && metodo === 'POST') {
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria testa envio', { status: 403 });
    }

    const corpo = (await requisicao.json()) as { indice?: unknown };
    const autorizado = autorizadoNoIndice(config.destinatariosTeste, corpo.indice);
    if (autorizado === null) {
      return new Response('Destinatario fora da allowlist de teste', { status: 400 });
    }

    const agora = new Date();
    const desde = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recentes = await entradasRecentes(db, desde);
    const telefone = resolverTelefone(autorizado, recentes);

    // Sem mensagem de entrada nao ha o que a IA responder. Dizer isso e
    // melhor que inventar uma mensagem de cliente que nunca existiu.
    // O historico completo so existe quando o telefone esta em alguma
    // carteira; a ultima entrada existe de qualquer jeito, e e dela que a
    // IA precisa para ter o que responder.
    const credorId = await credorDoTelefone(db, telefone);
    const [historico, ultima, contexto, credor] = await Promise.all([
      credorId ? conversaDe(db, credorId, telefone) : Promise.resolve([]),
      ultimaEntradaComTexto(db, telefone),
      credorId ? contextoDeCobranca(db, credorId, telefone) : Promise.resolve(null),
      credorId ? lerCredor(db, credorId) : Promise.resolve(null),
    ]);
    if (!ultima) {
      return Response.json({
        ok: false,
        motivo: 'este numero ainda nao mandou nenhuma mensagem para nos',
        texto: '',
      });
    }

    const valorFormatado = contexto ? formatarMoeda(contexto.valorCentavos) : 'nao informado';

    // So preview: o motor calcula a oferta para MOSTRAR o que a IA diria,
    // mas nada aqui grava negociacao nenhuma — nada foi enviado ao cliente.
    const negociacao =
      contexto && credor
        ? montarContextoNegociacao(
            contexto.valorCentavos,
            credor.regras.descontoTetoPct,
            contexto.estagioNegociacao,
            credor.regras,
          )
        : null;

    const decisao = await decidir(config, {
      nomeCliente: contexto?.nome ?? 'Cliente',
      valorFormatado,
      vencimentoFormatado: contexto ? formatarData(contexto.vencimento) : 'nao informado',
      historico,
      mensagemAtual: ultima.texto,
      ofertaTexto: negociacao?.texto ?? null,
      ofertasLiberadasJson: negociacao ? blocoOfertasLiberadas(negociacao) : null,
      fatosLiberadosJson: blocoFatosLiberados(FATOS_PADRAO),
      perguntasPendentesJson: null,
      motivoRejeicaoAnterior: null,
    });

    const avaliacao =
      contexto && decisao.proposta_do_cliente_centavos !== null
        ? avaliarContraproposta(
            decisao.proposta_do_cliente_centavos,
            contexto.valorCentavos,
            contexto.estagioNegociacao,
            credor?.regras.descontoTetoPct ?? 0,
          )
        : null;

    const permitido: ValoresPermitidos | null = contexto
      ? {
          centavos: [
            contexto.valorCentavos,
            ...(negociacao?.permitido.centavos ?? []),
            // Todo numero que o CLIENTE mesmo escreveu pode ser ecoado de
            // volta — ver o mesmo comentario em webhook.ts.
            ...valoresCitadosCentavos(ultima.texto),
          ],
          percentuaisPct: [
            ...(negociacao?.permitido.percentuaisPct ?? []),
            ...percentuaisCitadosPct(ultima.texto),
          ],
          descontosPorDegrau: negociacao?.permitido.descontosPorDegrau,
        }
      : null;

    // A sugestao passa pelo mesmo validador do fluxo automatico. Uma
    // sugestao reprovada aparece na tela COM o motivo, em vez de sumir: e
    // justamente esse motivo que o teste existe para revelar.
    const validacao = validarResposta(decisao, permitido);
    return Response.json({
      ok: validacao.ok,
      motivo: validacao.ok ? '' : validacao.motivo,
      texto: decisao.resposta,
      intencao: decisao.intencao,
      encaminharHumano: decisao.motivo_escalar !== 'nenhum',
      motivoEscalar: decisao.motivo_escalar,
    });
  }

  if (url.pathname === '/api/teste-envio' && metodo === 'POST') {
    if (sessao.escopo.tipo !== 'operador') {
      return new Response('Somente a assessoria testa envio', { status: 403 });
    }

    const corpo = (await requisicao.json()) as { indice?: unknown; texto?: unknown };
    const autorizado = autorizadoNoIndice(config.destinatariosTeste, corpo.indice);
    if (autorizado === null) {
      return new Response('Destinatario fora da allowlist de teste', { status: 400 });
    }
    if (typeof corpo.texto !== 'string' || corpo.texto.trim().length === 0) {
      return new Response('Escreva o texto da mensagem', { status: 400 });
    }
    const texto = corpo.texto.trim();

    const agora = new Date();
    const desde = new Date(agora.getTime() - 24 * 60 * 60 * 1000).toISOString();
    const recentes = await entradasRecentes(db, desde);
    const telefone = resolverTelefone(autorizado, recentes);

    // Texto digitado a mao corre os mesmos riscos do texto da IA: citar
    // desconto, valor errado ou termo de coercao. Passa pelo mesmo validador,
    // contra os mesmos numeros que o motor de negociacao autoriza para esta
    // divida agora — nao ha proposta extraida do cliente aqui (nao passou
    // pela IA), so o operador so consegue citar valores ja calculados.
    const credorIdPreEnvio = await credorDoTelefone(db, telefone);
    const contextoPreEnvio = credorIdPreEnvio
      ? await contextoDeCobranca(db, credorIdPreEnvio, telefone)
      : null;
    const credorPreEnvio = credorIdPreEnvio ? await lerCredor(db, credorIdPreEnvio) : null;
    const negociacaoPreEnvio =
      contextoPreEnvio && credorPreEnvio
        ? montarContextoNegociacao(
            contextoPreEnvio.valorCentavos,
            credorPreEnvio.regras.descontoTetoPct,
            contextoPreEnvio.estagioNegociacao,
            credorPreEnvio.regras,
          )
        : null;
    const permitidoPreEnvio: ValoresPermitidos | null = contextoPreEnvio
      ? {
          centavos: [contextoPreEnvio.valorCentavos, ...(negociacaoPreEnvio?.permitido.centavos ?? [])],
          percentuaisPct: negociacaoPreEnvio?.permitido.percentuaisPct ?? [],
          descontosPorDegrau: negociacaoPreEnvio?.permitido.descontosPorDegrau,
        }
      : null;

    const validacao = validarResposta(
      {
        intencao: 'outro',
        resposta: texto,
        motivo_escalar: 'nenhum',
        silenciar: false,
        proposta_do_cliente_centavos: null,
        cliente_aceitou: false,
        // Texto digitado a mao pelo operador, nao saida da IA — nao ha
        // campo estruturado para conferir. grau_apresentado null pula essa
        // checagem; qual degrau avancou e apurado abaixo, depois do envio,
        // pelos percentuais que o proprio texto citou.
        grau_apresentado: null,
        data_renda_declarada: null,
        capacidade_declarada_centavos: null,
        usar_espera_estrategica: false,
        resposta_apos_espera: null,
        grau_apresentado_apos_espera: null,
        valor_fechado_centavos: null,
        parcelas_fechadas: null,
        perguntas_novas: [],
        perguntas_resolvidas: [],
      },
      permitidoPreEnvio,
    );
    if (!validacao.ok) {
      return Response.json({ ok: false, motivo: validacao.motivo, idExterno: null });
    }

    // Trava do remetente: o painel so envia se o numero configurado for o de
    // teste (+1). Os numeros brasileiros da conta atendem clientes reais em
    // outra plataforma, e disparar por um deles sem querer e o pior defeito
    // possivel aqui. Nao conseguir conferir tambem bloqueia — o modo de
    // falha e nao enviar.
    const numero = await consultarNumeroConfigurado(config);
    if (!ehRemetenteDeTeste(numero.numeroExibicao)) {
      const detalhe = numero.ok
        ? 'o numero configurado nao e o de teste'
        : `nao foi possivel conferir o numero configurado (${numero.erro})`;
      await registrarAuditoria(db, {
        acao: 'teste-envio-bloqueado',
        telefone: null,
        detalhe,
      });
      return Response.json({ ok: false, motivo: detalhe, idExterno: null });
    }

    const [pausa, silenciado, ultimaEntrada] = await Promise.all([
      lerPausaGlobal(db),
      estaSilenciado(db, telefone),
      ultimaEntradaDe(db, telefone),
    ]);

    const portao = avaliarPortao({
      pausaGlobal: pausa,
      silenciado,
      naAllowlist: podeEnviarPara(telefone, config.destinatariosTeste),
      tipo: 'livre',
      dentroDaJanela: dentroDaJanela(ultimaEntrada, agora),
    });
    if (!portao.permitido) {
      await registrarAuditoria(db, {
        acao: 'teste-envio-bloqueado',
        telefone,
        detalhe: portao.motivo,
      });
      return Response.json({ ok: false, motivo: portao.motivo, idExterno: null });
    }

    const envio = await enviarTexto(config, formaDeEnvio(telefone), texto);
    const credorId = credorIdPreEnvio;
    await gravarMensagem(db, {
      telefone,
      credorId,
      direcao: 'saida',
      texto,
      tipo: 'livre',
      // Quem apertou o botao foi uma pessoa, ainda que a IA tenha
      // rascunhado. O historico precisa dizer isso.
      origem: 'humano',
      idExterno: envio.idExterno,
    });

    // Mesma regra do fluxo automatico: so avanca o degrau se a mensagem de
    // fato saiu, e so pelo que o texto validado citou de verdade. Sem campo
    // estruturado aqui (texto digitado a mao), o degrau e apurado pelos
    // percentuais que o proprio operador citou — usando o mesmo extrator
    // robusto ja testado, nunca uma regex montada na hora.
    if (envio.ok && contextoPreEnvio && negociacaoPreEnvio && credorId) {
      const percentuaisDoTexto = percentuaisCitadosPct(texto);
      const descontos = negociacaoPreEnvio.permitido.descontosPorDegrau ?? {};
      const grauCitado = Object.entries(descontos).find(
        ([, info]) => percentuaisDoTexto.includes(info.avistaPct) || percentuaisDoTexto.includes(info.parceladoPct),
      );
      const revelado = grauCitado ? Number(grauCitado[0]) : null;
      if (revelado !== null && revelado !== contextoPreEnvio.estagioNegociacao) {
        const oferta = ofertaDoGrau(negociacaoPreEnvio, revelado);
        if (oferta) {
          await avancarNegociacao(db, credorId, contextoPreEnvio.dividaId, revelado, oferta);
        }
      }
    }
    await registrarAuditoria(db, {
      acao: envio.ok ? 'teste-envio-realizado' : 'teste-envio-falhou',
      telefone,
      detalhe: envio.erro ?? 'envio manual pelo painel',
    });

    return Response.json({
      ok: envio.ok,
      motivo: envio.erro ?? '',
      idExterno: envio.idExterno,
    });
  }

  // --- Daqui para baixo, tudo exige carteira resolvida -------------------

  const escopo = escopoDaConsulta(sessao, url);
  if (!escopo.ok) return new Response(escopo.motivo, { status: 400 });
  const { credorId } = escopo;

  if (url.pathname === '/api/regras' && metodo === 'GET') {
    const credor = await lerCredor(db, credorId);
    if (!credor) return new Response('Credor nao encontrado', { status: 404 });

    // Valor de exemplo para a previa comecar num caso real da carteira, em
    // vez de num numero inventado que nao se parece com divida nenhuma.
    const media = await db
      .prepare(
        `SELECT CAST(AVG(valor_centavos) AS INTEGER) AS media FROM dividas
         WHERE credor_id = ? AND situacao = 'aberta'`,
      )
      .bind(credorId)
      .first<{ media: number | null }>();

    // Carteira vazia cai em R$ 1.000,00 — redondo, facil de conferir de cabeca.
    return Response.json({ ...credor, exemploCentavos: media?.media ?? 100000 });
  }

  if (url.pathname === '/api/previa-ofertas' && metodo === 'POST') {
    // Calcula e NAO grava. Existe para que a previa do painel use exatamente
    // a mesma funcao que o portal — reimplementar o calculo no navegador
    // criaria duas fontes de verdade, e a previa mostraria uma coisa
    // enquanto o portal faria outra.
    const corpo = (await requisicao.json()) as Record<string, unknown>;
    const saldo = Number(corpo.saldoCentavos);
    if (!Number.isFinite(saldo) || saldo <= 0) {
      return new Response('Informe um valor de exemplo maior que zero', { status: 400 });
    }

    const regras = regrasDoCorpo(corpo);

    // 200 com ok:false, e nao 400: enquanto a pessoa digita, a configuracao
    // passa por estados invalidos o tempo todo, e tratar isso como erro de
    // requisicao encheria o console de falhas que nao sao falhas.
    const v = validarRegras(regras);
    if (!v.ok) return Response.json({ ok: false, motivo: v.motivo, ofertas: [] });

    return Response.json({ ok: true, motivo: '', ofertas: gerarOfertas(saldo, regras) });
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
