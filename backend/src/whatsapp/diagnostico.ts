import type { Config } from '../config.ts';

// Le, na propria Meta, qual numero esta por tras do WHATSAPP_PHONE_NUMBER_ID
// configurado. Existe para uma pergunta que nao da para responder olhando o
// codigo: o segredo e um ID opaco, e so a Graph API sabe a que linha ele
// corresponde. Nada aqui envia mensagem.

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface NumeroConfigurado {
  ok: boolean;
  numeroExibicao: string | null;
  nomeVerificado: string | null;
  qualidade: string | null;
  erro: string | null;
}

export async function consultarNumeroConfigurado(
  config: Config,
): Promise<NumeroConfigurado> {
  const campos = 'display_phone_number,verified_name,quality_rating';

  let resposta: Response;
  try {
    resposta = await fetch(`${GRAPH}/${config.whatsapp.numeroId}?fields=${campos}`, {
      headers: { authorization: `Bearer ${config.whatsapp.token}` },
    });
  } catch (erro) {
    // Rede fora do ar nao pode virar 500 no painel: a tela precisa dizer
    // "nao consegui conferir", que e diferente de "conferi e esta errado".
    return vazio(String(erro).slice(0, 200));
  }

  const dados = (await resposta.json().catch(() => ({}))) as {
    display_phone_number?: string;
    verified_name?: string;
    quality_rating?: string;
    error?: { message?: string };
  };

  if (!resposta.ok) {
    // Mesmo cuidado de enviar.ts: nunca ecoar o corpo inteiro, porque erro
    // da Graph API as vezes devolve trecho da requisicao, token incluso.
    return vazio(dados.error?.message ?? `HTTP ${resposta.status}`);
  }

  return {
    ok: true,
    numeroExibicao: dados.display_phone_number ?? null,
    nomeVerificado: dados.verified_name ?? null,
    qualidade: dados.quality_rating ?? null,
    erro: null,
  };
}

function vazio(erro: string): NumeroConfigurado {
  return { ok: false, numeroExibicao: null, nomeVerificado: null, qualidade: null, erro };
}
