// Verificacao do X-Hub-Signature-256 que a Meta envia em cada POST.
// Sem isto, qualquer pessoa que descubra a URL fabrica mensagens de cliente,
// aciona a IA e polui o historico com conversas que nunca existiram.
//
// Usa WebCrypto (disponivel em Workers e no Node) e comparacao em tempo
// constante, para nao vazar informacao pelo tempo de resposta.

function hexParaBytes(hex: string): Uint8Array | null {
  if (hex.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(hex)) return null;
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i += 1) {
    bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  // timingSafeEqual lanca se os tamanhos diferem, entao a checagem vem antes.
  if (a.length !== b.length) return false;
  return crypto.subtle.timingSafeEqual(a, b);
}

export async function verificarAssinatura(
  corpo: string,
  cabecalho: string | null,
  segredo: string,
): Promise<boolean> {
  if (!cabecalho || !cabecalho.startsWith('sha256=')) return false;

  const recebida = hexParaBytes(cabecalho.slice('sha256='.length));
  if (!recebida) return false;

  const chave = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(segredo),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const esperada = new Uint8Array(
    await crypto.subtle.sign('HMAC', chave, new TextEncoder().encode(corpo)),
  );

  return iguaisEmTempoConstante(recebida, esperada);
}
