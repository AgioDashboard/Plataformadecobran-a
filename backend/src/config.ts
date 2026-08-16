// Le e valida as variaveis de ambiente. Nenhum valor padrao para segredo:
// se faltar, o Worker falha alto em vez de rodar meio configurado.

export interface Ambiente {
  DB: D1Database;
  AMBIENTE: string;
  WHATSAPP_TOKEN: string;
  WHATSAPP_PHONE_NUMBER_ID: string;
  WHATSAPP_BUSINESS_ACCOUNT_ID: string;
  WHATSAPP_VERIFY_TOKEN: string;
  WHATSAPP_APP_SECRET: string;
  ANTHROPIC_API_KEY: string;
  PAINEL_TOKEN: string;
  DESTINATARIOS_TESTE: string;
}

export interface Config {
  ambiente: string;
  whatsapp: {
    token: string;
    numeroId: string;
    contaId: string;
    verifyToken: string;
    appSecret: string;
  };
  anthropicApiKey: string;
  painelToken: string;
  destinatariosTeste: string[];
}

const OBRIGATORIAS = [
  'WHATSAPP_TOKEN',
  'WHATSAPP_PHONE_NUMBER_ID',
  'WHATSAPP_BUSINESS_ACCOUNT_ID',
  'WHATSAPP_VERIFY_TOKEN',
  'WHATSAPP_APP_SECRET',
  'ANTHROPIC_API_KEY',
  'PAINEL_TOKEN',
] as const;

export function lerConfig(env: Partial<Ambiente>): Config {
  const faltando = OBRIGATORIAS.filter((nome) => !env[nome]);
  if (faltando.length > 0) {
    throw new Error(`Variaveis de ambiente ausentes: ${faltando.join(', ')}`);
  }

  return {
    ambiente: env.AMBIENTE ?? 'teste',
    whatsapp: {
      token: env.WHATSAPP_TOKEN!,
      numeroId: env.WHATSAPP_PHONE_NUMBER_ID!,
      contaId: env.WHATSAPP_BUSINESS_ACCOUNT_ID!,
      verifyToken: env.WHATSAPP_VERIFY_TOKEN!,
      appSecret: env.WHATSAPP_APP_SECRET!,
    },
    anthropicApiKey: env.ANTHROPIC_API_KEY!,
    painelToken: env.PAINEL_TOKEN!,
    destinatariosTeste: (env.DESTINATARIOS_TESTE ?? '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n.length > 0),
  };
}
