import { DIAS, PERIODOS } from './config';
import { sql } from './db';
import { enderecoDoPonto, localizarEndereco } from './geocode';

export type Visita = {
  id: number;
  responsavel: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  observacoes: string | null;
  data_visita: string;
  periodo: string;
  lat: number | null;
  lng: number | null;
  precisao: string | null;
  criado_em: Date;
};

export type Filtros = { q?: string; dia?: string; periodo?: string };

export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const dia = um(sp.dia);
  const periodo = um(sp.periodo);
  return {
    q: um(sp.q).trim().slice(0, 100) || undefined,
    dia: DIAS.some((d) => d.valor === dia) ? dia : undefined,
    periodo: PERIODOS.some((p) => p.valor === periodo) ? periodo : undefined,
  };
}

export function filtrosParaUrl(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.dia) p.set('dia', f.dia);
  if (f.periodo) p.set('periodo', f.periodo);
  return p.toString();
}

export async function listarVisitas(f: Filtros = {}): Promise<Visita[]> {
  const onde: string[] = [];
  const params: unknown[] = [];
  if (f.dia) {
    params.push(f.dia);
    onde.push(`data_visita = $${params.length}`);
  }
  if (f.periodo) {
    params.push(f.periodo);
    onde.push(`periodo = $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    const n = params.length;
    onde.push(
      `(responsavel ILIKE $${n} OR endereco ILIKE $${n} OR bairro ILIKE $${n} OR telefone ILIKE $${n} OR observacoes ILIKE $${n})`,
    );
  }
  return sql<Visita>(
    `SELECT * FROM visitas ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
     ORDER BY data_visita, periodo, bairro NULLS LAST, endereco, id`,
    params,
  );
}

export type Resumo = { total: number; grupos: Record<string, number> };

export async function resumoVisitas(): Promise<Resumo> {
  const linhas = await sql<{ data_visita: string; periodo: string; n: number }>(
    'SELECT data_visita, periodo, count(*)::int AS n FROM visitas GROUP BY 1, 2',
  );
  const grupos: Record<string, number> = {};
  let total = 0;
  for (const l of linhas) {
    grupos[`${l.data_visita}|${l.periodo}`] = l.n;
    total += l.n;
  }
  return { total, grupos };
}

export function enderecoCompleto(v: Pick<Visita, 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'>): string {
  const linha1 = [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - ');
  const cidade = v.cidade && v.uf ? `${v.cidade} - ${v.uf}` : v.cidade;
  return [linha1, v.bairro, cidade].filter(Boolean).join(', ');
}

// Descobre a posição da casa no mapa. Quem cadastrou pelo GPS do celular já tem posição exata.
export async function localizarVisita(id: number): Promise<boolean> {
  const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
  if (!v || v.precisao === 'gps' || v.precisao === 'numero') return false;
  const pos = await localizarEndereco({ rua: v.endereco, numero: v.numero, bairro: v.bairro, cidade: v.cidade, uf: v.uf });
  if (!pos) return false;
  // Quem escreveu a rua sem escolher na lista fica sem bairro: usa o bairro do ponto encontrado.
  let bairro = '';
  if (!v.bairro) bairro = (await enderecoDoPonto(pos.lat, pos.lng).catch(() => null))?.bairro ?? '';
  await sql(
    `UPDATE visitas SET lat = $2, lng = $3, precisao = $4,
       bairro = COALESCE(NULLIF(bairro, ''), NULLIF($5, '')),
       cep = COALESCE(NULLIF(cep, ''), NULLIF($6, ''))
     WHERE id = $1`,
    [id, pos.lat, pos.lng, pos.precisao, bairro, pos.cep],
  );
  return true;
}
