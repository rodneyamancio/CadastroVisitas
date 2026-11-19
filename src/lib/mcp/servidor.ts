import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ACOES, CATEGORIAS, listarAuditoria, registrar } from '../auditoria';
import { DIAS, PERIODOS, PRECISOES, TITULO, nomeDia, nomePeriodo } from '../config';
import { gravarVisita, processarNovaVisita, validarNovaVisita } from '../criacao';
import { sql } from '../db';
import { listarDuplicidades, parecidasCom } from '../duplicidade';
import { editarVisita, type Edicao } from '../edicao';
import { PERIODOS_SITE, estatisticasDoSite } from '../estatisticas';
import { aprovarPedidoDeAcesso, pedidosPendentes, recusarPedidoDeAcesso } from '../pedidos';
import { ultimoRoteiro } from '../roteiro';
import { FILTRO_CONFIRMADA, enderecoCompleto, marcarConfirmada, marcarNoPortal, reconferirBairros, type Visita } from '../visitas';
import { RECURSOS } from './sessoes';
import type { DonoDoToken } from './tokens';

// Servidor MCP do Cadastro de Famílias. Cada sessão recebe um servidor próprio, montado
// conforme o perfil do dono do token: o super admin ganha as ferramentas de usuários,
// pedidos de acesso e auditoria, e vê o IP e o aparelho de quem cadastrou.

const INSTRUCOES = `Servidor do "${TITULO}": cadastro de famílias que pediram visita nos dias 28/11/2026 (sábado) e 29/11/2026 (domingo), de manhã ou à tarde.

- Para saber o que chegou de novo, use "novidades": ela devolve só os cadastros recebidos desde a última consulta feita com este token.
- Este sistema é paralelo ao portal oficial: cada visita informa em "portal_oficial" se já foi passada para lá. Para conferir os dados antes de passar, use "ver_visita"; depois de cadastrar no portal oficial, marque com "marcar_portal_oficial". Para cadastrar uma família nova, use "criar_visita"; para corrigir dados de um cadastro, use "editar_visita". "listar_visitas" com portal_oficial "falta" mostra o que ainda falta.
- Cada visita informa em "entrar_em_contato_antes_para_confirmar" se a família pediu para ser avisada antes e, em "visita_confirmada_por_telefone", se a equipe já ligou e confirmou. Depois de ligar e a família confirmar, marque com "marcar_visita_confirmada". "listar_visitas" com confirmacao "pendente" mostra as que pediram contato e ainda faltam.
- "listar_visitas", "ver_visita" e "resumo_visitas" consultam as famílias cadastradas; "estatisticas_site" mostra quantas pessoas entraram no formulário e quantas concluíram.
- Os dados são pessoais (nome, telefone, endereço): use só para organizar as visitas.
- Datas e horas estão no horário de Brasília.`;

const dataHora = new Intl.DateTimeFormat('sv-SE', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' });
const quando = (d: Date | string | null) => (d ? dataHora.format(new Date(d)) : null);

function telefone(t: string) {
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

function visitaParaMcp(v: Visita, superAdmin: boolean) {
  const temPonto = v.lat != null && v.lng != null;
  const alvo = temPonto && v.precisao !== 'rua' ? `${v.lat},${v.lng}` : enderecoCompleto(v);
  return {
    id: v.id,
    responsavel: v.responsavel,
    telefone: telefone(v.telefone),
    telefone_so_numeros: v.telefone,
    whatsapp: `https://wa.me/55${v.telefone}`,
    endereco: enderecoCompleto(v),
    rua: v.endereco,
    numero: v.numero,
    complemento: v.complemento,
    bairro: v.bairro,
    // Bairro que estava no cadastro antes de o sistema trocar pelo dos Correios (se trocou)
    bairro_antes_da_conferencia: v.bairro_informado ?? null,
    cidade: v.cidade,
    uf: v.uf,
    cep: v.cep,
    como_achar_a_casa: v.observacoes,
    dia_da_visita: v.data_visita,
    dia_da_visita_nome: nomeDia(v.data_visita),
    periodo: nomePeriodo(v.periodo),
    entrar_em_contato_antes_para_confirmar: v.confirmar_contato == null ? 'não informado' : v.confirmar_contato ? 'sim' : 'não',
    // A equipe já ligou e confirmou a visita com a família?
    visita_confirmada_por_telefone: v.confirmada_em ? { confirmada: true, em: quando(v.confirmada_em), por: v.confirmada_por } : { confirmada: false },
    cadastrado_em: quando(v.criado_em),
    portal_oficial: v.migrado_em ? { migrado: true, em: quando(v.migrado_em), por: v.migrado_por } : { migrado: false },
    posicao_no_mapa: temPonto ? { lat: v.lat, lng: v.lng, precisao: PRECISOES[v.precisao ?? ''] ?? v.precisao } : null,
    link_do_mapa: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`,
    ...(superAdmin ? { quem_cadastrou: { ip: v.ip, navegador: v.agente, ...(v.extra ?? {}) } } : {}),
  };
}

const texto = (dados: unknown, resumo?: string) => ({
  content: [{ type: 'text' as const, text: `${resumo ? `${resumo}\n\n` : ''}${JSON.stringify(dados, null, 2)}` }],
});
const falha = (mensagem: string) => ({ content: [{ type: 'text' as const, text: mensagem }], isError: true });
const json = (uri: string, dados: unknown) => ({ contents: [{ uri, mimeType: 'application/json', text: JSON.stringify(dados, null, 2) }] });

// ---------- Consultas ----------

async function novidades(dono: DonoDoToken, desde: Date | null, marcar: boolean) {
  const superAdmin = dono.perfil === 'super_admin';
  const [cursor] = await sql<{ visto_visita: number; visto_usuario: number }>('SELECT visto_visita, visto_usuario FROM tokens_mcp WHERE id = $1', [dono.tokenId]);
  const visitas = desde
    ? await sql<Visita>('SELECT * FROM visitas WHERE criado_em >= $1 ORDER BY id LIMIT 200', [desde])
    : await sql<Visita>('SELECT * FROM visitas WHERE id > $1 ORDER BY id LIMIT 200', [cursor?.visto_visita ?? 0]);
  const pedidos = !superAdmin
    ? []
    : desde
      ? await sql<{ id: number; nome: string; email: string; criado_em: Date }>(
          'SELECT id, nome, email, criado_em FROM usuarios WHERE aguardando_aprovacao AND criado_em >= $1 ORDER BY id',
          [desde],
        )
      : await sql<{ id: number; nome: string; email: string; criado_em: Date }>(
          'SELECT id, nome, email, criado_em FROM usuarios WHERE aguardando_aprovacao AND id > $1 ORDER BY id',
          [cursor?.visto_usuario ?? 0],
        );
  if (marcar && !desde && (visitas.length || pedidos.length)) {
    await sql('UPDATE tokens_mcp SET visto_visita = GREATEST(visto_visita, $2), visto_usuario = GREATEST(visto_usuario, $3) WHERE id = $1', [
      dono.tokenId,
      visitas.at(-1)?.id ?? 0,
      pedidos.at(-1)?.id ?? 0,
    ]);
  }
  const [{ total }] = await sql<{ total: number }>('SELECT count(*)::int AS total FROM visitas');
  return {
    desde: desde ? quando(desde) : 'última consulta com este token',
    novas_visitas: visitas.map((v) => visitaParaMcp(v, superAdmin)),
    ...(superAdmin
      ? {
          novos_pedidos_de_acesso: pedidos.map((p) => ({ id: p.id, nome: p.nome, email: p.email, pedido_em: quando(p.criado_em) })),
          pedidos_aguardando_aprovacao: (await pedidosPendentes()).length,
        }
      : {}),
    total_de_visitas_cadastradas: total,
  };
}

async function resumo() {
  const [porGrupo, porBairro, porData, [geral]] = await Promise.all([
    sql<{ data_visita: string; periodo: string; n: number }>('SELECT data_visita, periodo, count(*)::int AS n FROM visitas GROUP BY 1, 2 ORDER BY 1, 2'),
    sql<{ bairro: string; n: number }>(`SELECT COALESCE(NULLIF(bairro, ''), '(sem bairro)') AS bairro, count(*)::int AS n FROM visitas GROUP BY 1 ORDER BY n DESC, 1 LIMIT 60`),
    sql<{ dia: string; n: number }>(
      `SELECT to_char((criado_em AT TIME ZONE 'America/Sao_Paulo')::date, 'YYYY-MM-DD') AS dia, count(*)::int AS n
       FROM visitas WHERE criado_em >= now() - interval '14 days' GROUP BY 1 ORDER BY 1`,
    ),
    sql<{ total: number; sem_posicao: number; migradas: number; confirmadas: number; pedem: number; pendentes: number; ultima: Date | null }>(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE lat IS NULL)::int AS sem_posicao, count(migrado_em)::int AS migradas,
              count(confirmada_em)::int AS confirmadas, count(*) FILTER (WHERE confirmar_contato)::int AS pedem,
              count(*) FILTER (WHERE confirmar_contato AND confirmada_em IS NULL)::int AS pendentes, max(criado_em) AS ultima FROM visitas`,
    ),
  ]);
  return {
    total_de_familias: geral.total,
    por_dia_e_periodo: DIAS.flatMap((d) =>
      PERIODOS.map((p) => ({
        dia: d.valor,
        dia_nome: nomeDia(d.valor),
        periodo: p.nome,
        familias: porGrupo.find((g) => g.data_visita === d.valor && g.periodo === p.valor)?.n ?? 0,
      })),
    ),
    por_bairro: porBairro,
    cadastros_recebidos_por_data_ultimos_14_dias: porData,
    sem_posicao_no_mapa: geral.sem_posicao,
    portal_oficial: { migradas: geral.migradas, faltam: geral.total - geral.migradas },
    confirmacao_por_telefone: {
      confirmadas: geral.confirmadas,
      nao_confirmadas: geral.total - geral.confirmadas,
      pediram_contato_antes: geral.pedem,
      pediram_contato_e_faltam: geral.pendentes,
    },
    ultimo_cadastro_em: quando(geral.ultima),
  };
}

const recentes = async (superAdmin: boolean) =>
  (await sql<Visita>('SELECT * FROM visitas ORDER BY id DESC LIMIT 20')).map((v) => visitaParaMcp(v, superAdmin));

const pedidosParaMcp = async () => (await pedidosPendentes()).map((p) => ({ id: p.id, nome: p.nome, email: p.email, pedido_em: quando(p.criado_em) }));

// ---------- Servidor ----------

export function criarServidor(dono: DonoDoToken, assinaturas: Set<string>): McpServer {
  const superAdmin = dono.perfil === 'super_admin';
  const servidor = new McpServer(
    { name: 'cadastro-familias-missao-fraternal', title: TITULO, version: '1.0.0' },
    { capabilities: { logging: {}, resources: { subscribe: true, listChanged: true } }, instructions: INSTRUCOES },
  );

  // Toda chamada de ferramenta fica na auditoria (menos a consulta de novidades que voltou vazia).
  const anotar = (ferramenta: string, detalhes?: Record<string, unknown>) =>
    registrar('mcp.ferramenta', dono, ferramenta, { token: dono.nomeDoToken, ...detalhes });

  const leitura = { readOnlyHint: true, openWorldHint: false };

  servidor.registerTool(
    'novidades',
    {
      title: 'Novidades do cadastro',
      description:
        'Mostra as famílias cadastradas' +
        (superAdmin ? ' e os pedidos de acesso ao painel' : '') +
        ' que chegaram desde a última consulta feita com este token. Use para responder "tem cadastro novo?". Informe "desde" para olhar a partir de uma data e hora, sem mexer no marcador.',
      inputSchema: {
        desde: z.string().optional().describe('Data ou data e hora (horário de Brasília), ex.: 2026-11-12 ou 2026-11-12T08:00. Sem este campo, vale a última consulta.'),
        marcar_como_visto: z.boolean().optional().describe('Padrão: true. Com false, a próxima consulta devolve os mesmos itens de novo.'),
      },
      annotations: { title: 'Novidades do cadastro', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
    },
    async ({ desde, marcar_como_visto }) => {
      let inicio: Date | null = null;
      if (desde) {
        const limpo = desde.trim();
        inicio = new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(limpo) ? limpo : `${limpo.length <= 10 ? `${limpo}T00:00:00` : limpo}-03:00`);
        if (Number.isNaN(inicio.getTime())) return falha('Não entendi a data em "desde". Use o formato 2026-11-12 ou 2026-11-12T08:00.');
      }
      const r = await novidades(dono, inicio, marcar_como_visto !== false);
      const nVisitas = r.novas_visitas.length;
      const nPedidos = 'novos_pedidos_de_acesso' in r ? (r.novos_pedidos_de_acesso?.length ?? 0) : 0;
      if (nVisitas || nPedidos) await anotar('novidades', { 'novas visitas': nVisitas, ...(superAdmin ? { 'novos pedidos': nPedidos } : {}) });
      const frase =
        nVisitas || nPedidos
          ? `${nVisitas} ${nVisitas === 1 ? 'nova família cadastrada' : 'novas famílias cadastradas'}` +
            (superAdmin ? ` e ${nPedidos} ${nPedidos === 1 ? 'novo pedido de acesso' : 'novos pedidos de acesso'}` : '') +
            '.'
          : 'Nenhuma novidade desde a última consulta.';
      return texto(r, frase);
    },
  );

  servidor.registerTool(
    'listar_visitas',
    {
      title: 'Listar visitas',
      description: 'Lista as famílias cadastradas, com filtros por dia, período, bairro, texto, data do cadastro, situação no portal oficial (já migrada ou não) e confirmação por telefone. Devolve no máximo "limite" itens por página.',
      inputSchema: {
        busca: z.string().max(100).optional().describe('Trecho do nome, da rua, do bairro, do telefone ou das observações'),
        dia: z.enum(['sabado', 'domingo']).optional().describe('sabado = 28/11/2026, domingo = 29/11/2026'),
        periodo: z.enum(['manha', 'tarde']).optional(),
        bairro: z.string().max(80).optional(),
        portal_oficial: z.enum(['falta', 'migrado']).optional().describe('falta: ainda não passadas para o portal oficial; migrado: já passadas'),
        confirmacao: z
          .enum(['pendente', 'nao', 'sim'])
          .optional()
          .describe('pendente: a família pediu contato antes e ainda não foi confirmada; nao: todas as ainda não confirmadas; sim: já confirmadas por telefone'),
        cadastradas_desde: z.string().optional().describe('Só as cadastradas a partir desta data (AAAA-MM-DD), horário de Brasília'),
        ordem: z.enum(['recentes', 'roteiro']).optional().describe('recentes (padrão): as mais novas primeiro; roteiro: por dia, período, bairro e rua'),
        limite: z.number().int().min(1).max(200).optional().describe('Padrão: 50'),
        pagina: z.number().int().min(1).optional().describe('Padrão: 1'),
      },
      annotations: { title: 'Listar visitas', ...leitura },
    },
    async (a) => {
      const onde: string[] = [];
      const params: unknown[] = [];
      const curinga = (t: string) => `%${t.replace(/[%_\\]/g, '\\$&')}%`;
      if (a.dia) {
        params.push(DIAS[a.dia === 'sabado' ? 0 : 1].valor);
        onde.push(`data_visita = $${params.length}`);
      }
      if (a.periodo) {
        params.push(a.periodo);
        onde.push(`periodo = $${params.length}`);
      }
      if (a.bairro) {
        params.push(curinga(a.bairro));
        onde.push(`bairro ILIKE $${params.length}`);
      }
      if (a.portal_oficial) onde.push(a.portal_oficial === 'migrado' ? 'migrado_em IS NOT NULL' : 'migrado_em IS NULL');
      if (a.confirmacao) onde.push(FILTRO_CONFIRMADA[a.confirmacao]);
      if (a.busca) {
        params.push(curinga(a.busca));
        const n = params.length;
        onde.push(`(responsavel ILIKE $${n} OR endereco ILIKE $${n} OR bairro ILIKE $${n} OR telefone ILIKE $${n} OR observacoes ILIKE $${n})`);
      }
      if (a.cadastradas_desde) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(a.cadastradas_desde)) return falha('Use o formato AAAA-MM-DD em "cadastradas_desde".');
        params.push(`${a.cadastradas_desde}T00:00:00-03:00`);
        onde.push(`criado_em >= $${params.length}`);
      }
      const filtro = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
      const limite = a.limite ?? 50;
      const pagina = a.pagina ?? 1;
      const [{ total }] = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM visitas ${filtro}`, params);
      const linhas = await sql<Visita>(
        `SELECT * FROM visitas ${filtro}
         ORDER BY ${a.ordem === 'roteiro' ? 'data_visita, periodo, bairro NULLS LAST, endereco, id' : 'id DESC'}
         LIMIT ${limite} OFFSET ${(pagina - 1) * limite}`,
        params,
      );
      await anotar('listar_visitas', { filtros: Object.keys(a).length ? a : 'nenhum', devolvidas: linhas.length });
      return texto(
        { total, pagina, paginas: Math.max(1, Math.ceil(total / limite)), visitas: linhas.map((v) => visitaParaMcp(v, superAdmin)) },
        `${total} ${total === 1 ? 'visita encontrada' : 'visitas encontradas'}; ${linhas.length} nesta página.`,
      );
    },
  );

  servidor.registerTool(
    'ver_visita',
    {
      title: 'Ver uma visita',
      description:
        'Mostra todos os dados de uma família cadastrada (responsável, telefone, endereço completo, como achar a casa, dia e horário, se é preciso confirmar antes, posição no mapa e situação no portal oficial). Informe o número do cadastro em "id" ou procure por nome, telefone ou rua em "busca"; se a busca achar mais de uma família, devolve todas (até 10).',
      inputSchema: {
        id: z.number().int().positive().optional().describe('Número do cadastro'),
        busca: z.string().min(2).max(100).optional().describe('Trecho do nome do responsável, do telefone ou da rua'),
      },
      annotations: { title: 'Ver uma visita', ...leitura },
    },
    async ({ id, busca }) => {
      if (id != null) {
        const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
        if (!v) return falha(`Não existe cadastro com o número ${id}.`);
        await anotar('ver_visita', { visita: `Nº ${v.id} · ${v.responsavel}` });
        return texto(visitaParaMcp(v, superAdmin));
      }
      if (!busca?.trim()) return falha('Informe o número do cadastro em "id" ou um trecho do nome, do telefone ou da rua em "busca".');
      const trecho = `%${busca.trim().replace(/[%_\\]/g, '\\$&')}%`;
      const digitos = busca.replace(/\D/g, '');
      const achadas = await sql<Visita>(
        `SELECT * FROM visitas
         WHERE responsavel ILIKE $1 OR endereco ILIKE $1 OR ($2 <> '' AND telefone LIKE '%' || $2 || '%')
         ORDER BY id LIMIT 11`,
        [trecho, digitos.length >= 4 ? digitos : ''],
      );
      if (!achadas.length) return falha(`Nenhum cadastro encontrado com "${busca.trim()}".`);
      await anotar('ver_visita', { busca: busca.trim(), encontradas: achadas.length });
      if (achadas.length === 1) return texto(visitaParaMcp(achadas[0], superAdmin));
      return texto(
        { visitas: achadas.slice(0, 10).map((v) => visitaParaMcp(v, superAdmin)) },
        achadas.length > 10 ? 'Mais de 10 famílias com este trecho; aqui estão as 10 primeiras. Use um trecho mais completo.' : `${achadas.length} famílias com este trecho.`,
      );
    },
  );

  servidor.registerTool(
    'resumo_visitas',
    {
      title: 'Resumo das visitas',
      description: 'Totais de famílias por dia e período, por bairro, cadastros recebidos por data nos últimos 14 dias quantos endereços ainda estão sem posição no mapa e quantas famílias já foram passadas para o portal oficial.',
      annotations: { title: 'Resumo das visitas', ...leitura },
    },
    async () => {
      await anotar('resumo_visitas');
      return texto(await resumo());
    },
  );

  servidor.registerTool(
    'estatisticas_site',
    {
      title: 'Estatísticas do site',
      description: 'Movimento do formulário público: quantas pessoas entraram, começaram a preencher, tentaram enviar e concluíram o cadastro; erros mais comuns por campo; aparelhos; e a evolução por dia.',
      inputSchema: { periodo: z.enum(['hoje', '7', '30', 'tudo']).optional().describe('hoje, últimos 7 dias (padrão), últimos 30 dias ou tudo') },
      annotations: { title: 'Estatísticas do site', ...leitura },
    },
    async ({ periodo }) => {
      const p = periodo ?? '7';
      const e = await estatisticasDoSite(p);
      const r = e.resumo;
      await anotar('estatisticas_site', { período: PERIODOS_SITE.find((x) => x.valor === p)?.nome });
      return texto({
        periodo: PERIODOS_SITE.find((x) => x.valor === p)?.nome,
        funil: {
          acessos: r.acessos,
          pessoas_que_entraram: r.visitantes,
          comecaram_a_preencher: r.comecaram,
          tentaram_enviar: r.tentaram,
          concluiram_o_cadastro: r.cadastraram,
          cadastros_enviados: r.cadastros,
          taxa_de_conclusao: r.visitantes ? `${Math.round((r.cadastraram / r.visitantes) * 100)}%` : null,
        },
        pessoas_que_preencheram_cada_campo: e.campos,
        erros_ao_enviar_por_campo: e.erros,
        aparelhos: e.aparelhos,
        toques_por_area_da_tela: e.toques,
        por_dia: e.dias,
      });
    },
  );

  servidor.registerTool(
    'ultimo_roteiro',
    {
      title: 'Último roteiro de visitas',
      description: 'Devolve o último roteiro montado pelo assistente de IA do painel: grupos de visitas por dia e período, na ordem sugerida, com a distância de cada grupo.',
      annotations: { title: 'Último roteiro de visitas', ...leitura },
    },
    async () => {
      const r = await ultimoRoteiro();
      if (!r) return texto({ roteiro: null }, 'Ainda não foi montado nenhum roteiro. Ele é gerado no painel, em "Assistente de IA".');
      const ids = r.plano.grupos.flatMap((g) => g.visitas);
      const visitas = new Map((await sql<Visita>('SELECT * FROM visitas WHERE id = ANY($1::int[])', [ids])).map((v) => [v.id, v]));
      await anotar('ultimo_roteiro');
      return texto({
        montado_em: quando(r.criado_em),
        montado_por: r.criado_por,
        resumo: r.plano.resumo,
        grupos: r.plano.grupos.map((g) => ({
          nome: g.nome,
          dia: nomeDia(g.dia),
          periodo: nomePeriodo(g.periodo),
          observacao: g.observacao,
          distancia_aproximada_m: g.distanciaM,
          visitas_na_ordem: g.visitas.map((id) => {
            const v = visitas.get(id);
            return v ? { id, responsavel: v.responsavel, telefone: telefone(v.telefone), endereco: enderecoCompleto(v), como_achar_a_casa: v.observacoes } : { id, removida: true };
          }),
        })),
      });
    },
  );

  servidor.registerTool(
    'marcar_portal_oficial',
    {
      title: 'Marcar como migrada para o portal oficial',
      description:
        'Marca uma ou várias visitas como já passadas para o portal oficial (ou desmarca, com "migrado": false). Use depois de cadastrar a família no portal oficial. Fica registrado quem marcou e quando; marcar de novo o que já estava marcado não muda nada. Devolve os dados completos de cada visita e quantas ainda faltam.',
      inputSchema: {
        ids: z.array(z.number().int().positive()).min(1).max(200).describe('Números dos cadastros'),
        migrado: z.boolean().optional().describe('true (padrão): marcar como migrada; false: desmarcar'),
      },
      annotations: { title: 'Marcar como migrada para o portal oficial', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ ids, migrado }) => {
      const marcar = migrado ?? true;
      const unicos = [...new Set(ids)];
      const antes = await sql<{ id: number; migrado: boolean }>('SELECT id, migrado_em IS NOT NULL AS migrado FROM visitas WHERE id = ANY($1::int[])', [unicos]);
      const jaEstava = new Map(antes.map((a) => [a.id, a.migrado]));
      const visitas: Visita[] = [];
      const mudaram: number[] = [];
      for (const id of unicos) {
        if (!jaEstava.has(id)) continue;
        const v = await marcarNoPortal(id, marcar, dono.nome);
        if (!v) continue;
        visitas.push(v);
        if (jaEstava.get(id) !== marcar) {
          mudaram.push(id);
          await registrar(marcar ? 'visita.portal' : 'visita.portal.desfeito', dono, `Nº ${v.id} · ${v.responsavel}`, {
            origem: `MCP (token ${dono.nomeDoToken})`,
            endereço: enderecoCompleto(v),
          });
        }
      }
      const naoEncontradas = unicos.filter((id) => !jaEstava.has(id));
      if (!visitas.length) return falha(`Nenhum cadastro encontrado com ${unicos.length === 1 ? 'o número' : 'os números'} ${unicos.join(', ')}.`);
      const [{ total, migradas }] = await sql<{ total: number; migradas: number }>('SELECT count(*)::int AS total, count(migrado_em)::int AS migradas FROM visitas');
      return texto(
        {
          [marcar ? 'marcadas_agora' : 'desmarcadas_agora']: mudaram,
          ja_estavam_assim: visitas.map((v) => v.id).filter((id) => !mudaram.includes(id)),
          cadastros_nao_encontrados: naoEncontradas,
          portal_oficial: { migradas, faltam: total - migradas },
          visitas: visitas.map((v) => visitaParaMcp(v, superAdmin)),
        },
        `${mudaram.length} ${mudaram.length === 1 ? 'visita' : 'visitas'} ${marcar ? (mudaram.length === 1 ? 'marcada como migrada' : 'marcadas como migradas') : mudaram.length === 1 ? 'desmarcada' : 'desmarcadas'}. No portal oficial: ${migradas} de ${total}; faltam ${total - migradas}.`,
      );
    },
  );

  servidor.registerTool(
    'editar_visita',
    {
      title: 'Alterar dados de uma visita',
      description:
        'Altera os dados de uma família cadastrada. Informe o número do cadastro em "id" e só os campos que devem mudar; os outros ficam como estão. Para apagar um campo opcional (complemento, bairro, CEP, como achar a casa), mande texto vazio. Se a rua ou o número mudarem e o bairro não for informado, o sistema confere o bairro pelos Correios; a posição no mapa e a verificação de duplicidade são refeitas. Tudo fica na auditoria com o valor de antes e o de depois. Confira os dados com "ver_visita" antes de alterar.',
      inputSchema: {
        id: z.number().int().positive().describe('Número do cadastro'),
        responsavel: z.string().max(120).optional(),
        telefone: z.string().max(20).optional().describe('Com DDD'),
        rua: z.string().max(160).optional(),
        numero: z.string().max(12).optional().describe('Número da casa, ou S/N'),
        complemento: z.string().max(120).optional(),
        bairro: z.string().max(80).optional(),
        cep: z.string().max(10).optional(),
        como_achar_a_casa: z.string().max(500).optional(),
        dia: z.enum(['sabado', 'domingo']).optional().describe('sabado = 28/11/2026, domingo = 29/11/2026'),
        periodo: z.enum(['manha', 'tarde']).optional(),
        entrar_em_contato_antes: z.enum(['sim', 'nao', 'nao_informado']).optional().describe('Se é preciso entrar em contato com a família antes para confirmar a visita'),
      },
      annotations: { title: 'Alterar dados de uma visita', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async (a) => {
      const pedido: Edicao = {
        responsavel: a.responsavel,
        telefone: a.telefone,
        endereco: a.rua,
        numero: a.numero,
        complemento: a.complemento,
        bairro: a.bairro,
        cep: a.cep,
        observacoes: a.como_achar_a_casa,
        data_visita: a.dia ? DIAS[a.dia === 'sabado' ? 0 : 1].valor : undefined,
        periodo: a.periodo,
        confirmar_contato: a.entrar_em_contato_antes === undefined ? undefined : a.entrar_em_contato_antes === 'nao_informado' ? null : a.entrar_em_contato_antes === 'sim',
      };
      if (Object.values(pedido).every((v) => v === undefined)) return falha('Informe pelo menos um campo para alterar, além do "id".');
      const r = await editarVisita(a.id, pedido, dono, `MCP (token ${dono.nomeDoToken})`);
      if ('erro' in r) return falha(r.erros ? `${r.erro} ${Object.values(r.erros).join(' ')}` : r.erro);
      return texto(
        { alteracoes: r.mudancas, visita: visitaParaMcp(r.visita, superAdmin) },
        r.mudancas.length ? `${r.mudancas.length} ${r.mudancas.length === 1 ? 'campo alterado' : 'campos alterados'} no cadastro nº ${r.visita.id}.` : 'Nada mudou: os dados já estavam assim.',
      );
    },
  );

  servidor.registerTool(
    'marcar_visita_confirmada',
    {
      title: 'Marcar que ligou e confirmou a visita',
      description:
        'Marca uma ou várias visitas como já confirmadas com a família por telefone (ou desmarca, com "confirmada": false). Use depois de alguém da equipe ligar e a família confirmar a visita. Fica registrado quem marcou e quando; marcar de novo o que já estava marcado não muda nada. Devolve os dados completos de cada visita e quantas ainda faltam.',
      inputSchema: {
        ids: z.array(z.number().int().positive()).min(1).max(200).describe('Números dos cadastros'),
        confirmada: z.boolean().optional().describe('true (padrão): marcar como confirmada; false: desmarcar'),
      },
      annotations: { title: 'Marcar que ligou e confirmou a visita', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
    },
    async ({ ids, confirmada }) => {
      const marcar = confirmada ?? true;
      const unicos = [...new Set(ids)];
      const antes = await sql<{ id: number; confirmada: boolean }>('SELECT id, confirmada_em IS NOT NULL AS confirmada FROM visitas WHERE id = ANY($1::int[])', [unicos]);
      const jaEstava = new Map(antes.map((a) => [a.id, a.confirmada]));
      const visitas: Visita[] = [];
      const mudaram: number[] = [];
      for (const id of unicos) {
        if (!jaEstava.has(id)) continue;
        const v = await marcarConfirmada(id, marcar, dono.nome);
        if (!v) continue;
        visitas.push(v);
        if (jaEstava.get(id) !== marcar) {
          mudaram.push(id);
          await registrar(marcar ? 'visita.confirmada' : 'visita.confirmada.desfeito', dono, `Nº ${v.id} · ${v.responsavel}`, {
            origem: `MCP (token ${dono.nomeDoToken})`,
            telefone: v.telefone,
            visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
          });
        }
      }
      const naoEncontradas = unicos.filter((id) => !jaEstava.has(id));
      if (!visitas.length) return falha(`Nenhum cadastro encontrado com ${unicos.length === 1 ? 'o número' : 'os números'} ${unicos.join(', ')}.`);
      const [c] = await sql<{ total: number; confirmadas: number; pendentes: number }>(
        'SELECT count(*)::int AS total, count(confirmada_em)::int AS confirmadas, count(*) FILTER (WHERE confirmar_contato AND confirmada_em IS NULL)::int AS pendentes FROM visitas',
      );
      return texto(
        {
          [marcar ? 'marcadas_agora' : 'desmarcadas_agora']: mudaram,
          ja_estavam_assim: visitas.map((v) => v.id).filter((id) => !mudaram.includes(id)),
          cadastros_nao_encontrados: naoEncontradas,
          confirmacao_por_telefone: { confirmadas: c.confirmadas, nao_confirmadas: c.total - c.confirmadas, pediram_contato_e_faltam: c.pendentes },
          visitas: visitas.map((v) => visitaParaMcp(v, superAdmin)),
        },
        `${mudaram.length} ${mudaram.length === 1 ? 'visita' : 'visitas'} ${marcar ? (mudaram.length === 1 ? 'marcada como confirmada' : 'marcadas como confirmadas') : mudaram.length === 1 ? 'desmarcada' : 'desmarcadas'}. Confirmadas: ${c.confirmadas} de ${c.total}; das que pediram contato antes, faltam ${c.pendentes}.`,
      );
    },
  );

  servidor.registerTool(
    'criar_visita',
    {
      title: 'Cadastrar uma família nova',
      description:
        'Cadastra uma família que pediu visita, com as mesmas regras do formulário público. Obrigatórios: responsável (nome completo), telefone com DDD, rua, número (ou S/N), dia, período e se é preciso entrar em contato antes para confirmar. Antes de gravar, o sistema procura cadastro parecido (nome, telefone ou endereço): se achar, NÃO grava e devolve os cadastros parecidos. Confira com quem pediu se é a mesma família; se for outra, chame de novo com "mesmo_assim": true. Depois de gravar, o bairro é conferido pelos Correios (o informado aqui é respeitado), a casa é localizada no mapa e a duplicidade é conferida de novo com a IA. Fica na auditoria quem cadastrou.',
      inputSchema: {
        responsavel: z.string().max(120).describe('Nome completo do responsável pela casa'),
        telefone: z.string().max(20).describe('Com DDD. Exemplo: (11) 91234-5678'),
        rua: z.string().max(160).describe('Rua ou avenida'),
        numero: z.string().max(12).describe('Número da casa, ou S/N'),
        complemento: z.string().max(120).optional(),
        bairro: z.string().max(80).optional().describe('Se não informar, o sistema descobre pela rua'),
        cep: z.string().max(10).optional(),
        como_achar_a_casa: z.string().max(500).optional().describe('Ponto de referência, cor do portão etc.'),
        dia: z.enum(['sabado', 'domingo']).describe('sabado = 28/11/2026, domingo = 29/11/2026'),
        periodo: z.enum(['manha', 'tarde']),
        entrar_em_contato_antes: z.enum(['sim', 'nao', 'nao_informado']).describe('Se é preciso entrar em contato com a família antes para confirmar a visita'),
        mesmo_assim: z.boolean().optional().describe('true para gravar mesmo havendo cadastro parecido, depois de confirmar que é outra família'),
      },
      annotations: { title: 'Cadastrar uma família nova', readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    async (a) => {
      const { dados, erros } = validarNovaVisita({
        nome: a.responsavel,
        telefone: a.telefone,
        rua: a.rua,
        numero: a.numero,
        complemento: a.complemento,
        bairro: a.bairro,
        cep: a.cep,
        obs: a.como_achar_a_casa,
        dia: DIAS[a.dia === 'sabado' ? 0 : 1].valor,
        periodo: a.periodo,
        confirmar: a.entrar_em_contato_antes === 'nao_informado' ? null : a.entrar_em_contato_antes === 'sim',
      });
      if (Object.keys(erros).length) return falha(`Confira os dados: ${Object.values(erros).join(' ')}`);
      const origem = `MCP (token ${dono.nomeDoToken})`;

      // Cadastro parecido: não grava sem a confirmação de que é outra família
      const parecidas = await parecidasCom(dados).catch((e) => {
        console.error('Falha ao procurar cadastro parecido', e);
        return [];
      });
      if (parecidas.length && !a.mesmo_assim) {
        const completas = await sql<Visita>('SELECT * FROM visitas WHERE id = ANY($1::int[])', [parecidas.map((p) => p.id)]);
        const porId = new Map(completas.map((v) => [v.id, v]));
        await registrar('visita.duplicidade.aviso', dono, dados.responsavel, {
          origem,
          endereço: `${dados.endereco}, ${dados.numero}`,
          'parecido com': parecidas.map((p) => `Nº ${p.id} (${p.motivos.join(', ')})`).join(' · '),
        });
        return texto(
          {
            gravado: false,
            cadastros_parecidos: parecidas.flatMap((p) => {
              const v = porId.get(p.id);
              return v ? [{ o_que_e_parecido: p.motivos, cadastro: visitaParaMcp(v, superAdmin) }] : [];
            }),
          },
          `Nada foi gravado: ${parecidas.length === 1 ? 'há 1 cadastro parecido' : `há ${parecidas.length} cadastros parecidos`}. Confira se é a mesma família. Se for outra família, chame "criar_visita" de novo com os mesmos dados e "mesmo_assim": true.`,
        );
      }

      const nova = await gravarVisita(dados, {
        lat: null,
        lng: null,
        precisao: null,
        ip: null,
        agente: null,
        extra: { aparelho: `Cadastrado pelo MCP por ${dono.nome} (token ${dono.nomeDoToken})` },
      });
      await registrar('visita.criada.mcp', dono, `Nº ${nova.id} · ${nova.responsavel}`, {
        origem,
        endereço: `${nova.endereco}, ${nova.numero}`,
        visita: `${nomeDia(nova.data_visita)} · ${nomePeriodo(nova.periodo)}`,
        'confirmar antes': nova.confirmar_contato == null ? 'não informado' : nova.confirmar_contato ? 'sim' : 'não',
        ...(parecidas.length ? { 'aviso de duplicidade': `confirmou que é outra família (parecido com ${parecidas.map((p) => `Nº ${p.id}`).join(', ')})` } : {}),
      });
      void processarNovaVisita(nova.id, false, null);
      return texto(
        { gravado: true, visita: visitaParaMcp(nova, superAdmin) },
        `Cadastro nº ${nova.id} criado: ${nova.responsavel}, ${nomeDia(nova.data_visita)} · ${nomePeriodo(nova.periodo)}. O bairro, a posição no mapa e a duplicidade são conferidos em seguida; veja com "ver_visita" daqui a alguns segundos.`,
      );
    },
  );

  servidor.registerTool(
    'possiveis_duplicidades',
    {
      title: 'Possíveis duplicidades',
      description:
        'Lista os cadastros que podem ser da mesma família (nome, telefone ou endereço parecidos), apontados pelo sistema a cada cadastro novo. Cada item traz os dois cadastros completos, o que é parecido e o parecer da IA, quando houver. Os pares já marcados no painel como "não é duplicidade" não aparecem.',
      inputSchema: {},
      annotations: { title: 'Possíveis duplicidades', ...leitura },
    },
    async () => {
      const pares = await listarDuplicidades('abertas');
      await anotar('possiveis_duplicidades', { pares: pares.length });
      return texto(
        pares.map((p) => ({
          certeza: p.grau === 'alta' ? 'muito provável' : 'vale conferir',
          o_que_e_parecido: p.motivos,
          parecer_da_ia: p.parecer,
          apontada_em: quando(p.criado_em),
          cadastro_mais_novo: visitaParaMcp(p.nova, superAdmin),
          cadastro_que_ja_existia: visitaParaMcp(p.antiga, superAdmin),
        })),
        pares.length ? `${pares.length} ${pares.length === 1 ? 'possível duplicidade' : 'possíveis duplicidades'} para conferir.` : 'Nenhuma possível duplicidade no momento.',
      );
    },
  );

  servidor.registerTool(
    'conferir_bairros',
    {
      title: 'Conferir bairros pela rua',
      description:
        'Olha de novo o bairro das visitas já cadastradas pelo nome da rua e pelo número, na base dos Correios, e corrige os que estiverem diferentes. Sem "ids", confere todas. Devolve a lista do que mudou.',
      inputSchema: { ids: z.array(z.number().int().positive()).max(500).optional().describe('Números dos cadastros a conferir. Sem este campo: todos.') },
      annotations: { title: 'Conferir bairros pela rua', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    async ({ ids }) => {
      const r = await reconferirBairros(ids);
      await registrar('visita.bairros', dono, null, {
        origem: `MCP (token ${dono.nomeDoToken})`,
        conferidas: r.conferidas,
        corrigidas: r.corrigidas.length,
        'rua não encontrada': r.naoAchadas,
        mudanças: r.corrigidas.slice(0, 40).map((c) => `Nº ${c.id}: ${c.antes || '(sem bairro)'} → ${c.depois}`).join(' · ') || undefined,
      });
      return texto(
        { conferidas: r.conferidas, sem_mudanca: r.iguais, rua_nao_encontrada_nos_correios: r.naoAchadas, corrigidas: r.corrigidas },
        `${r.corrigidas.length} ${r.corrigidas.length === 1 ? 'bairro corrigido' : 'bairros corrigidos'} em ${r.conferidas} visitas conferidas.`,
      );
    },
  );

  // ---------- Só para o super admin ----------
  if (superAdmin) {
    servidor.registerTool(
      'pedidos_de_acesso',
      {
        title: 'Pedidos de acesso ao painel',
        description: 'Lista as pessoas que pediram acesso ao painel pelo autocadastro e ainda aguardam a aprovação do super admin.',
        annotations: { title: 'Pedidos de acesso ao painel', ...leitura },
      },
      async () => {
        const pedidos = await pedidosParaMcp();
        await anotar('pedidos_de_acesso');
        return texto({ aguardando_aprovacao: pedidos }, pedidos.length ? `${pedidos.length} aguardando aprovação.` : 'Nenhum pedido aguardando aprovação.');
      },
    );

    servidor.registerTool(
      'aprovar_pedido',
      {
        title: 'Aprovar pedido de acesso',
        description: 'Aprova um pedido de acesso: a pessoa passa a poder entrar no painel como Admin e recebe um e-mail avisando (se o envio de e-mail estiver configurado). Confirme com o usuário antes de usar.',
        inputSchema: { id: z.number().int().positive().describe('Número do pedido, como aparece em "pedidos_de_acesso"') },
        annotations: { title: 'Aprovar pedido de acesso', readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      },
      async ({ id }) => {
        const u = await aprovarPedidoDeAcesso(id, dono, `MCP (token ${dono.nomeDoToken})`);
        return u ? texto({ aprovado: { id: u.id, nome: u.nome, email: u.email } }, `Pedido aprovado: ${u.nome} já pode entrar no painel.`) : falha(`Não há pedido aguardando aprovação com o número ${id}.`);
      },
    );

    servidor.registerTool(
      'recusar_pedido',
      {
        title: 'Recusar pedido de acesso',
        description: 'Recusa e apaga um pedido de acesso; a pessoa recebe um e-mail avisando (se o envio estiver configurado). Não pode ser desfeito. Confirme com o usuário antes de usar.',
        inputSchema: { id: z.number().int().positive().describe('Número do pedido, como aparece em "pedidos_de_acesso"') },
        annotations: { title: 'Recusar pedido de acesso', readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
      },
      async ({ id }) => {
        const u = await recusarPedidoDeAcesso(id, dono, `MCP (token ${dono.nomeDoToken})`);
        return u ? texto({ recusado: { id: u.id, nome: u.nome, email: u.email } }, `Pedido de ${u.nome} recusado e removido.`) : falha(`Não há pedido aguardando aprovação com o número ${id}.`);
      },
    );

    servidor.registerTool(
      'listar_usuarios',
      {
        title: 'Usuários do painel',
        description: 'Lista os usuários do painel administrativo com perfil e situação (ativo, desativado, convite pendente, aguardando aprovação).',
        annotations: { title: 'Usuários do painel', ...leitura },
      },
      async () => {
        const linhas = await sql<{ id: number; nome: string; email: string; perfil: string; ativo: boolean; senha_pendente: boolean; aguardando_aprovacao: boolean; criado_em: Date }>(
          'SELECT id, nome, email, perfil, ativo, senha_pendente, aguardando_aprovacao, criado_em FROM usuarios ORDER BY nome',
        );
        await anotar('listar_usuarios');
        return texto(
          linhas.map((u) => ({
            id: u.id,
            nome: u.nome,
            email: u.email,
            perfil: u.perfil === 'super_admin' ? 'Super admin' : 'Admin',
            situacao: u.aguardando_aprovacao ? 'aguardando aprovação' : !u.ativo ? 'desativado' : u.senha_pendente ? 'convite pendente (ainda não criou a senha)' : 'ativo',
            cadastrado_em: quando(u.criado_em),
          })),
        );
      },
    );

    servidor.registerTool(
      'auditoria',
      {
        title: 'Auditoria',
        description: 'Consulta o registro de auditoria do sistema: quem fez o quê, quando e de onde (IP). 50 linhas por página, as mais recentes primeiro.',
        inputSchema: {
          categoria: z.enum(CATEGORIAS.map((c) => c.valor) as [string, ...string[]]).optional().describe(CATEGORIAS.map((c) => `${c.valor} = ${c.nome}`).join('; ')),
          busca: z.string().max(100).optional().describe('Trecho do nome do usuário, do alvo, do IP ou dos detalhes'),
          pagina: z.number().int().min(1).optional(),
        },
        annotations: { title: 'Auditoria', ...leitura },
      },
      async ({ categoria, busca, pagina }) => {
        const { linhas, total } = await listarAuditoria({ categoria, q: busca, pagina: pagina ?? 1 });
        await anotar('auditoria', { categoria, busca });
        return texto({
          total,
          pagina: pagina ?? 1,
          linhas: linhas.map((l) => ({ quando: quando(l.criado_em), quem: l.usuario, acao: ACOES[l.acao] ?? l.acao, alvo: l.alvo, detalhes: l.detalhes, ip: l.ip })),
        });
      },
    );
  }

  // ---------- Recursos (podem ser assinados: o servidor avisa quando mudam) ----------
  servidor.registerResource(
    'visitas-recentes',
    RECURSOS.recentes,
    { title: 'Últimas famílias cadastradas', description: 'Os 20 cadastros mais recentes. Assine para ser avisado a cada novo cadastro.', mimeType: 'application/json' },
    async (uri) => json(uri.href, await recentes(superAdmin)),
  );
  servidor.registerResource(
    'visitas-resumo',
    RECURSOS.resumo,
    { title: 'Resumo das visitas', description: 'Totais por dia, período e bairro.', mimeType: 'application/json' },
    async (uri) => json(uri.href, await resumo()),
  );
  servidor.registerResource(
    'visita',
    new ResourceTemplate('missao://visitas/{id}', { list: undefined }),
    { title: 'Cadastro de uma família', description: 'Dados de um cadastro, pelo número.', mimeType: 'application/json' },
    async (uri, { id }) => {
      const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [Number(id) || 0]);
      if (!v) throw new Error(`Não existe cadastro com o número ${id}.`);
      return json(uri.href, visitaParaMcp(v, superAdmin));
    },
  );
  if (superAdmin) {
    servidor.registerResource(
      'pedidos-de-acesso',
      RECURSOS.pedidos,
      { title: 'Pedidos de acesso aguardando aprovação', description: 'Assine para ser avisado a cada novo pedido de acesso ao painel.', mimeType: 'application/json' },
      async (uri) => json(uri.href, await pedidosParaMcp()),
    );
  }

  const assinaveis = new Set<string>([RECURSOS.recentes, RECURSOS.resumo, ...(superAdmin ? [RECURSOS.pedidos] : [])]);
  servidor.server.setRequestHandler(SubscribeRequestSchema, async (pedido) => {
    if (!assinaveis.has(pedido.params.uri)) throw new Error(`Este recurso não aceita assinatura: ${pedido.params.uri}`);
    assinaturas.add(pedido.params.uri);
    return {};
  });
  servidor.server.setRequestHandler(UnsubscribeRequestSchema, async (pedido) => {
    assinaturas.delete(pedido.params.uri);
    return {};
  });

  // ---------- Modelos de pedido ----------
  servidor.registerPrompt(
    'novidades_do_cadastro',
    { title: 'Novidades do cadastro', description: 'Confere o que chegou de novo e resume para a coordenação.' },
    () => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text:
              'Use a ferramenta "novidades" para ver os cadastros de famílias que chegaram desde a última consulta' +
              (superAdmin ? ' e os pedidos de acesso ao painel' : '') +
              '. Depois me conte, em português simples: quantas famílias novas, de quais bairros, para qual dia e período cada uma pediu a visita' +
              (superAdmin ? ', e quem está pedindo acesso ao painel' : '') +
              '. Se não houver nada novo, diga só isso.',
          },
        },
      ],
    }),
  );
  servidor.registerPrompt(
    'resumo_para_a_coordenacao',
    {
      title: 'Resumo para a coordenação',
      description: 'Monta um resumo das visitas de um dia, por período e bairro, pronto para enviar à coordenação.',
      argsSchema: { dia: z.enum(['sabado', 'domingo']).optional().describe('sabado (28/11) ou domingo (29/11); sem informar, os dois dias') },
    },
    ({ dia }) => ({
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `Use "resumo_visitas" e "listar_visitas" (ordem "roteiro"${dia ? `, dia "${dia}"` : ''}) e escreva um resumo para a coordenação da missão: total de famílias${dia ? '' : ' em cada dia'}, quantas de manhã e à tarde, os bairros com mais visitas e os endereços que ainda estão sem posição no mapa. Texto curto, em português simples, pronto para enviar por WhatsApp.`,
          },
        },
      ],
    }),
  );

  return servidor;
}
