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
- **Painel** (`/admin`): lista com busca e filtros, totais por dia/horário, exclusão e **exportação para Excel**
  (respeita os filtros).
- **Mapa de calor** (`/admin/mapa`): filtros por dia e horário, casas individuais e ranking por bairro.
- **Usuários** (`/admin/usuarios`, só super admin): cadastrar, mudar perfil, desativar, redefinir senha e excluir.

Perfis: **super admin** (tudo, inclusive usuários) e **admin** (visitas, mapa e exportação).

## Observações

- Datas e horários da visita ficam em `src/lib/config.ts`.
- Endereços são localizados com dados do OpenStreetMap (serviços públicos Photon e Nominatim). A posição vem,
  nesta ordem: localização do celular, número da casa, rua. Os serviços podem ser trocados por instâncias
  próprias com `PHOTON_URL` e `NOMINATIM_URL`.
- O botão "usar minha localização" só funciona em **HTTPS** (ou em `localhost`). Em produção, coloque o sistema
  atrás de um proxy com certificado (Caddy, Nginx, Traefik etc.).
- Os dados ficam no volume Docker `pgdata`. Backup:
  `docker compose exec db sh -c 'pg_dump -U $POSTGRES_USER $POSTGRES_DB' > backup.sql`
