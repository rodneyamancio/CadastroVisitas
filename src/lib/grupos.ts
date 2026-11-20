import { semAcento } from './bairro';
import { DIAS, PERIODOS, nomeDia, nomePeriodo } from './config';
import { sql } from './db';
import { emMetros, ordenar, type Roteiro } from './roteiro';
import { enderecoCompleto, type Visita } from './visitas';

// Grupos que saem para fazer as visitas. Cada grupo tem um líder (um usuário do sistema) e
// recebe visitas de qualquer dia e horário. O líder vê só as visitas dos grupos dele, na área /lider.

export type Grupo = {
  id: number;
  nome: string;
  lider_id: number | null;
  observacao: string | null;
  criado_em: Date;
  criado_por: string | null;
};

export type GrupoResumo = Grupo & {
  lider_nome: string | null;
  lider_email: string | null;
  lider_telefone: string | null;
  lider_ativo: boolean | null;
  total: number;
  feitas: number;
  lancadas: number;
  // Quantas visitas em cada dia e horário: chave "AAAA-MM-DD|periodo"
  partes: Record<string, number>;
};

const numerico = new Intl.Collator('pt-BR', { numeric: true, sensitivity: 'base' });

export async function listarGrupos(): Promise<GrupoResumo[]> {
  const grupos = await sql<GrupoResumo>(
    `SELECT g.*, u.nome AS lider_nome, u.email AS lider_email, u.telefone AS lider_telefone, u.ativo AS lider_ativo,
            COALESCE(v.total, 0)::int AS total, COALESCE(v.feitas, 0)::int AS feitas, COALESCE(v.lancadas, 0)::int AS lancadas,
            COALESCE(v.partes, '{}'::jsonb) AS partes
     FROM grupos g
     LEFT JOIN usuarios u ON u.id = g.lider_id
     LEFT JOIN LATERAL (
       SELECT sum(n) AS total, sum(feitas) AS feitas, sum(lancadas) AS lancadas, jsonb_object_agg(chave, n) AS partes
       FROM (
         SELECT data_visita::text || '|' || periodo AS chave, count(*)::int AS n, count(feita_em)::int AS feitas, count(lancada_por)::int AS lancadas
         FROM visitas WHERE grupo_id = g.id GROUP BY 1
       ) p
     ) v ON TRUE`,
  );
  // "Grupo 2" antes de "Grupo 10"
  return grupos.sort((a, b) => numerico.compare(a.nome, b.nome) || a.id - b.id);
}

export async function grupoPorId(id: number): Promise<GrupoResumo | null> {
  return (await listarGrupos()).find((g) => g.id === id) ?? null;
}

// Para as listas de escolha (nova visita, editar visita, distribuir)
export type OpcaoDeGrupo = { id: number; nome: string; lider: string | null };

export async function opcoesDeGrupo(): Promise<OpcaoDeGrupo[]> {
  const linhas = await sql<OpcaoDeGrupo>('SELECT g.id, g.nome, u.nome AS lider FROM grupos g LEFT JOIN usuarios u ON u.id = g.lider_id');
  return linhas.sort((a, b) => numerico.compare(a.nome, b.nome) || a.id - b.id);
}

export const nomeDaOpcao = (g: OpcaoDeGrupo) => (g.lider ? `${g.nome} (${g.lider})` : g.nome);

// Quem pode liderar um grupo: os líderes cadastrados e também as pessoas do painel
export type PessoaParaLiderar = { id: number; nome: string; lider: boolean };

export const pessoasParaLiderar = () =>
  sql<PessoaParaLiderar>("SELECT id, nome, perfil = 'lider' AS lider FROM usuarios WHERE ativo AND NOT aguardando_aprovacao ORDER BY nome");

export type ResumoDosGrupos = { grupos: number; visitas: number; semGrupo: number; feitas: number; lancadas: number };

export async function resumoDosGrupos(): Promise<ResumoDosGrupos> {
  const [r] = await sql<ResumoDosGrupos & { sem_grupo: number }>(
    `SELECT (SELECT count(*) FROM grupos)::int AS grupos, count(*)::int AS visitas, count(*) FILTER (WHERE grupo_id IS NULL)::int AS sem_grupo,
            count(feita_em)::int AS feitas, count(lancada_por)::int AS lancadas
     FROM visitas`,
  );
  return { grupos: r.grupos, visitas: r.visitas, semGrupo: r.sem_grupo, feitas: r.feitas, lancadas: r.lancadas };
}

const ORDEM_NO_GRUPO = 'data_visita, periodo, ordem NULLS LAST, bairro NULLS LAST, endereco, id';

export const visitasDoGrupo = (id: number) => sql<Visita>(`SELECT * FROM visitas WHERE grupo_id = $1 ORDER BY ${ORDEM_NO_GRUPO}`, [id]);

export const visitasSemGrupo = () => sql<Visita>('SELECT * FROM visitas WHERE grupo_id IS NULL ORDER BY data_visita, periodo, bairro NULLS LAST, endereco, id');

export type Movida = { id: number; responsavel: string; de: number | null; para: number | null };

// Coloca cada visita no grupo indicado (nulo = tira do grupo). Só mexe no que de fato muda;
// a visita que troca de grupo perde a ordem do trajeto.
export async function colocarNoGrupo(pares: { id: number; grupo: number | null }[]): Promise<Movida[]> {
  const movidas: Movida[] = [];
  for (const p of pares) {
    const [v] = await sql<{ id: number; responsavel: string; de: number | null }>(
      `UPDATE visitas v SET grupo_id = $2, ordem = NULL
       FROM (SELECT id, grupo_id AS de FROM visitas WHERE id = $1) antes
       WHERE v.id = antes.id AND v.grupo_id IS DISTINCT FROM $2
       RETURNING v.id, v.responsavel, antes.de`,
      [p.id, p.grupo],
    );
    if (v) movidas.push({ ...v, para: p.grupo });
  }
  return movidas;
}

// Ordem das visitas do grupo em cada dia e horário: começa pela casa mais afastada e segue
// sempre para a mais próxima (a mesma conta dos roteiros da IA). Devolve o percurso total em metros.
export async function ordenarPeloTrajeto(grupoId: number): Promise<{ visitas: number; distanciaM: number | null }> {
  const visitas = await visitasDoGrupo(grupoId);
  const posicoes = new Map(visitas.map((v) => [v.id, emMetros(v)]));
  let distancia: number | null = null;
  for (const d of DIAS) {
    for (const p of PERIODOS) {
      const ids = visitas.filter((v) => v.data_visita === d.valor && v.periodo === p.valor).map((v) => v.id);
      if (!ids.length) continue;
      const { ordem, distanciaM } = ordenar(ids, posicoes);
      if (distanciaM != null) distancia = (distancia ?? 0) + distanciaM;
      await sql(
        `UPDATE visitas v SET ordem = o.ordem FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ordem) WHERE v.id = o.id`,
        [ordem],
      );
    }
  }
  return { visitas: visitas.length, distanciaM: distancia };
}

export type Sugestao = { grupo: number; motivo: string };

const LONGE_M = 2500;

// Para cada visita sem grupo, o grupo que mais combina: o que tem a casa mais perto no mesmo dia
// e horário (até 2,5 km) ou, sem posição no mapa, o que mais tem casas do mesmo bairro.
export function sugerirGrupos(semGrupo: Visita[], comGrupo: Visita[]): Map<number, Sugestao> {
  const sugestoes = new Map<number, Sugestao>();
  const posicao = new Map(comGrupo.map((v) => [v.id, emMetros(v)]));
  for (const v of semGrupo) {
    const candidatas = comGrupo.filter((c) => c.grupo_id != null && c.data_visita === v.data_visita && c.periodo === v.periodo);
    if (!candidatas.length) continue;
    const aqui = emMetros(v);
    if (aqui) {
      let melhor: { grupo: number; d: number } | null = null;
      for (const c of candidatas) {
        const la = posicao.get(c.id);
        if (!la) continue;
        const d = Math.hypot(la.x - aqui.x, la.y - aqui.y);
        if (!melhor || d < melhor.d) melhor = { grupo: c.grupo_id!, d };
      }
      if (melhor && melhor.d <= LONGE_M) {
        const d = Math.round(melhor.d);
        sugestoes.set(v.id, { grupo: melhor.grupo, motivo: d < 1000 ? `casa a ${Math.max(d, 10)} m` : `casa a ${(d / 1000).toFixed(1).replace('.', ',')} km` });
        continue;
      }
    }
    if (!v.bairro) continue;
    const porGrupo = new Map<number, number>();
    for (const c of candidatas) {
      if (c.bairro && semAcento(c.bairro) === semAcento(v.bairro)) porGrupo.set(c.grupo_id!, (porGrupo.get(c.grupo_id!) ?? 0) + 1);
    }
    const [mais] = [...porGrupo].sort((a, b) => b[1] - a[1]);
    if (mais) sugestoes.set(v.id, { grupo: mais[0], motivo: 'mesmo bairro' });
  }
  return sugestoes;
}

// Cria um grupo para cada grupo do roteiro montado pela IA e já coloca nele as visitas que
// ainda estão sem grupo, na ordem do trajeto. Visitas que já têm grupo não são mexidas.
export async function criarGruposDoRoteiro(roteiro: Roteiro, por: string): Promise<{ grupos: number; visitas: number }> {
  const livres = new Set((await sql<{ id: number }>('SELECT id FROM visitas WHERE grupo_id IS NULL')).map((v) => v.id));
  const [{ n: jaExistem }] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM grupos');
  let grupos = 0;
  let visitas = 0;
  for (const g of roteiro.plano.grupos) {
    const ids = g.visitas.filter((id) => livres.has(id));
    if (!ids.length) continue;
    grupos++;
    const observacao = [`${nomeDia(g.dia)} · ${nomePeriodo(g.periodo)}`, g.observacao].filter(Boolean).join('. ').slice(0, 400);
    const [novo] = await sql<{ id: number }>('INSERT INTO grupos (nome, observacao, criado_por) VALUES ($1, $2, $3) RETURNING id', [
      `Grupo ${jaExistem + grupos}: ${g.nome}`.slice(0, 100),
      observacao,
      por,
    ]);
    await sql(
      `UPDATE visitas v SET grupo_id = $2, ordem = o.ordem FROM unnest($1::int[]) WITH ORDINALITY AS o(id, ordem) WHERE v.id = o.id AND v.grupo_id IS NULL`,
      [ids, novo.id],
    );
    for (const id of ids) livres.delete(id);
    visitas += ids.length;
  }
  return { grupos, visitas };
}

// ---------- No dia das visitas ----------

// Marca a visita como feita. Só marca o que ainda não estava marcado: quem marcou primeiro fica registrado.
export async function marcarFeita(id: number, por: string): Promise<Visita | null> {
  const [v] = await sql<Visita>('UPDATE visitas SET feita_em = now(), feita_por = $2 WHERE id = $1 AND feita_em IS NULL RETURNING *', [id, por]);
  return v ?? null;
}

// Só a coordenação desmarca (o líder não tem esta ação).
export async function desmarcarFeita(id: number): Promise<Visita | null> {
  const [v] = await sql<Visita>('UPDATE visitas SET feita_em = NULL, feita_por = NULL WHERE id = $1 AND feita_em IS NOT NULL RETURNING *', [id]);
  return v ?? null;
}

export async function comentar(id: number, comentario: string | null, por: string): Promise<Visita | null> {
  const [v] = await sql<Visita>(
    `UPDATE visitas SET comentario = $2, comentario_em = CASE WHEN $2::text IS NULL THEN NULL ELSE now() END,
            comentario_por = CASE WHEN $2::text IS NULL THEN NULL ELSE $3 END
     WHERE id = $1 AND comentario IS DISTINCT FROM $2 RETURNING *`,
    [id, comentario, por],
  );
  return v ?? null;
}

// ---------- Área do líder ----------

export const gruposDoLider = (usuarioId: number) =>
  sql<Grupo>('SELECT * FROM grupos WHERE lider_id = $1', [usuarioId]).then((gs) => gs.sort((a, b) => numerico.compare(a.nome, b.nome) || a.id - b.id));

export const visitasDoLider = (usuarioId: number) =>
  sql<Visita>(
    `SELECT v.* FROM visitas v JOIN grupos g ON g.id = v.grupo_id WHERE g.lider_id = $1
     ORDER BY v.data_visita, v.periodo, v.ordem NULLS LAST, v.bairro NULLS LAST, v.endereco, v.id`,
    [usuarioId],
  );

// A visita só é do líder se estiver em um grupo que ele lidera.
export async function visitaDoLider(id: number, usuarioId: number): Promise<Visita | null> {
  const [v] = await sql<Visita>('SELECT v.* FROM visitas v JOIN grupos g ON g.id = v.grupo_id WHERE v.id = $1 AND g.lider_id = $2', [id, usuarioId]);
  return v ?? null;
}

// ---------- Mapa ----------

export function linkMapa(v: Pick<Visita, 'lat' | 'lng' | 'precisao' | 'endereco' | 'numero' | 'complemento' | 'bairro' | 'cidade' | 'uf'>): string {
  const alvo = v.lat != null && v.lng != null && v.precisao !== 'rua' ? `${v.lat},${v.lng}` : enderecoCompleto(v);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
}

// Trajeto no Google Maps passando pelas casas na ordem dada (o Maps aceita até 10 paradas).
export function linkTrajeto(visitas: Visita[]): string | null {
  const pontos = visitas.slice(0, 10).map((v) => (v.lat != null && v.lng != null && v.precisao !== 'rua' ? `${v.lat},${v.lng}` : enderecoCompleto(v)));
  if (pontos.length < 2) return null;
  const p = new URLSearchParams({ api: '1', origin: pontos[0], destination: pontos[pontos.length - 1], travelmode: 'driving' });
  if (pontos.length > 2) p.set('waypoints', pontos.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${p}`;
}

export const telefoneFormatado = (t: string) =>
  t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;
