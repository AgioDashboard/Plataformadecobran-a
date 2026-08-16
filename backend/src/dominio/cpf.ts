// Validacao de CPF. Serve para duas coisas diferentes: recusar lixo na
// importacao, e conferir a identidade de quem abre o portal. Nos dois casos
// o modo de falha e negar.

export function normalizarCpf(bruto: string): string {
  return String(bruto ?? '').replace(/\D/g, '');
}

function digitoVerificador(base: string, pesoInicial: number): number {
  let soma = 0;
  for (let i = 0; i < base.length; i += 1) {
    soma += Number(base[i]) * (pesoInicial - i);
  }
  const resto = (soma * 10) % 11;
  return resto === 10 ? 0 : resto;
}

export function cpfValido(bruto: string): boolean {
  const d = normalizarCpf(bruto);
  if (d.length !== 11) return false;

  // Sequencias repetidas passam na conta dos verificadores mas nao sao CPF
  // de ninguem. 11111111111 e o caso classico.
  if (/^(\d)\1{10}$/.test(d)) return false;

  const primeiro = digitoVerificador(d.slice(0, 9), 10);
  if (primeiro !== Number(d[9])) return false;

  const segundo = digitoVerificador(d.slice(0, 10), 11);
  return segundo === Number(d[10]);
}

// A tela nunca estampa o CPF inteiro, do mesmo jeito que nunca estampa o
// telefone inteiro.
export function mascararCpf(bruto: string): string {
  const d = normalizarCpf(bruto);
  if (d.length !== 11) return 'sem CPF';
  return `***.***.${d.slice(6, 9)}-${d.slice(9)}`;
}
