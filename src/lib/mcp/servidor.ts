import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SubscribeRequestSchema, UnsubscribeRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { ACOES, CATEGORIAS, listarAuditoria, registrar } from '../auditoria';
import { DIAS, PERIODOS, PRECISOES, TITULO, nomeDia, nomePeriodo } from '../config';
import { sql } from '../db';
import { PERIODOS_SITE, estatisticasDoSite } from '../estatisticas';
import { aprovarPedidoDeAcesso, pedidosPendentes, recusarPedidoDeAcesso } from '../pedidos';
import { ultimoRoteiro } from '../roteiro';
import { enderecoCompleto, reconferirBairros, type Visita } from '../visitas';
import { RECURSOS } from './sessoes';
import type { DonoDoToken } from './tokens';

// Servidor MCP do Cadastro de Famílias. Cada sessão recebe um servidor próprio, montado
// conforme o perfil do dono do token: o super admin ganha as ferramentas de usuários,
// pedidos de acesso e auditoria, e vê o IP e o aparelho de quem cadastrou.

const INSTRUCOES = `Servidor do "${TITULO}": cadastro de famílias que pediram visita nos dias 28/11/2026 (sábado) e 29/11/2026 (domingo), de manhã ou à tarde.

- Para saber o que chegou de novo, use "novidades": ela devolve só os cadastros recebidos desde a última consulta feita com este token.
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
    whatsapp: `https://wa.me/55${v.telefone}`,
    endereco: enderecoCompleto(v),
    rua: v.endereco,
    numero: v.numero,
    complemento: v.complemento,
    bairro: v.bairro,
    cidade: v.cidade,
    uf: v.uf,
    cep: v.cep,
    como_achar_a_casa: v.observacoes,
    dia_da_visita: v.data_visita,
    dia_da_visita_nome: nomeDia(v.data_visita),
    periodo: nomePeriodo(v.periodo),
    cadastrado_em: quando(v.criado_em),
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
    sql<{ total: number; sem_posicao: number; ultima: Date | null }>(
      'SELECT count(*)::int AS total, count(*) FILTER (WHERE lat IS NULL)::int AS sem_posicao, max(criado_em) AS ultima FROM visitas',
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
      description: 'Lista as famílias cadastradas, com filtros por dia, período, bairro, texto e data do cadastro. Devolve no máximo "limite" itens por página.',
      inputSchema: {
        busca: z.string().max(100).optional().describe('Trecho do nome, da rua, do bairro, do telefone ou das observações'),
        dia: z.enum(['sabado', 'domingo']).optional().describe('sabado = 28/11/2026, domingo = 29/11/2026'),
        periodo: z.enum(['manha', 'tarde']).optional(),
        bairro: z.string().max(80).optional(),
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
      description: 'Mostra todos os dados de uma família cadastrada, pelo número do cadastro.',
      inputSchema: { id: z.number().int().positive().describe('Número do cadastro') },
      annotations: { title: 'Ver uma visita', ...leitura },
    },
    async ({ id }) => {
      const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
      if (!v) return falha(`Não existe cadastro com o número ${id}.`);
      await anotar('ver_visita', { visita: `Nº ${v.id} · ${v.responsavel}` });
      return texto(visitaParaMcp(v, superAdmin));
    },
  );

  servidor.registerTool(
    'resumo_visitas',
    {
      title: 'Resumo das visitas',
      description: 'Totais de famílias por dia e período, por bairro, cadastros recebidos por data nos últimos 14 dias e quantos endereços ainda estão sem posição no mapa.',
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
