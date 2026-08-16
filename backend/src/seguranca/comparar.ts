// Comparacao em tempo constante, usada para assinatura de webhook e para
// o token do painel.
//
// crypto.subtle.timingSafeEqual e uma extensao do runtime do Workers e NAO
// existe no WebCrypto do Node — usar so ela deixaria os testes sem rodar.
// Aqui a primitiva da plataforma e preferida quando existe, com um laco
// portatil (tambem em tempo constante) como reserva.

interface SubtleComTimingSafe {
  timingSafeEqual?: (a: ArrayBufferView, b: ArrayBufferView) => boolean;
}

export function iguaisEmTempoConstante(a: Uint8Array, b: Uint8Array): boolean {
  // Tamanhos diferentes: a primitiva lanca, entao a checagem vem antes.
  // O tamanho de um hash nao e segredo, entao sair cedo aqui nao vaza nada.
  if (a.length !== b.length) return false;

  const subtle = crypto.subtle as unknown as SubtleComTimingSafe;
  if (typeof subtle.timingSafeEqual === 'function') {
    return subtle.timingSafeEqual(a, b);
  }

  let diferenca = 0;
  for (let i = 0; i < a.length; i += 1) {
    diferenca |= a[i] ^ b[i];
  }
  return diferenca === 0;
}

export function textosIguaisEmTempoConstante(a: string, b: string): boolean {
  const codificador = new TextEncoder();
  return iguaisEmTempoConstante(codificador.encode(a), codificador.encode(b));
}
