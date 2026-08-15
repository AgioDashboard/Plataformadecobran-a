# Painel de Cobrança — Fase 1 (design)

Data: 2026-08-15
Status: aprovado para planejamento

## Objetivo

Construir a estrutura visual do painel de cobrança: uma página estática que
mostra clientes inadimplentes, o histórico de mensagens e um botão de pausa de
emergência. Esta fase usa exclusivamente dados fictícios e não faz nenhuma
chamada de rede.

Fora de escopo nesta fase: consulta ao Cobmais, disparo pela Voll, backend,
autenticação, qualquer credencial real.

## Restrições de segurança

Valem para todo o projeto, não só para esta fase:

1. Nenhuma chave, senha ou token em qualquer arquivo do repositório.
2. `.gitignore` contendo `.env` é o primeiro commit, anterior a todos os
   outros arquivos.
3. Integração com API externa (Fase 2) lê credenciais de variável de
   ambiente, nunca de valor fixo.
4. O GitHub Pages serve o conteúdo do repositório publicamente mesmo quando o
   repositório é privado. Nada sensível pode estar em arquivo que vá para o
   Pages — o que, nesta fase, significa nenhum dado real de cliente e nenhum
   telefone verdadeiro.

Consequência prática para a Fase 1: como o painel não faz nenhuma requisição,
não existe credencial a proteger no código. O risco real aqui é dado pessoal
em arquivo público, e é por isso que o mock é inteiramente fictício.

## Arquitetura

Site estático, sem etapa de build e sem nenhuma dependência instalada. Não há
CDN: o painel funciona offline.

A lógica pura fica em módulos ES separados da renderização, para poder ser
testada. Módulos ES não carregam por `file://` (bloqueio de CORS do
navegador), então o painel é servido por `node servidor-local.js` — um
servidor estático de poucas linhas em Node puro, sem dependências. É também
o modo como o GitHub Pages servirá o painel.

| Arquivo | Responsabilidade |
| --- | --- |
| `index.html` | Estrutura semântica: cabeçalho com a pausa, cartões de totais, tabela de clientes, painel de histórico |
| `estilos.css` | Tema claro em tokens CSS, layout responsivo |
| `dados-mock.js` | Único lugar com dados: clientes e histórico fictícios |
| `app.js` | Renderização, cálculos derivados, estado da pausa |
| `.env` | Local, ignorado pelo git; nomes de variáveis da Fase 2 com valor vazio |
| `.env.exemplo` | Versionado, sem valores; documenta quais variáveis existirão |
| `README.md` | Fases do projeto e aviso sobre o GitHub Pages |

Fronteira desenhada para a Fase 2: `app.js` consome os dados por uma função
única, e trocar `dados-mock.js` por um módulo que faz `fetch` no backend não
exige mudança na renderização.

## Modelo de dados

Cliente:

```js
{
  id: 'c-001',
  nome: 'Nome Fictício',
  telefone: '5511900000001',   // fictício, nunca real
  valorCentavos: 128790,        // inteiro, evita erro de ponto flutuante
  vencimento: '2026-07-02',     // ISO, data local
  status: 'aguardando'          // 'aguardando' | 'mensagem-enviada' | 'sem-resposta'
}
```

Entrada de histórico:

```js
{
  id: 'h-001',
  clienteId: 'c-001',
  quando: '2026-08-14T13:20:00-03:00',
  canal: 'whatsapp',
  resultado: 'enviada',          // 'enviada' | 'falhou'
  trecho: 'Primeiras palavras da mensagem…'
}
```

Valores monetários são inteiros em centavos e só viram texto na exibição, via
`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`.

## Campos derivados

- **Dias em atraso:** diferença entre hoje e o vencimento, ambos normalizados
  à meia-noite no fuso local antes da subtração, para não errar por horário.
  Vencimento futuro exibe "a vencer" em vez de número negativo.
- **Telefone mascarado:** exibido como `(11) 9****-0001`. O valor completo
  nunca aparece na tela.
- **Totais no topo:** soma inadimplente em reais, quantidade de clientes e
  mensagens enviadas hoje, todos calculados a partir das mesmas listas.

## Pausa de emergência

Botão fixo no cabeçalho, alto contraste, sempre visível, com `aria-pressed`
refletindo o estado.

- Estado em `localStorage` sob a chave `cobranca:pausa`, no formato
  `{ pausado: boolean, desde: string ISO }`, lido no carregamento da página.
- Pausado: faixa vermelha no topo com `aria-live="assertive"`, tabela de
  clientes esmaecida, botão passa a "Retomar disparos".
- Cada troca de estado grava um evento em `localStorage` sob
  `cobranca:eventos-pausa`. Esses eventos são mesclados na exibição do
  histórico como linhas de sistema, distintas das mensagens.
- A semântica já é a definitiva: na Fase 2 o backend consulta esse mesmo
  estado antes de disparar, sem reescrever o botão.

## Tratamento de erro

- `localStorage` indisponível ou com conteúdo corrompido: o painel assume
  "ativo" e segue funcionando, sem exceção não tratada.
- Lista de clientes vazia: estado vazio explícito, não uma tabela em branco.
- Histórico vazio: mensagem indicando que nada foi enviado ainda.

## Acessibilidade

Tabela com `<caption>` e `<th scope="col">`; faixa de pausa com região
`aria-live`; contraste do tema claro conforme WCAG AA; navegação por teclado
funcional no botão de pausa.

## Verificação

A lógica pura (formatação, dias em atraso, máscara, totais, estado da pausa)
é coberta por testes automatizados com o executor embutido do Node
(`node --test`), sem nenhuma dependência instalada. A renderização é
verificada manualmente no navegador:

1. Tabela renderiza todos os clientes do mock com valor formatado em BRL.
2. Dias em atraso batem com as datas do mock; vencimento futuro mostra
   "a vencer".
3. Telefones aparecem mascarados.
4. Cartões de totais conferem com a soma do mock.
5. Pausar, recarregar a página, e confirmar que o estado pausado persiste.
6. Retomar e confirmar que os dois eventos aparecem no histórico.
7. Com a lista de clientes vazia, o estado vazio aparece.
8. `git grep` não encontra nenhuma credencial; `git status` não lista `.env`.

## Fase 2 (registrado, não construído)

Consulta ao Cobmais e disparo pela Voll rodando em backend separado, com
credenciais em variável de ambiente do provedor. A escolha entre Vercel e
Cloudflare Workers fica para o início daquela fase.
