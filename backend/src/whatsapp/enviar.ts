import type { Config } from '../config.ts';

const GRAPH = 'https://graph.facebook.com/v21.0';

export interface ResultadoEnvio {
  ok: boolean;
  idExterno: string | null;
  erro: string | null;
}

async function chamar(config: Config, corpo: unknown): Promise<ResultadoEnvio> {
  const resposta = await fetch(`${GRAPH}/${config.whatsapp.numeroId}/messages`, {
    method: 'POST',
    headers: {
      authorization: `Bearer ${config.whatsapp.token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify(corpo),
  });

  const dados = (await resposta.json()) as {
    messages?: Array<{ id: string }>;
    error?: { message: string };
  };

  if (!resposta.ok) {
    // Nunca ecoar o corpo inteiro: mensagens de erro da Graph API podem
    // devolver trechos da requisicao, incluindo o token.
    return {
      ok: false,
      idExterno: null,
      erro: dados.error?.message ?? `HTTP ${resposta.status}`,
    };
  }

  return { ok: true, idExterno: dados.messages?.[0]?.id ?? null, erro: null };
}

export function enviarTemplate(
  config: Config,
  para: string,
  nomeTemplate: string,
  parametros: string[],
): Promise<ResultadoEnvio> {
  return chamar(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'template',
    template: {
      name: nomeTemplate,
      language: { code: 'pt_BR' },
      components: [
        {
          type: 'body',
          parameters: parametros.map((texto) => ({ type: 'text', text: texto })),
        },
      ],
    },
  });
}

export function enviarTexto(
  config: Config,
  para: string,
  texto: string,
): Promise<ResultadoEnvio> {
  return chamar(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'text',
    text: { preview_url: false, body: texto },
  });
}

export interface BotaoRapido {
  id: string;
  titulo: string;
}

// Mensagem interativa com botoes de resposta rapida. A Graph API aceita no
// maximo 3 botoes, titulo de ate 20 caracteres — quem chama garante isso,
// aqui so se monta o payload.
export function enviarBotoes(
  config: Config,
  para: string,
  corpo: string,
  botoes: BotaoRapido[],
): Promise<ResultadoEnvio> {
  return chamar(config, {
    messaging_product: 'whatsapp',
    to: para,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: corpo },
      action: {
        buttons: botoes.map((b) => ({
          type: 'reply',
          reply: { id: b.id, title: b.titulo },
        })),
      },
    },
  });
}
