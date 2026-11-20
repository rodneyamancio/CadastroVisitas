import { bairroDaRua, semAcento } from './bairro';
import { validarFamilia, texto, type DadosDaFamilia } from './criacao';
import { sql } from './db';
import { comparar, parecidasCom, type Parecida } from './duplicidade';

// Cadastros sem visita: famílias que não vão receber visita neste evento, guardadas só para a
// lista geral (base dos próximos eventos). Ficam na tabela "cadastros", separada de "visitas",
// e por isso não aparecem em nada do que controla as visitas.

export type Cadastro = {
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
  // Por que não vai ter visita neste evento
  motivo: string | null;
  criado_em: Date;
  criado_por: string | null;
};

export type DadosDoCadastro = DadosDaFamilia & { motivo: string | null };

export const formatarTelefone = (t: string) =>
  t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;

// Os nomes dos campos do formulário público são outros
const CAMPO_DO_PAINEL: Record<string, string> = { nome: 'responsavel', rua: 'endereco' };

// Mesmas regras do cadastro de visita, sem o dia e o horário. Erros com os nomes dos campos do painel.
export function validarCadastro(c: {
  responsavel?: unknown;
  telefone?: unknown;
  endereco?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cep?: unknown;
  observacoes?: unknown;
  motivo?: unknown;
}): { dados: DadosDoCadastro; erros: Record<string, string> } {
  const f = validarFamilia({
    nome: c.responsavel,
    telefone: c.telefone,
    rua: c.endereco,
    numero: c.numero,
    complemento: c.complemento,
    bairro: c.bairro,
    cep: c.cep,
    obs: c.observacoes,
  });
  const erros = Object.fromEntries(Object.entries(f.erros).map(([k, v]) => [CAMPO_DO_PAINEL[k] ?? k, v]));
  if (f.dados.cep && f.dados.cep.replace(/\D/g, '').length !== 8) erros.cep = 'O CEP tem 8 números.';
  return { dados: { ...f.dados, motivo: texto(c.motivo, 200) || null }, erros };
}

export async function criarCadastro(d: DadosDoCadastro, por: string): Promise<Cadastro> {
  const [novo] = await sql<Cadastro>(
    `INSERT INTO cadastros (responsavel, telefone, endereco, numero, complemento, bairro, cidade, uf, cep, observacoes, motivo, criado_por)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) RETURNING *`,
    [d.responsavel, d.telefone, d.endereco, d.numero, d.complemento, d.bairro, d.cidade, d.uf, d.cep, d.observacoes, d.motivo, por],
  );
  return novo;
}

// Bairro pela rua, na base dos Correios. Sem "sobrescrever", só preenche o que está em branco.
export async function conferirBairroDoCadastro(id: number, sobrescrever: boolean): Promise<void> {
  const [c] = await sql<Cadastro>('SELECT * FROM cadastros WHERE id = $1', [id]);
  if (!c || (c.bairro && !sobrescrever)) return;
  const achado = await bairroDaRua({ rua: c.endereco, numero: c.numero, cidade: c.cidade, uf: c.uf, cep: c.cep });
  if (!achado) return;
  await sql(`UPDATE cadastros SET bairro = $2, cep = COALESCE(NULLIF(cep, ''), $3) WHERE id = $1`, [
    id,
    semAcento(achado.bairro) === semAcento(c.bairro ?? '') ? c.bairro : achado.bairro,
    achado.cep,
  ]);
}

const NOMES: Record<keyof DadosDoCadastro, string> = {
  responsavel: 'Responsável',
  telefone: 'Telefone',
  endereco: 'Rua ou avenida',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cidade: 'Cidade',
  uf: 'UF',
  cep: 'CEP',
  observacoes: 'Como achar a casa',
  motivo: 'Por que não vai ter visita',
};
// O painel não edita cidade nem UF
const EDITAVEIS = ['responsavel', 'telefone', 'endereco', 'numero', 'complemento', 'bairro', 'cep', 'observacoes', 'motivo'] as const;

export type MudancaDoCadastro = { campo: string; antes: string; depois: string };

export async function editarCadastro(
  id: number,
  d: DadosDoCadastro,
): Promise<{ erro: string } | { cadastro: Cadastro; mudancas: MudancaDoCadastro[] }> {
  const [atual] = await sql<Cadastro>('SELECT * FROM cadastros WHERE id = $1', [id]);
  if (!atual) return { erro: `Não existe cadastro sem visita com o número ${id}.` };
  const mudou = EDITAVEIS.filter((c) => (d[c] ?? null) !== (atual[c] ?? null));
  if (!mudou.length) return { cadastro: atual, mudancas: [] };
  const [cadastro] = await sql<Cadastro>(`UPDATE cadastros SET ${mudou.map((c, i) => `${c} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`, [
    id,
    ...mudou.map((c) => d[c] ?? null),
  ]);
  // A rua mudou e o bairro ficou como estava: confere o bairro pelos Correios
  if (mudou.some((c) => c === 'endereco' || c === 'numero') && !mudou.includes('bairro')) {
    void conferirBairroDoCadastro(id, true).catch((e) => console.error('Falha ao conferir bairro do cadastro', id, e));
  }
  const legivel = (c: (typeof EDITAVEIS)[number], v: string | null) => (!v ? '(vazio)' : c === 'telefone' ? formatarTelefone(v) : v);
  return { cadastro, mudancas: mudou.map((c) => ({ campo: NOMES[c], antes: legivel(c, atual[c]), depois: legivel(c, d[c]) })) };
}

export async function excluirCadastro(id: number): Promise<Cadastro | null> {
  const [c] = await sql<Cadastro>('DELETE FROM cadastros WHERE id = $1 RETURNING *', [id]);
  return c ?? null;
}

// Antes de gravar: a família já está nas visitas deste evento ou nos cadastros sem visita?
// Só pelas regras (telefone, nome e endereço), para responder na hora.
export async function familiasParecidas(
  dados: Pick<DadosDoCadastro, 'responsavel' | 'telefone' | 'endereco' | 'numero' | 'complemento'>,
  foraOCadastro = 0,
): Promise<{ visitas: Parecida[]; cadastros: { cadastro: Cadastro; motivos: string[] }[] }> {
  const [visitas, todos] = await Promise.all([parecidasCom(dados), sql<Cadastro>('SELECT * FROM cadastros WHERE id <> $1 ORDER BY id', [foraOCadastro])]);
  const novo = { id: 0, bairro: null, data_visita: '', periodo: '', ...dados };
  const cadastros = todos
    .map((c) => ({ cadastro: c, r: comparar(novo, { ...c, data_visita: '', periodo: '' }) }))
    .filter((x) => x.r.fortes > 0)
    .sort((a, b) => b.r.fortes - a.r.fortes || b.cadastro.id - a.cadastro.id)
    .slice(0, 3)
    .map(({ cadastro, r }) => ({ cadastro, motivos: r.motivos }));
  return { visitas, cadastros };
}

// ---------- Lista geral: visitas deste evento + cadastros sem visita ----------

export type Familia = {
  tipo: 'visita' | 'cadastro';
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
  // Só nas visitas
  data_visita: string | null;
  periodo: string | null;
  // Só nos cadastros sem visita
  motivo: string | null;
  criado_por: string | null;
  criado_em: Date;
  // Quantas linhas da lista geral têm este telefone (mais de 1 = família talvez repetida)
  mesmo_telefone: number;
};

export type FiltrosGerais = { q?: string; tipo?: 'visita' | 'cadastro'; repetidos?: boolean };

export function lerFiltrosGerais(sp: Record<string, string | string[] | undefined>): FiltrosGerais {
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const tipo = um(sp.tipo);
  return {
    q: um(sp.q).trim().slice(0, 100) || undefined,
    tipo: tipo === 'visita' || tipo === 'cadastro' ? tipo : undefined,
    repetidos: tipo === 'repetidos' || undefined,
  };
}

export function filtrosGeraisParaUrl(f: FiltrosGerais): string {
  const p = new URLSearchParams();
  if (f.q) p.set('q', f.q);
  if (f.tipo) p.set('tipo', f.tipo);
  else if (f.repetidos) p.set('tipo', 'repetidos');
  return p.toString();
}

const CAMPOS_COMUNS = 'id, responsavel, telefone, endereco, numero, complemento, bairro, cidade, uf, cep, observacoes';

export async function listaGeral(f: FiltrosGerais = {}): Promise<Familia[]> {
  const onde: string[] = [];
  const params: unknown[] = [];
  if (f.tipo) {
    params.push(f.tipo);
    onde.push(`tipo = $${params.length}`);
  }
  if (f.repetidos) onde.push('mesmo_telefone > 1');
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    const n = params.length;
    onde.push(
      `(responsavel ILIKE $${n} OR endereco ILIKE $${n} OR bairro ILIKE $${n} OR telefone ILIKE $${n} OR observacoes ILIKE $${n} OR motivo ILIKE $${n})`,
    );
  }
  // O telefone é comparado pelo DDD e pelos 8 últimos números (com ou sem o 9 na frente)
  return sql<Familia>(
    `SELECT * FROM (
       SELECT g.*, count(*) OVER (PARTITION BY left(telefone, 2) || right(telefone, 8))::int AS mesmo_telefone
       FROM (
         SELECT 'visita' AS tipo, ${CAMPOS_COMUNS}, data_visita, periodo, NULL::text AS motivo, NULL::text AS criado_por, criado_em FROM visitas
         UNION ALL
         SELECT 'cadastro' AS tipo, ${CAMPOS_COMUNS}, NULL::date, NULL::text, motivo, criado_por, criado_em FROM cadastros
       ) g
     ) t
     ${onde.length ? `WHERE ${onde.join(' AND ')}` : ''}
     ORDER BY lower(responsavel), criado_em, id`,
    params,
  );
}

export async function resumoGeral(): Promise<{ visitas: number; semVisita: number }> {
  const [r] = await sql<{ visitas: number; sem_visita: number }>(
    'SELECT (SELECT count(*) FROM visitas)::int AS visitas, (SELECT count(*) FROM cadastros)::int AS sem_visita',
  );
  return { visitas: r.visitas, semVisita: r.sem_visita };
}
