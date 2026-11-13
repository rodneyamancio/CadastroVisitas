import { bairroDaRua, semAcento } from './bairro';
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
  // Portal oficial: quando e por quem o cadastro foi passado para lá (nulo = ainda falta)
  migrado_em: Date | null;
  migrado_por: string | null;
  // Entrar em contato antes para confirmar a visita? (nulo = cadastro antigo, sem resposta)
  confirmar_contato: boolean | null;
  ip: string | null;
  agente: string | null;
  extra: {
    aparelho?: string;
    idioma?: string;
    tela?: string;
    fuso?: string;
    visitante?: string;
    tempoS?: number | null;
    usouGps?: boolean;
  } | null;
};

export type Filtros = { q?: string; dia?: string; periodo?: string; portal?: 'falta' | 'migrado' };

export function lerFiltros(sp: Record<string, string | string[] | undefined>): Filtros {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const dia = um(sp.dia);
  const periodo = um(sp.periodo);
  const portal = um(sp.portal);
  return {
    q: um(sp.q).trim().slice(0, 100) || undefined,
    dia: DIAS.some((d) => d.valor === dia) ? dia : undefined,
    periodo: PERIODOS.some((p) => p.valor === periodo) ? periodo : undefined,
    portal: portal === 'falta' || portal === 'migrado' ? portal : undefined,
  };
}

export function filtrosParaUrl(f: Filtros): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.dia) p.set('dia', f.dia);
  if (f.periodo) p.set('periodo', f.periodo);
  if (f.portal) p.set('portal', f.portal);
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
  if (f.portal) onde.push(f.portal === 'migrado' ? 'migrado_em IS NOT NULL' : 'migrado_em IS NULL');
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

export type Resumo = { total: number; migradas: number; grupos: Record<string, number> };

export async function resumoVisitas(): Promise<Resumo> {
  const linhas = await sql<{ data_visita: string; periodo: string; n: number; migradas: number }>(
    'SELECT data_visita, periodo, count(*)::int AS n, count(migrado_em)::int AS migradas FROM visitas GROUP BY 1, 2',
  );
  const grupos: Record<string, number> = {};
  let total = 0;
  let migradas = 0;
  for (const l of linhas) {
    grupos[`${l.data_visita}|${l.periodo}`] = l.n;
    total += l.n;
    migradas += l.migradas;
  }
  return { total, migradas, grupos };
}

export function enderecoCompleto(v: Pick<Visita, 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'>): string {
  const linha1 = [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - ');
  const cidade = v.cidade && v.uf ? `${v.cidade} - ${v.uf}` : v.cidade;
  return [linha1, v.bairro, cidade].filter(Boolean).join(', ');
}

// Marca (ou desmarca) que o cadastro já foi passado para o portal oficial.
// Marcar de novo o que já estava marcado não troca a data nem o autor.
export async function marcarNoPortal(id: number, migrado: boolean, por: string): Promise<Visita | null> {
  const [v] = migrado
    ? await sql<Visita>(
        'UPDATE visitas SET migrado_em = COALESCE(migrado_em, now()), migrado_por = COALESCE(migrado_por, $2) WHERE id = $1 RETURNING *',
        [id, por],
      )
    : await sql<Visita>('UPDATE visitas SET migrado_em = NULL, migrado_por = NULL WHERE id = $1 RETURNING *', [id]);
  return v ?? null;
}

// Descobre a posição da casa no mapa. Quem cadastrou pelo GPS do celular já tem posição exata.
export async function localizarVisita(id: number): Promise<boolean> {
  const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
  if (!v || v.precisao === 'gps' || v.precisao === 'numero') return false;
  const pos = await localizarEndereco({ rua: v.endereco, numero: v.numero, bairro: v.bairro, cidade: v.cidade, uf: v.uf });
  if (!pos) return false;
  // Sem bairro nem nos Correios: fica o distrito do ponto encontrado, só como referência.
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

export type ResultadoBairro = { situacao: 'corrigido' | 'igual' | 'nao_achou' | 'mantido'; antes: string; depois: string };

// Confere o bairro pela rua na base dos Correios. Com "sobrescrever", troca também o bairro
// que já estava gravado (o valor antigo fica guardado em bairro_informado).
export async function conferirBairro(id: number, sobrescrever: boolean): Promise<ResultadoBairro> {
  const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
  const antes = v?.bairro ?? '';
  if (!v) return { situacao: 'nao_achou', antes, depois: antes };
  if (antes && !sobrescrever) return { situacao: 'mantido', antes, depois: antes };
  const achado = await bairroDaRua({ rua: v.endereco, numero: v.numero, cidade: v.cidade, uf: v.uf, cep: v.cep });
  if (!achado) return { situacao: 'nao_achou', antes, depois: antes };
  if (semAcento(achado.bairro) === semAcento(antes)) {
    await sql('UPDATE visitas SET cep = $2 WHERE id = $1', [id, achado.cep]);
    return { situacao: 'igual', antes, depois: antes };
  }
  await sql(
    `UPDATE visitas SET bairro = $2, cep = $3,
       bairro_informado = COALESCE(bairro_informado, NULLIF($4, ''))
     WHERE id = $1`,
    [id, achado.bairro, achado.cep, antes],
  );
  return { situacao: 'corrigido', antes, depois: achado.bairro };
}

export type BairroCorrigido = { id: number; responsavel: string; endereco: string; antes: string; depois: string };

// Confere de novo o bairro de todas as visitas (ou das escolhidas) pela rua, na base dos Correios.
export async function reconferirBairros(ids?: number[]) {
  const visitas = await sql<{ id: number; responsavel: string; endereco: string; numero: string }>(
    `SELECT id, responsavel, endereco, numero FROM visitas ${ids?.length ? 'WHERE id = ANY($1::int[])' : ''} ORDER BY endereco, id`,
    ids?.length ? [ids] : [],
  );
  const corrigidas: BairroCorrigido[] = [];
  let iguais = 0;
  let naoAchadas = 0;
  let proxima = 0;
  // Poucas consultas ao mesmo tempo, para não abusar do serviço dos Correios
  const trabalhar = async () => {
    while (proxima < visitas.length) {
      const v = visitas[proxima++];
      const r = await conferirBairro(v.id, true).catch(() => null);
      if (!r || r.situacao === 'nao_achou') naoAchadas++;
      else if (r.situacao === 'corrigido') corrigidas.push({ id: v.id, responsavel: v.responsavel, endereco: `${v.endereco}, ${v.numero}`, antes: r.antes, depois: r.depois });
      else iguais++;
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
  corrigidas.sort((a, b) => a.id - b.id);
  return { conferidas: visitas.length, corrigidas, iguais, naoAchadas };
}
