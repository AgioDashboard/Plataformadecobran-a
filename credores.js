// O credor escolhido vive na URL, nao em memoria: recarregar a pagina ou
// mandar o link para alguem preserva a carteira que estava aberta — e deixa
// obvio, na barra de endereco, qual carteira esta na tela.
export function credorSelecionado() {
  return new URLSearchParams(location.search).get('credor') ?? '';
}

export function definirCredorSelecionado(id) {
  const url = new URL(location.href);
  if (id) url.searchParams.set('credor', id);
  else url.searchParams.delete('credor');
  location.assign(url.toString());
}
