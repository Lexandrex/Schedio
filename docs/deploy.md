# Deploy, rollback e monitoramento

O Schedio Drasis roda no **Azure**. Todo deploy é feito pelo pipeline do GitHub
Actions (`.github/workflows/ci.yml`): um push na `main` publica sozinho, sem SSH
nem FTP. O único passo feito à mão é criar a infraestrutura pela primeira vez.

## 1. Como está montado

```
Navegador ──HTTPS──> App Service (Linux B1, Node 22) ──TLS──> PostgreSQL gerenciado
                       serve a API e o client/dist         Flexible Server B1ms, 32 GB
                               │
                               └─ logs ──> Log Stream e Log Analytics

GitHub Actions ──OIDC──> Azure (identidade id-schedio-deploy, só no grupo do projeto)
Monitor externo ──a cada 5 min──> GET /api/health
```

| Ambiente | Onde roda | Banco | Configuração |
|---|---|---|---|
| Desenvolvimento | `npm run dev`, na máquina | PostgreSQL local | `.env` (fora do Git) |
| Testes | Job `testes` do CI | Contêiner `postgres:16`, descartável | `env:` do job |
| Produção | App Service | PostgreSQL gerenciado | Environment `producao` do GitHub |

Os recursos ficam no grupo `rg-schedio-prod`, região Brazil South. Custo estimado
pela tabela de preços do Azure de nov/2026, pago com o crédito do Azure for Students:

| Recurso | Preço | Por mês |
|---|---|---|
| App Service Linux B1 | US$ 0,02/h | US$ 14,60 |
| PostgreSQL B1ms | US$ 0,035/h | US$ 25,55 |
| Disco do banco, 32 GB | US$ 0,2185/GB | US$ 6,99 |
| **Total** | | **≈ US$ 47** |

Os US$ 100 duram cerca de dois meses. Confira o saldo em
[microsoftazuresponsorships.com](https://www.microsoftazuresponsorships.com/Balance):
quando o crédito acaba, o Azure desliga a assinatura e o site sai do ar.

## 2. Criar a infraestrutura (uma vez só)

Pré-requisitos: conta Azure for Students, [Azure CLI](https://learn.microsoft.com/cli/azure/install-azure-cli)
e [GitHub CLI](https://cli.github.com/) instalados.

```bash
az login
gh auth login
bash infra/provisionar.sh
```

O script cria o banco, o App Service, os logs e a identidade do pipeline, e grava
no Environment `producao` o que gera sozinho (`DATABASE_URL`, `JWT_SECRET` e os IDs
do Azure). Nenhuma senha aparece na tela. Se o seu login tiver mais de uma assinatura,
escolha a do crédito de estudante: `ASSINATURA="Azure for Students" bash infra/provisionar.sh`. Se o nome já estiver em uso no Azure,
rode com outros nomes: `APP=outro-nome BANCO_SERVIDOR=outro-nome-db bash infra/provisionar.sh`.

Falta só o que vem de serviços de fora. Cada `gh secret set` pede o valor sem
mostrá-lo:

```bash
gh secret set SMTP_USER --env producao
```
```bash
gh secret set SMTP_PASS --env producao
```
```bash
gh secret set CLOUDINARY_API_KEY --env producao
```
```bash
gh secret set CLOUDINARY_API_SECRET --env producao
```
```bash
gh variable set SMTP_HOST --env producao --body "smtp.seu-provedor.com"
```
```bash
gh variable set SMTP_PORT --env producao --body "587"
```
```bash
gh variable set SMTP_SECURE --env producao --body "false"
```
```bash
gh variable set SMTP_FROM --env producao --body "Schedio Drasis <endereco@seu-dominio>"
```
```bash
gh variable set CLOUDINARY_CLOUD_NAME --env producao --body "nome-da-sua-nuvem"
```
```bash
gh variable set CLOUDINARY_FOLDER --env producao --body "schedio-drasis-prod"
```

`CLOUDINARY_FOLDER` diferente do desenvolvimento mantém as imagens de produção
separadas das de teste.

### O que cada configuração faz

| Nome | Tipo | Para quê |
|---|---|---|
| `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` | Secret | Identificam a identidade do pipeline no login OIDC. Não são senhas |
| `DATABASE_URL` | Secret | Conexão com o banco, com `sslmode=require` |
| `JWT_SECRET` | Secret | Assina os tokens de login. Trocar derruba todas as sessões |
| `SMTP_USER`, `SMTP_PASS` | Secret | Envio dos códigos de verificação e recuperação |
| `CLOUDINARY_API_KEY`, `CLOUDINARY_API_SECRET` | Secret | Upload de imagens |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `SMTP_FROM` | Variable | Servidor e remetente de e-mail |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_FOLDER` | Variable | Conta e pasta de imagens |
| `AZURE_RESOURCE_GROUP`, `AZURE_APP_NAME`, `AZURE_DB_SERVER`, `APP_URL` | Variable | Onde publicar. Gravadas pelo script |

`NODE_ENV=production`, `CLIENT_ORIGIN` e `PASSWORD_RESET_URL` são definidas pelo
próprio job, a partir de `APP_URL`.

## 3. O que o job `deploy` faz

Roda depois de `frontend` e `testes`, e só na `main`. Se um passo falha, os
seguintes não rodam.

| # | Passo | Por quê |
|---|---|---|
| 1 | Checkout de `inputs.versao` ou do commit do push | É o que permite o rollback |
| 2 | Build do client | O servidor entrega o `client/dist` |
| 3 | `npm ci --omit=dev` | O pacote não leva ferramentas de teste |
| 4 | Grava `client/dist/versao.txt` | Prova depois qual commit está no ar |
| 5 | Login no Azure por OIDC | Token de curta duração, sem senha guardada no GitHub |
| 6 | Libera o IP do runner no firewall do banco | O banco só aceita serviços do Azure |
| 7 | `npm run db:migrate` | Antes do código novo: migrations aditivas não quebram a versão no ar |
| 8 | Fecha o firewall, com `always()` | O acesso não fica aberto mesmo se a migration falhar |
| 9 | Grava as configurações no App Service | O GitHub é a única fonte dos segredos |
| 10 | Empacota e publica o zip | O servidor roda exatamente o que foi testado, sem build lá |
| 11 | Smoke test | Veja abaixo |

O smoke test tenta por até 5 minutos e só passa com as três condições juntas:

- `/versao.txt` é o commit publicado, ou seja, a versão nova já assumiu;
- `/api/health` diz `status: ok`, `smtp: configured` e `storage: configured`;
- o login com um e-mail inexistente responde `401`, o que prova que a tabela `users` existe.

**Por que olhar `smtp` em vez de só o código HTTP:** em produção sem SMTP o servidor
**continua no ar** e `/api/health` responde `200` com `"smtp": "error"`. O erro lançado
em `createMailTransport` é capturado no fim do `server.js`. Cadastro e recuperação
de senha ficariam quebrados, e um `curl -f` não perceberia.

## 4. Rollback

**Caminho rápido, sem mexer no histórico:** em *Actions → CI/CD → Run workflow*,
branch `main`, preencha `versao` com o **SHA completo** ou uma tag de uma versão que
já esteve no ar. Os SHAs ficam na lista de execuções e em *Deployments*. O SHA curto
não funciona no `actions/checkout`.

**Caminho padrão:** `git revert <commit>` e push na `main`. O pipeline publica o estado
anterior. É o que deve ficar valendo: o próximo push na `main` passa por cima de um
rollback feito pelo botão.

Nos dois casos os testes rodam de novo, sobre a versão escolhida. É mais lento, mas
garante que o que volta ao ar passa nos testes. A contrapartida: uma versão cujos
testes falhem não consegue voltar por aqui.

**Migration não volta.** As migrations são só de ida, então o banco fica como está e
só o código volta. Por isso a regra é migration aditiva (`ADD COLUMN ... DEFAULT`): o
código antigo continua funcionando com a coluna nova. O `db:migrate` da versão antiga
não faz nada, porque tudo o que ela conhece já foi aplicado.

## 5. Onde ver um erro de produção

1. **Alerta:** o monitor externo avisa por e-mail quando `/api/health` para de responder.
2. **Ao vivo:** *Portal do Azure → App Service → Monitoring → Log stream*, ou
   `az webapp log tail --resource-group rg-schedio-prod --name <app>`. É ali que
   aparece o `console.error` do handler de erro do `server.js`.
3. **Histórico (30 dias):** *Log Analytics workspace `log-schedio-prod` → Logs*:

   ```kusto
   // Saída do servidor (console.log e console.error)
   AppServiceConsoleLogs
   | where TimeGenerated > ago(24h)
   | order by TimeGenerated desc
   ```

   ```kusto
   // Requisições que terminaram em erro 5xx
   AppServiceHTTPLogs
   | where ScStatus >= 500
   | project TimeGenerated, CsMethod, CsUriStem, ScStatus, TimeTaken
   | order by TimeGenerated desc
   ```

4. **Falha no deploy:** aba *Actions*. O smoke test imprime o estado a cada tentativa.

O que `/api/health` responde por componente:

| Situação | Resposta |
|---|---|
| Tudo certo | `200`, `status: ok` |
| Banco fora | `500`: a consulta `SELECT 1` falha. O monitor alerta |
| SMTP fora | `200`, `smtp: error`. O monitor por código HTTP **não** alerta, só os logs mostram |
| Cloudinary sem configuração | `200`, `storage: not-configured` |

## 6. Levar projetos do desenvolvimento para produção

```bash
npm run projetos:importar -- https://schedio-drasis.azurewebsites.net
```

O script lê o banco do `.env` (desenvolvimento), lista os projetos de uma conta,
pergunta quais copiar e faz login em produção com uma conta que já precisa existir
e estar verificada lá. A senha não aparece na tela.

Ele escreve em produção só pela API, como o editor faria. Assim valem as mesmas
validações, o dono é quem fez login e o banco do Azure continua fechado. Cada imagem
é baixada e enviada de novo, então produção ganha cópias próprias na pasta
`schedio-drasis-prod`: apagar um projeto de um lado não apaga o arquivo do outro.
Curtidas, salvos e denúncias não vêm junto. Um título que já existe no destino é
pulado, então rodar de novo não duplica.

## 7. Desligar tudo

Depois da apresentação, para parar de consumir crédito. Apaga também o banco e todos
os dados, sem volta:

```bash
az group delete --name rg-schedio-prod
```
