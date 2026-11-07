#!/usr/bin/env bash
# Cria a infraestrutura de produção do Schedio Drasis no Azure e prepara o
# Environment `producao` no GitHub. Roda uma vez, à mão, por quem é dono da conta;
# os deploys depois disso são todos feitos pelo pipeline (.github/workflows/ci.yml).
#
# Pode rodar de novo: o Azure atualiza o que já existe, e as senhas só são geradas
# se ainda não houver uma. Pré-requisitos: `az login` e `gh auth login` feitos.
#
#   APP=schedio-drasis BANCO_SERVIDOR=schedio-drasis-db bash infra/provisionar.sh
set -euo pipefail

# No Git Bash do Windows, impede que /subscriptions/... vire um caminho de disco.
export MSYS_NO_PATHCONV=1

REPO="Lexandrex/Schedio"
AMBIENTE="producao"
REGIAO="${REGIAO:-brazilsouth}"
GRUPO="rg-schedio-prod"
PLANO="plan-schedio-prod"
LOGS="log-schedio-prod"
IDENTIDADE="id-schedio-deploy"
BANCO_ADMIN="schedio_admin"
BANCO_NOME="schedio"
# Estes dois viram endereços públicos, então precisam ser únicos em todo o Azure.
APP="${APP:-schedio-drasis}"
BANCO_SERVIDOR="${BANCO_SERVIDOR:-schedio-drasis-db}"
APP_URL="https://$APP.azurewebsites.net"

# O az no Windows pode terminar as linhas com \r, o que quebraria as comparações.
az_valor() { az "$@" --output tsv | tr -d '\r'; }

segredo_existe() { gh secret list --repo "$REPO" --env "$AMBIENTE" --json name --jq '.[].name' | grep -qx "$1"; }
gravar_segredo() { printf '%s' "$2" | gh secret set "$1" --repo "$REPO" --env "$AMBIENTE"; }
gravar_variavel() { gh variable set "$1" --repo "$REPO" --env "$AMBIENTE" --body "$2"; }

# Com mais de uma assinatura no mesmo login, escolha qual pagar a conta:
#   ASSINATURA="Azure for Students" bash infra/provisionar.sh
if [ -n "${ASSINATURA:-}" ]; then
  az account set --subscription "$ASSINATURA"
fi
echo "== Assinatura: $(az_valor account show --query name)"

echo "== Provedores de recurso do Azure"
for provedor in Microsoft.Web Microsoft.DBforPostgreSQL Microsoft.OperationalInsights Microsoft.ManagedIdentity Microsoft.Insights; do
  az provider register --namespace "$provedor" --wait
done

echo "== Grupo de recursos"
GRUPO_ID=$(az_valor group create --name "$GRUPO" --location "$REGIAO" --query id)

echo "== Environment do GitHub (só a main pode publicar)"
gh api --method PUT "repos/$REPO/environments/$AMBIENTE" --input - > /dev/null <<'JSON'
{ "deployment_branch_policy": { "protected_branches": false, "custom_branch_policies": true } }
JSON
if ! gh api "repos/$REPO/environments/$AMBIENTE/deployment-branch-policies" --jq '.branch_policies[].name' | grep -qx main; then
  gh api --method POST "repos/$REPO/environments/$AMBIENTE/deployment-branch-policies" -f name=main -f type=branch > /dev/null
fi

echo "== PostgreSQL gerenciado (Burstable B1ms, 32 GB, backup de 7 dias)"
# Hexadecimal: a senha pode entrar na DATABASE_URL sem precisar de escape.
SENHA_BANCO=""
if ! az postgres flexible-server show --resource-group "$GRUPO" --name "$BANCO_SERVIDOR" --output none 2>/dev/null; then
  SENHA_BANCO=$(openssl rand -hex 24)
  az postgres flexible-server create \
    --resource-group "$GRUPO" --name "$BANCO_SERVIDOR" --location "$REGIAO" \
    --tier Burstable --sku-name Standard_B1ms --storage-size 32 --version 16 \
    --backup-retention 7 --public-access None \
    --admin-user "$BANCO_ADMIN" --admin-password "$SENHA_BANCO" \
    --yes --output none
elif ! segredo_existe DATABASE_URL; then
  # O servidor existe, mas a senha nunca chegou ao GitHub (execução que parou no
  # meio). Ninguém sabe a senha antiga, então troca por uma nova.
  SENHA_BANCO=$(openssl rand -hex 24)
  az postgres flexible-server update --resource-group "$GRUPO" --name "$BANCO_SERVIDOR" \
    --admin-password "$SENHA_BANCO" --output none
fi
if ! az postgres flexible-server db show --resource-group "$GRUPO" --server-name "$BANCO_SERVIDOR" \
    --name "$BANCO_NOME" --output none 2>/dev/null; then
  az postgres flexible-server db create \
    --resource-group "$GRUPO" --server-name "$BANCO_SERVIDOR" --name "$BANCO_NOME" --output none
fi
if [ -n "$SENHA_BANCO" ]; then
  gravar_segredo DATABASE_URL "postgresql://$BANCO_ADMIN:$SENHA_BANCO@$BANCO_SERVIDOR.postgres.database.azure.com:5432/$BANCO_NOME?sslmode=require"
fi

# 0.0.0.0 é a convenção do Azure para "só serviços dentro do Azure". Não é a
# internet inteira: o resto continua bloqueado, e o pipeline abre o próprio IP.
az postgres flexible-server firewall-rule create \
  --resource-group "$GRUPO" --server-name "$BANCO_SERVIDOR" --name servicos-azure \
  --start-ip-address 0.0.0.0 --end-ip-address 0.0.0.0 --output none

echo "== App Service (Linux B1, Node 22)"
az appservice plan create --resource-group "$GRUPO" --name "$PLANO" --location "$REGIAO" \
  --is-linux --sku B1 --output none
if ! az webapp show --resource-group "$GRUPO" --name "$APP" --output none 2>/dev/null; then
  az webapp create --resource-group "$GRUPO" --plan "$PLANO" --name "$APP" \
    --runtime "NODE:22-lts" --output none
fi
az webapp update --resource-group "$GRUPO" --name "$APP" --https-only true --output none
# Always On mantém de pé o expurgo diário de contas (server.js) e evita a demora
# na primeira visita; FTP desligado para não existir deploy fora do pipeline.
az webapp config set --resource-group "$GRUPO" --name "$APP" \
  --always-on true --startup-file "node server.js" \
  --ftps-state Disabled --min-tls-version 1.2 --output none
# O pacote já chega pronto do pipeline: sem build no servidor, e roda como veio.
az webapp config appsettings set --resource-group "$GRUPO" --name "$APP" --output none \
  --settings SCM_DO_BUILD_DURING_DEPLOYMENT=false WEBSITE_RUN_FROM_PACKAGE=1
# Sem usuário e senha de publicação: só entra quem tem identidade no Azure.
for protocolo in ftp scm; do
  az resource update --resource-group "$GRUPO" --namespace Microsoft.Web \
    --parent "sites/$APP" --resource-type basicPublishingCredentialsPolicies \
    --name "$protocolo" --set properties.allow=false --output none
done

echo "== Logs (Log Stream e Log Analytics com 30 dias de retenção)"
az webapp log config --resource-group "$GRUPO" --name "$APP" \
  --application-logging filesystem --docker-container-logging filesystem \
  --level information --output none
LOGS_ID=$(az_valor monitor log-analytics workspace create \
  --resource-group "$GRUPO" --workspace-name "$LOGS" --location "$REGIAO" \
  --retention-time 30 --query id)
APP_ID=$(az_valor webapp show --resource-group "$GRUPO" --name "$APP" --query id)
az monitor diagnostic-settings create --name logs-para-analytics \
  --resource "$APP_ID" --workspace "$LOGS_ID" --output none \
  --logs '[{"category":"AppServiceConsoleLogs","enabled":true},{"category":"AppServiceHTTPLogs","enabled":true},{"category":"AppServicePlatformLogs","enabled":true}]'

echo "== Identidade do pipeline (OIDC, sem senha guardada)"
az identity create --resource-group "$GRUPO" --name "$IDENTIDADE" --location "$REGIAO" --output none
CLIENT_ID=$(az_valor identity show --resource-group "$GRUPO" --name "$IDENTIDADE" --query clientId)
PRINCIPAL_ID=$(az_valor identity show --resource-group "$GRUPO" --name "$IDENTIDADE" --query principalId)
# Só um job deste repositório no Environment `producao` consegue usar a identidade.
az identity federated-credential create --resource-group "$GRUPO" --identity-name "$IDENTIDADE" \
  --name github-producao --issuer "https://token.actions.githubusercontent.com" \
  --subject "repo:$REPO:environment:$AMBIENTE" --audiences "api://AzureADTokenExchange" --output none
# Contributor só neste grupo de recursos, nada além dele na assinatura.
if [ -z "$(az_valor role assignment list --assignee "$PRINCIPAL_ID" --scope "$GRUPO_ID" --role Contributor --query '[].id')" ]; then
  az role assignment create --assignee-object-id "$PRINCIPAL_ID" --assignee-principal-type ServicePrincipal \
    --role Contributor --scope "$GRUPO_ID" --output none
fi

echo "== Configuração do Environment no GitHub"
gravar_segredo AZURE_CLIENT_ID "$CLIENT_ID"
gravar_segredo AZURE_TENANT_ID "$(az_valor account show --query tenantId)"
gravar_segredo AZURE_SUBSCRIPTION_ID "$(az_valor account show --query id)"
segredo_existe JWT_SECRET || gravar_segredo JWT_SECRET "$(openssl rand -hex 48)"
gravar_variavel AZURE_RESOURCE_GROUP "$GRUPO"
gravar_variavel AZURE_APP_NAME "$APP"
gravar_variavel AZURE_DB_SERVER "$BANCO_SERVIDOR"
gravar_variavel APP_URL "$APP_URL"

echo
echo "Pronto: $APP_URL"
echo "Falta cadastrar SMTP e Cloudinary: veja docs/deploy.md, seção 2."
