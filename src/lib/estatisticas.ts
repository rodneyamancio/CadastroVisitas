import { sql } from './db';

export const PERIODOS_SITE = [
  { valor: 'hoje', nome: 'Hoje' },
  { valor: '7', nome: '7 dias' },
  { valor: '30', nome: '30 dias' },
  { valor: 'tudo', nome: 'Tudo' },
] as const;
export type PeriodoSite = (typeof PERIODOS_SITE)[number]['valor'];

const FUSO = 'America/Sao_Paulo';

function condicao(p: PeriodoSite): string {
  if (p === 'hoje') return `criado_em >= date_trunc('day', now() AT TIME ZONE '${FUSO}') AT TIME ZONE '${FUSO}'`;
  if (p === '7' || p === '30') return `criado_em >= now() - interval '${p} days'`;
  return 'TRUE';
}

export type Resumo = { acessos: number; visitantes: number; comecaram: number; tentaram: number; cadastraram: number; cadastros: number };
export type Clique = { chave: string; fx: number; fy: number };

export async function estatisticasDoSite(p: PeriodoSite) {
  const onde = condicao(p);
  const [resumos, campos, erros, dias, aparelhos, toques, cliques] = await Promise.all([
    sql<Resumo>(
      `SELECT count(*) FILTER (WHERE tipo = 'acesso')::int AS acessos,
              count(DISTINCT visitante) FILTER (WHERE tipo = 'acesso')::int AS visitantes,
              count(DISTINCT visitante) FILTER (WHERE tipo = 'campo')::int AS comecaram,
              count(DISTINCT visitante) FILTER (WHERE tipo IN ('tentativa', 'cadastro'))::int AS tentaram,
              count(DISTINCT visitante) FILTER (WHERE tipo = 'cadastro')::int AS cadastraram,
              count(*) FILTER (WHERE tipo = 'cadastro')::int AS cadastros
       FROM eventos WHERE ${onde}`,
    ),
    sql<{ chave: string; n: number }>(
      `SELECT chave, count(DISTINCT visitante)::int AS n FROM eventos WHERE tipo = 'campo' AND ${onde} GROUP BY chave`,
    ),
    sql<{ campo: string; n: number }>(
      `SELECT campo, count(*)::int AS n
       FROM eventos, jsonb_array_elements_text(dados -> 'erros') AS campo
       WHERE tipo = 'tentativa' AND jsonb_typeof(dados -> 'erros') = 'array' AND ${onde}
       GROUP BY campo ORDER BY n DESC`,
    ),
    sql<{ dia: string; visitantes: number; cadastros: number }>(
      `SELECT to_char((criado_em AT TIME ZONE '${FUSO}')::date, 'YYYY-MM-DD') AS dia,
              count(DISTINCT visitante) FILTER (WHERE tipo = 'acesso')::int AS visitantes,
              count(*) FILTER (WHERE tipo = 'cadastro')::int AS cadastros
       FROM eventos WHERE ${onde} GROUP BY 1 ORDER BY 1`,
    ),
    sql<{ dispositivo: string; n: number }>(
      `SELECT COALESCE(dispositivo, 'computador') AS dispositivo, count(DISTINCT visitante)::int AS n
       FROM eventos WHERE tipo = 'acesso' AND ${onde} GROUP BY 1 ORDER BY n DESC`,
    ),
    sql<{ chave: string; n: number }>(
      `SELECT chave, count(*)::int AS n FROM eventos WHERE tipo = 'clique' AND ${onde} GROUP BY chave ORDER BY n DESC`,
    ),
    sql<Clique>(
      `SELECT chave, fx, fy FROM eventos
       WHERE tipo = 'clique' AND chave IS NOT NULL AND fx IS NOT NULL AND fy IS NOT NULL AND ${onde}
       ORDER BY id DESC LIMIT 20000`,
    ),
  ]);
  return {
    resumo: resumos[0],
    campos: Object.fromEntries(campos.map((c) => [c.chave, c.n])) as Record<string, number>,
    erros,
    dias: preencherDias(dias),
    aparelhos,
    toques,
    cliques,
  };
}

// Completa os dias sem movimento (para o gráfico não pular datas) e mostra no máximo os 30 últimos.
function preencherDias(linhas: { dia: string; visitantes: number; cadastros: number }[]) {
  if (!linhas.length) return [];
  const porDia = new Map(linhas.map((l) => [l.dia, l]));
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: FUSO }).format(new Date());
  const saida: { dia: string; visitantes: number; cadastros: number }[] = [];
  const cursor = new Date(`${linhas[0].dia}T12:00:00Z`);
  const fim = new Date(`${hoje}T12:00:00Z`);
  while (cursor <= fim) {
    const dia = cursor.toISOString().slice(0, 10);
    saida.push(porDia.get(dia) ?? { dia, visitantes: 0, cadastros: 0 });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return saida.slice(-30);
}
