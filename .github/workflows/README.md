# Workflows

O workflow de publicação no GitHub Pages foi **removido em 2026-08-16**.

O painel deixou de ser um site público: passou a ser servido pelo próprio
Worker da Cloudflare, atrás de autenticação. Publicá-lo no Pages colocaria
de volta na internet aberta uma tela que mostra conversas reais de clientes.

Se um dia voltar a existir uma vitrine pública com dados fictícios, o
arquivo `pages.yml` está no histórico do git:

```bash
git log --diff-filter=D --name-only -- .github/workflows/pages.yml
```

Lembre-se de desligar também a fonte em **Settings → Pages**, senão o
GitHub continua servindo a última publicação bem-sucedida mesmo sem
workflow.
