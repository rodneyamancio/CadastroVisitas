# Cadastro de Famílias — Missão Fraternal Setor Freguesia do Ó

Formulário público (sem login, pensado para celular) para cadastrar famílias que receberão visita,
com painel administrativo, exportação para Excel e mapa de calor.

## Como subir

Tudo roda em Docker (aplicação + Postgres).

```bash
cp .env.example .env      # troque as senhas e o SESSION_SECRET
docker compose up -d --build
```

- Formulário: http://localhost:3040
- Painel: http://localhost:3040/admin

O primeiro **super admin** é criado na primeira subida com `SUPERADMIN_EMAIL` e `SUPERADMIN_PASSWORD` do `.env`.
A porta é definida por `APP_PORT`.

Desenvolvimento com recarga automática:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml up
```

## O que tem

- **Formulário** (`/`): responsável, telefone, endereço (sugestão de ruas ou localização do celular), número,
  complemento, bairro, ponto de referência, dia (sábado 28/11 ou domingo 29/11) e horário (manhã ou tarde).
- **Visitas** (`/admin`): lista em cards ou tabela, busca e filtros, totais por dia/horário, exclusão e
  **exportação para Excel** (respeita os filtros).
  O botão **Conferir bairros** olha de novo o bairro de todas as visitas pelo nome da rua e corrige os errados.
- **Mapa de calor** (`/admin/mapa`): filtros por dia e horário, casas individuais e ranking por bairro.
- **Site** (`/admin/site`): quantas pessoas entram, até que etapa do formulário chegam, quantas cadastram,
  onde o envio trava, aparelho usado e mapa de calor dos toques no formulário. Os dados são anônimos.
- **Assistente de IA** (`/admin/assistente`): agrupa as visitas por dia, horário e proximidade em roteiros para
  as equipes, com ordem de visita, trajeto no Google Maps, impressão e exportação para Excel. A IA recebe só
  rua, número, bairro, dia, horário e posição (nomes e telefones não são enviados).
- **MCP** (`/admin/mcp`): servidor MCP em `/api/mcp` para ligar o sistema a um assistente de IA (Claude e outros).
  Cada usuário cria os próprios tokens; o token enxerga o mesmo que o dono enxerga no painel. Veja "Servidor MCP".
- **Usuários** (`/admin/usuarios`, só super admin): cadastrar (com convite por e-mail para a pessoa criar a senha
  ou com a senha definida na hora), aprovar ou recusar pedidos de acesso, mudar perfil, desativar, enviar link de
  nova senha e excluir.
- **Pedir cadastro** (`/admin/cadastro`): qualquer pessoa pode pedir acesso como admin. O pedido fica aguardando a
  aprovação de um super admin, que é avisado por e-mail.
- **Senhas**: "Minha conta" para trocar a própria senha e "Esqueci minha senha" na tela de entrada. Trocar a senha
  encerra as sessões abertas em outros aparelhos.
- **Auditoria** (`/admin/auditoria`, só super admin): quem fez o quê, quando e de onde (acessos, senhas, usuários,
  visitas, exportações, roteiros, configurações e e-mails).
- **Configurações** (`/admin/configuracoes`, só super admin): conexão do assistente com a Anthropic (Claude) ou
  a OpenAI e envio de e-mail pelo Resend (chave, remetente, e-mail de teste e prévia dos e-mails). As chaves de
  API ficam cifradas no banco.

Perfis: **super admin** (tudo, inclusive usuários, configurações e os dados de quem cadastrou: IP e aparelho) e
**admin** (visitas, mapa, site, assistente e exportação).

## Servidor MCP

Endereço: `https://SEU-DOMINIO/api/mcp` (transporte Streamable HTTP). O acesso é com token, criado no painel em
**MCP** e enviado no cabeçalho `Authorization: Bearer <token>`. No Claude Code:

```bash
claude mcp add --transport http missao-fraternal https://SEU-DOMINIO/api/mcp --header "Authorization: Bearer <token>"
```

- **Ferramentas**: `novidades` (o que chegou desde a última consulta com o mesmo token), `listar_visitas`,
  `ver_visita`, `resumo_visitas`, `estatisticas_site`, `ultimo_roteiro` e `conferir_bairros`. Para o super admin:
  `pedidos_de_acesso`, `aprovar_pedido`, `recusar_pedido`, `listar_usuarios` e `auditoria`.
- **Recursos**: `missao://visitas/recentes`, `missao://visitas/resumo`, `missao://visitas/{id}` e, para o super
  admin, `missao://usuarios/pedidos`.
- **Avisos**: a cada família cadastrada (e a cada pedido de acesso, para o super admin) o servidor envia um aviso
  a todas as sessões conectadas (`notifications/message`) e `notifications/resources/updated` a quem assinou os
  recursos. Nem todo cliente mostra esses avisos na tela; a ferramenta `novidades` funciona em qualquer um.
- Tudo o que passa pelo MCP fica na auditoria, com o nome do token. Revogar o token encerra as sessões dele.
- As sessões ficam na memória do processo: depois de um deploy o cliente reconecta sozinho.

## Observações

- Datas e horários da visita ficam em `src/lib/config.ts`.
- Endereços são localizados com dados do OpenStreetMap (serviços públicos Photon e Nominatim). A posição vem,
  nesta ordem: localização do celular, número da casa, rua. Os serviços podem ser trocados por instâncias
  próprias com `PHOTON_URL` e `NOMINATIM_URL`.
- O **bairro** vem da base dos Correios (ViaCEP), pelo nome da rua e pelo número da casa: no mapa aberto o
  bairro está errado em boa parte da região. O bairro escrito à mão por quem cadastra é mantido; o botão
  "Conferir bairros" troca pelo dos Correios e guarda o valor anterior na coluna `bairro_informado`.
- O botão "usar minha localização" espera alguns segundos pela leitura mais exata do GPS e não preenche a rua
  quando o erro passa de 300 m.
- O botão "usar minha localização" só funciona em **HTTPS** (ou em `localhost`). Em produção, coloque o sistema
  atrás de um proxy com certificado (Caddy, Nginx, Traefik etc.).
- Atrás de um proxy (Nginx, Caddy), publique a aplicação só em `127.0.0.1` com `APP_PORT=127.0.0.1:3290` e
  repasse os cabeçalhos `X-Forwarded-For` e `X-Forwarded-Proto`: é deles que saem o IP de quem cadastrou e o
  cookie seguro do painel.
- Para os e-mails, crie uma chave em resend.com e verifique o domínio do remetente na conta do Resend. Em
  produção, preencha `APP_URL` no `.env`: é o endereço usado nos links dos e-mails.
- A chave que cifra as chaves de API vem do `SESSION_SECRET`: se ele mudar, informe as chaves de novo.
- Os dados ficam no volume Docker `pgdata`. Backup:
  `docker compose exec db sh -c 'pg_dump -U $POSTGRES_USER $POSTGRES_DB' > backup.sql`
