import { z } from 'zod';
import { registrar } from './auditoria';
import { parecido, partesDaRua, semAcento } from './bairro';
import { nomeDia, nomePeriodo } from './config';
import { iaPronta } from './configuracoes';
import { sql } from './db';
import { gerarJson } from './ia';
import type { Visita } from './visitas';

// Procura cadastros repetidos: compara cada visita com as que já existiam, por telefone,
// nome e endereço. Quando há uma IA conectada, ela olha os casos parecidos e dá o parecer;
// sem IA (ou se ela falhar), valem só as regras.

type Base = Pick<Visita, 'id' | 'responsavel' | 'telefone' | 'endereco' | 'numero' | 'complemento' | 'bairro' | 'data_visita' | 'periodo'>;
const CAMPOS = 'id, responsavel, telefone, endereco, numero, complemento, bairro, data_visita, periodo';

const PARTICULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e']);
const palavrasDoNome = (nome: string) =>
  semAcento(nome)
    .split(' ')
    .filter((p) => p && !PARTICULAS.has(p));

// 0 a 1. Aceita erro de digitação, abreviação ("Ap." = Aparecida) e nome curto contido no
// nome completo ("Maria Silva" x "Maria Aparecida da Silva").
export function semelhancaDeNomes(a: string, b: string): number {
  const pa = palavrasDoNome(a);
  const pb = palavrasDoNome(b);
  if (!pa.length || !pb.length) return 0;
  const inteiro = parecido(pa.join(' '), pb.join(' '));
  const [menor, maior] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  if (menor.length < 2) return inteiro;
  const mesmaPalavra = (p: string, q: string) => parecido(p, q) >= 0.8 || (p.length <= 2 && q.startsWith(p)) || (q.length <= 2 && p.startsWith(q));
  const usadas = new Set<number>();
  let achadas = 0;
  for (const p of menor) {
    const i = maior.findIndex((q, k) => !usadas.has(k) && mesmaPalavra(p, q));
    if (i >= 0) {
      usadas.add(i);
      achadas++;
    }
  }
  let contido = (achadas / menor.length) * (0.75 + 0.25 * (menor.length / maior.length));
  // Primeiro nome diferente quase sempre é outra pessoa da família
  if (!mesmaPalavra(pa[0], pb[0])) contido *= 0.7;
  return Math.max(inteiro, contido);
}

// Mesmo número, com ou sem o 9 na frente
export function mesmoTelefone(a: string, b: string): boolean {
  const da = a.replace(/\D/g, '');
  const db = b.replace(/\D/g, '');
  if (da.length < 10 || db.length < 10) return false;
  return da === db || (da.slice(0, 2) === db.slice(0, 2) && da.slice(-8) === db.slice(-8));
}

function compararEndereco(a: Base, b: Base) {
  const ra = partesDaRua(a.endereco);
  const rb = partesDaRua(b.endereco);
  const rua = Math.max(parecido(ra.nome, rb.nome), parecido(ra.semTitulo, rb.semTitulo));
  const numero = (n: string) => n.replace(/\D/g, '').replace(/^0+/, '');
  const mesmoNumero = numero(a.numero) !== '' && numero(a.numero) === numero(b.numero);
  const ca = semAcento(a.complemento ?? '').replace(/ /g, '');
  const cb = semAcento(b.complemento ?? '').replace(/ /g, '');
  return { mesmaRua: rua >= 0.88, mesmoNumero, complementoDiferente: ca !== '' && cb !== '' && ca !== cb };
}

export type Comparacao = { motivos: string[]; fortes: number; candidata: boolean; mesmoTelefone: boolean; nomeParecido: boolean; mesmaCasa: boolean };

// Compara dois cadastros pelas regras. "fortes" conta os sinais que, sozinhos, já levantam suspeita.
export function comparar(a: Base, b: Base): Comparacao {
  const telefone = mesmoTelefone(a.telefone, b.telefone);
  const nome = semelhancaDeNomes(a.responsavel, b.responsavel);
  const e = compararEndereco(a, b);
  const mesmaCasa = e.mesmaRua && e.mesmoNumero && !e.complementoDiferente;
  const mesmoPredio = e.mesmaRua && e.mesmoNumero && e.complementoDiferente;
  const motivos: string[] = [];
  if (telefone) motivos.push('mesmo telefone');
  // "Mesmo nome" só quando está escrito igual (a menos de acento ou de uma letra); abreviado ou incompleto é "parecido"
  if (parecido(palavrasDoNome(a.responsavel).join(' '), palavrasDoNome(b.responsavel).join(' ')) >= 0.95) motivos.push('mesmo nome');
  else if (nome >= 0.85) motivos.push('nome parecido');
  if (mesmaCasa) motivos.push('mesmo endereço');
  else if (mesmoPredio) motivos.push('mesma rua e número, com complemento diferente');
  const fortes = Number(telefone) + Number(nome >= 0.85) + Number(mesmaCasa);
  return {
    motivos,
    fortes,
    candidata: fortes > 0 || mesmoPredio || nome >= 0.7 || (e.mesmaRua && nome >= 0.5),
    mesmoTelefone: telefone,
    nomeParecido: nome >= 0.85,
    mesmaCasa,
  };
}

// O que quem está cadastrando pode ver de um cadastro parecido: só o que ele mesmo já digitou
// de forma parecida. Telefone igual não revela o nome nem o endereço de ninguém, e vice-versa.
export type Parecida = { id: number; motivos: string[]; nome: string | null; endereco: string | null; visita: string };

// Antes de gravar: há algum cadastro parecido com estes dados? Só pelas regras, para responder na hora.
export async function parecidasCom(dados: { responsavel: string; telefone: string; endereco: string; numero: string; complemento: string | null }): Promise<Parecida[]> {
  const novo: Base = { id: 0, bairro: null, data_visita: '', periodo: '', ...dados };
  const todas = await sql<Base>(`SELECT ${CAMPOS} FROM visitas ORDER BY id`);
  return todas
    .map((v) => ({ v, c: comparar(novo, v) }))
    .filter((x) => x.c.fortes > 0)
    .sort((a, b) => b.c.fortes - a.c.fortes || b.v.id - a.v.id)
    .slice(0, 3)
    .map(({ v, c }) => ({
      id: v.id,
      motivos: c.motivos,
      nome: c.nomeParecido ? v.responsavel : null,
      endereco: c.mesmaCasa ? [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - ') : null,
      visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
    }));
}

const EsquemaParecer = z.object({
  analises: z.array(
    z.object({
      id: z.number().int(),
      veredito: z.enum(['mesma_familia', 'talvez', 'diferente']),
      motivo: z.string(),
    }),
  ),
});

const SISTEMA = `Você ajuda a coordenação de uma missão de igreja a achar cadastros repetidos de famílias que pediram visita em casa.
Você recebe um cadastro novo e uma lista de cadastros que já existiam e têm algo parecido com ele. Para cada cadastro da lista, diga se é a mesma família (a mesma casa a visitar) que a do cadastro novo.

Como julgar:
- Os dados foram digitados no celular: aceite erros de digitação, abreviações, falta de acento, nome incompleto e rua escrita de outro jeito ("R." = "Rua", "Av." = "Avenida").
- A visita é feita na casa. Duas pessoas no mesmo endereço (mesma rua, mesmo número e mesmo complemento) são a mesma casa: "mesma_familia".
- Mesmo prédio ou mesmo terreno com complemento diferente (outro apartamento, casa dos fundos, outra casa do quintal) costuma ser outra família: "diferente", a não ser que o nome ou o telefone indiquem a mesma pessoa.
- "mesmo_telefone" verdadeiro com nome e endereço diferentes costuma ser alguém que cadastrou várias famílias com o próprio telefone: "diferente" ou "talvez".
- Nome igual ou quase igual em endereço bem diferente pode ser homônimo: "talvez".
- Use "talvez" quando não der para decidir.

Responda para todos os cadastros da lista, usando o "id" de cada um. Em "motivo", escreva uma frase curta em português simples dizendo o que pesou.`;

type Veredito = z.infer<typeof EsquemaParecer>['analises'][number];

async function parecerDaIA(nova: Base, lista: { v: Base; c: Comparacao }[]): Promise<Map<number, Veredito> | null> {
  const ia = await iaPronta();
  if (!ia || !lista.length) return null;
  // Para a IA vão nome, endereço e dia da visita. O telefone não vai: só se é o mesmo ou não.
  const resumo = (v: Base) => ({
    id: v.id,
    nome: v.responsavel,
    rua: v.endereco,
    numero: v.numero,
    complemento: v.complemento ?? '',
    bairro: v.bairro ?? '',
    visita: `${nomeDia(v.data_visita)}, ${nomePeriodo(v.periodo)}`,
  });
  const usuario = [
    'Cadastro novo:',
    JSON.stringify(resumo(nova)),
    '',
    `Cadastros que já existiam (${lista.length}):`,
    JSON.stringify(lista.map(({ v, c }) => ({ ...resumo(v), mesmo_telefone: c.mesmoTelefone }))),
  ].join('\n');
  try {
    const r = await gerarJson(ia, { sistema: SISTEMA, usuario, esquema: EsquemaParecer, nome: 'duplicidades' });
    return new Map(r.analises.map((a) => [a.id, a]));
  } catch (e) {
    console.error('Falha da IA ao analisar duplicidade do cadastro', nova.id, e);
    return null;
  }
}

export type Apontada = { outra: Base; motivos: string[]; grau: 'alta' | 'media'; parecer: string | null; porIa: boolean };

// Confere um cadastro contra os que já existiam antes dele e grava o que achar. Com "todas"
// (depois de uma edição), compara com todos os outros e refaz os pares em aberto desse cadastro.
export async function conferirDuplicidade(id: number, anotar = true, todas = false): Promise<Apontada[]> {
  const [nova] = await sql<Base>(`SELECT ${CAMPOS} FROM visitas WHERE id = $1`, [id]);
  if (!nova) return [];
  if (todas) await sql('DELETE FROM duplicidades WHERE descartada_em IS NULL AND (visita_id = $1 OR outra_id = $1)', [id]);
  const anteriores = await sql<Base>(`SELECT ${CAMPOS} FROM visitas WHERE ${todas ? 'id <> $1' : 'id < $1'} ORDER BY id`, [id]);
  const candidatas = anteriores
    .map((v) => ({ v, c: comparar(nova, v) }))
    .filter((x) => x.c.candidata)
    .sort((a, b) => b.c.fortes - a.c.fortes || b.c.motivos.length - a.c.motivos.length)
    .slice(0, 15);
  if (!candidatas.length) return [];

  const pareceres = await parecerDaIA(nova, candidatas);
  const apontadas: Apontada[] = [];
  for (const { v, c } of candidatas) {
    const p = pareceres?.get(v.id);
    let grau: 'alta' | 'media' | null = null;
    if (c.fortes >= 2) grau = 'alta';
    else if (c.fortes === 1) grau = p?.veredito === 'diferente' ? null : p?.veredito === 'mesma_familia' ? 'alta' : 'media';
    else if (p?.veredito === 'mesma_familia') grau = 'media';
    if (!grau) continue;
    apontadas.push({
      outra: v,
      motivos: c.motivos.length ? c.motivos : ['apontada pela IA'],
      grau,
      parecer: p?.motivo.trim().slice(0, 400) || null,
      porIa: Boolean(p),
    });
  }

  for (const a of apontadas) {
    const [linha] = await sql<{ nova: boolean }>(
      `INSERT INTO duplicidades (visita_id, outra_id, motivos, grau, parecer, por_ia) VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (visita_id, outra_id) DO UPDATE SET motivos = EXCLUDED.motivos, grau = EXCLUDED.grau, parecer = EXCLUDED.parecer, por_ia = EXCLUDED.por_ia
       RETURNING (xmax = 0) AS nova`,
      // O par fica sempre como (mais novo, mais antigo)
      [Math.max(id, a.outra.id), Math.min(id, a.outra.id), a.motivos, a.grau, a.parecer, a.porIa],
    );
    if (linha?.nova && anotar) {
      await registrar('visita.duplicidade', { nome: 'Sistema' }, `Nº ${nova.id} · ${nova.responsavel}`, {
        'parecido com': `Nº ${a.outra.id} · ${a.outra.responsavel}`,
        motivos: a.motivos.join(', '),
        certeza: a.grau === 'alta' ? 'alta' : 'média',
        análise: a.porIa ? 'regras e IA' : 'só regras',
        ...(a.parecer ? { 'parecer da IA': a.parecer } : {}),
      });
    }
  }
  return apontadas;
}

// Verifica de novo todos os cadastros. O que já foi marcado como "não é repetido" continua assim.
export async function reconferirDuplicidades(): Promise<{ conferidas: number; apontadas: number; comIa: boolean }> {
  const visitas = await sql<{ id: number }>('SELECT id FROM visitas ORDER BY id');
  await sql('DELETE FROM duplicidades WHERE descartada_em IS NULL');
  let proxima = 0;
  const trabalhar = async () => {
    while (proxima < visitas.length) {
      const { id } = visitas[proxima++];
      await conferirDuplicidade(id, false).catch((e) => console.error('Falha ao conferir duplicidade', id, e));
    }
  };
  await Promise.all([trabalhar(), trabalhar(), trabalhar()]);
  const [{ n }] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM duplicidades WHERE descartada_em IS NULL');
  return { conferidas: visitas.length, apontadas: n, comIa: Boolean(await iaPronta()) };
}

export type Par = {
  id: number;
  motivos: string[];
  grau: 'alta' | 'media';
  parecer: string | null;
  por_ia: boolean;
  descartada_em: Date | null;
  descartada_por: string | null;
  criado_em: Date;
  nova: Visita;
  antiga: Visita;
};

export async function listarDuplicidades(situacao: 'abertas' | 'descartadas'): Promise<Par[]> {
  const pares = await sql<Omit<Par, 'nova' | 'antiga'> & { visita_id: number; outra_id: number }>(
    `SELECT * FROM duplicidades WHERE descartada_em IS ${situacao === 'abertas' ? 'NULL' : 'NOT NULL'}
     ORDER BY (grau = 'alta') DESC, visita_id DESC, outra_id DESC`,
  );
  if (!pares.length) return [];
  const visitas = await sql<Visita>('SELECT * FROM visitas WHERE id = ANY($1::int[])', [[...new Set(pares.flatMap((p) => [p.visita_id, p.outra_id]))]]);
  const porId = new Map(visitas.map((v) => [v.id, v]));
  return pares.flatMap((p) => {
    const nova = porId.get(p.visita_id);
    const antiga = porId.get(p.outra_id);
    return nova && antiga ? [{ ...p, nova, antiga }] : [];
  });
}

export const totalDeDuplicidades = async () => (await sql<{ n: number }>('SELECT count(*)::int AS n FROM duplicidades WHERE descartada_em IS NULL'))[0].n;

export type Suspeita = { par: number; id: number; responsavel: string };

// Para cada visita, com quais outras ela pode estar repetida (só os casos em aberto).
export async function suspeitasPorVisita(): Promise<Map<number, Suspeita[]>> {
  const linhas = await sql<{ par: number; a: number; b: number; nome_a: string; nome_b: string }>(
    `SELECT d.id AS par, d.visita_id AS a, d.outra_id AS b, va.responsavel AS nome_a, vb.responsavel AS nome_b
     FROM duplicidades d JOIN visitas va ON va.id = d.visita_id JOIN visitas vb ON vb.id = d.outra_id
     WHERE d.descartada_em IS NULL ORDER BY d.id`,
  );
  const mapa = new Map<number, Suspeita[]>();
  const juntar = (de: number, s: Suspeita) => mapa.set(de, [...(mapa.get(de) ?? []), s]);
  for (const l of linhas) {
    juntar(l.a, { par: l.par, id: l.b, responsavel: l.nome_b });
    juntar(l.b, { par: l.par, id: l.a, responsavel: l.nome_a });
  }
  return mapa;
}

export async function resolverDuplicidade(id: number, descartar: boolean, por: string) {
  type Linha = { id: number; visita_id: number; outra_id: number };
  const [d] = descartar
    ? await sql<Linha>('UPDATE duplicidades SET descartada_em = now(), descartada_por = $2 WHERE id = $1 RETURNING id, visita_id, outra_id', [id, por])
    : await sql<Linha>('UPDATE duplicidades SET descartada_em = NULL, descartada_por = NULL WHERE id = $1 RETURNING id, visita_id, outra_id', [id]);
  return d ?? null;
}
