# Plataforma de Cobrança

Painel de acompanhamento de cobrança. Em construção, por fases.

## Estado atual: Fase 1

Painel estático com **dados fictícios**. Nenhuma integração ativa, nenhuma
chamada de rede, nenhuma credencial envolvida.

- Lista de clientes inadimplentes (nome, valor, vencimento, dias em atraso,
  situação, telefone mascarado)
- Busca por nome (ignora acento), filtro por situação e por faixa de atraso,
  e ordenação por coluna
- Detalhe do cliente em gaveta lateral, com o histórico daquele cliente
- Histórico geral de mensagens, com os eventos de sistema intercalados
- Botão de pausa de emergência, com estado persistido no navegador
- Não perturbe por cliente: trava independente da pausa global

**Atenção para a Fase 2:** a pausa global e o não perturbe hoje vivem no
`localStorage`, ou seja, valem só para o navegador em que foram acionados.
Um backend que dispara sozinho não consegue lê-los. Antes de qualquer
disparo real, esse estado precisa migrar para o servidor.

## Como rodar

```bash
node servidor-local.js
```

Depois abra `http://localhost:4173`. Não abra o `index.html` direto pelo
sistema de arquivos: o navegador bloqueia módulos ES em `file://`.

Testes:

```bash
node --test "testes/*.test.js"
```

Não há dependências para instalar.

## Segurança

**O GitHub Pages publica o conteúdo do repositório, mesmo que o repositório
seja privado.** Portanto:

- Nenhuma chave, senha ou token em qualquer arquivo versionado.
- `.env` está no `.gitignore` desde o primeiro commit. `.env.exemplo` é
  versionado e contém apenas nomes de variáveis, sem valores.
- Os dados desta fase são fictícios. Nenhum dado real de cliente e nenhum
  telefone verdadeiro entram em arquivo que vá para o Pages.

## Fase 2 (planejada)

Consulta ao Cobmais e disparo de WhatsApp pela Voll, em backend separado, com
as credenciais em variáveis de ambiente do provedor — nunca no frontend. A
escolha entre Vercel e Cloudflare Workers será feita no início da fase.
