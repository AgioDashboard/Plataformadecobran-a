# Destinatários de teste autorizados

**Este arquivo é versionado em repositório público. Não coloque número real
aqui.** Registre apenas o apelido e a data; o número em si vive só na
variável de ambiente `DESTINATARIOS_TESTE` do Cloudflare.

Para adicionar um número:

1. Verifique o número na Meta, em developers.facebook.com → seu app →
   WhatsApp → Introdução → "Para" → Gerenciar lista de números. A Meta envia
   um código de confirmação para o aparelho; sem essa verificação, o número
   de teste não entrega nada.
2. Acrescente o número à variável, no Cloudflare:

   ```bash
   npx wrangler secret put DESTINATARIOS_TESTE
   ```

   Cole a **lista inteira** de uma vez, separada por vírgula, no formato
   `5511900000001,5511900000002`. O comando substitui o valor anterior — se
   você colar só o número novo, os antigos param de receber.
3. Registre aqui embaixo o apelido e a data.

| Apelido | Autorizado em | Observação |
| --- | --- | --- |
| _(nenhum ainda)_ | | |

## Por que existem duas listas

A Meta limita o número de teste a 5 destinatários verificados. Essa é a
trava _dela_, e ela desaparece no dia em que o número de produção entrar.

A `DESTINATARIOS_TESTE` é a trava _nossa_, no código, e continua valendo
depois disso. Quando a operação for para produção, esta lista deixa de ser
uma lista de teste e passa a ser o interruptor que decide quem o robô pode
contatar — mantenha-a por perto.
