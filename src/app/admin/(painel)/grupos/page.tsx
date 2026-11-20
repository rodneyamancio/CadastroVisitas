import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS } from '@/lib/config';
import { sql } from '@/lib/db';
import { listarGrupos, pessoasParaLiderar, resumoDosGrupos } from '@/lib/grupos';
import { ultimoRoteiro } from '@/lib/roteiro';
import { BotaoRoteiro } from './Botoes';
import FormularioGrupo from './FormularioGrupo';

const AVISOS: Record<string, { texto: string; erro?: boolean }> = {
  excluido: { texto: 'Grupo excluído. As visitas dele voltaram para "sem grupo".' },
  roteiro: { texto: 'Grupos criados pelo roteiro da IA. Agora escolha o líder de cada um.' },
  'roteiro-vazio': { texto: 'Nenhum grupo foi criado: todas as visitas do roteiro já estão em algum grupo.', erro: true },
  'sem-roteiro': { texto: 'Ainda não há roteiro montado. Monte um no Assistente de IA.', erro: true },
};

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// "Sáb. manhã": dia e horário em poucas letras
const parteCurta = (chave: string) => {
  const [dia, periodo] = chave.split('|');
  const d = DIAS.find((x) => x.valor === dia);
  const p = PERIODOS.find((x) => x.valor === periodo);
  return `${d ? d.semana.slice(0, 3) : dia}. ${p ? p.nome.toLowerCase() : periodo}`;
};
const ordemDaParte = (chave: string) => {
  const [dia, periodo] = chave.split('|');
  return DIAS.findIndex((d) => d.valor === dia) * 10 + PERIODOS.findIndex((p) => p.valor === periodo);
};

export default async function Grupos({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === 'string' ? AVISOS[sp.aviso] : undefined;
  const [grupos, resumo, pessoas, roteiro] = await Promise.all([listarGrupos(), resumoDosGrupos(), pessoasParaLiderar(), ultimoRoteiro()]);
  const emGrupos = resumo.visitas - resumo.semGrupo;
  // O roteiro só serve para as visitas que ainda estão sem grupo
  const livres = roteiro && resumo.semGrupo ? new Set((await sql<{ id: number }>('SELECT id FROM visitas WHERE grupo_id IS NULL')).map((v) => v.id)) : new Set<number>();
  const gruposDoRoteiro = roteiro?.plano.grupos.filter((g) => g.visitas.some((id) => livres.has(id))) ?? [];
  const visitasDoRoteiro = gruposDoRoteiro.reduce((n, g) => n + g.visitas.filter((id) => livres.has(id)).length, 0);

  const cartoes = [
    { rotulo: 'Grupos', valor: String(resumo.grupos), detalhe: `${grupos.filter((g) => !g.lider_id).length} sem líder` },
    { rotulo: 'Visitas em grupos', valor: `${emGrupos} de ${resumo.visitas}`, detalhe: resumo.visitas ? `${Math.round((emGrupos / resumo.visitas) * 100)}% distribuídas` : '' },
    { rotulo: 'Sem grupo', valor: String(resumo.semGrupo), detalhe: resumo.semGrupo ? 'Distribuir visitas' : 'nada a distribuir', href: resumo.semGrupo ? '/admin/grupos/distribuir' : undefined, alerta: resumo.semGrupo > 0 },
    { rotulo: 'Visitas feitas', valor: `${resumo.feitas} de ${resumo.visitas}`, detalhe: resumo.lancadas ? `${resumo.lancadas} ${resumo.lancadas === 1 ? 'lançada' : 'lançadas'} pelos líderes` : 'nenhuma lançada pelos líderes' },
  ];

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Grupos de visita</h1>
        <p className="text-sm text-stone-600">
          Cada grupo tem um líder e as visitas que vai fazer. O líder entra pelo celular, vê só as visitas dele, marca as que foram feitas e escreve comentários.
        </p>
      </div>
      {aviso && (
        <p className={`rounded-lg p-3 text-sm font-semibold ${aviso.erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`} role="status">
          {aviso.texto}
        </p>
      )}

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cartoes.map((c) => (
          <div key={c.rotulo} className={`rounded-xl border bg-white p-4 ${c.alerta ? 'border-amber-300' : 'border-stone-200'}`}>
            <p className="text-sm font-semibold text-stone-600">{c.rotulo}</p>
            <p className="text-2xl font-extrabold text-stone-900">{c.valor}</p>
            {c.href ? (
              <Link href={c.href} className="text-sm font-semibold text-emerald-800 underline">
                {c.detalhe}
              </Link>
            ) : (
              <p className="text-sm text-stone-500">{c.detalhe}</p>
            )}
          </div>
        ))}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section aria-label="Lista de grupos">
          {grupos.length === 0 ? (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
              Ainda não há grupos. Crie o primeiro ao lado{gruposDoRoteiro.length ? ' ou aproveite o roteiro da IA' : ''}.
            </p>
          ) : (
            <ul className="grid gap-3 xl:grid-cols-2">
              {grupos.map((g) => (
                <li key={g.id}>
                  <Link href={`/admin/grupos/${g.id}`} className="block rounded-xl border border-stone-200 bg-white p-4 hover:border-emerald-600">
                    <div className="flex items-start justify-between gap-3">
                      <h2 className="text-base font-extrabold text-stone-900">{g.nome}</h2>
                      <span className="shrink-0 text-sm font-semibold text-stone-600">
                        {g.total} {g.total === 1 ? 'visita' : 'visitas'}
                      </span>
                    </div>
                    <p className="mt-0.5 text-sm">
                      {g.lider_nome ? (
                        <span className="text-stone-700">
                          Líder: <strong>{g.lider_nome}</strong>
                          {g.lider_ativo === false ? ' (desativado)' : ''}
                        </span>
                      ) : (
                        <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Sem líder</span>
                      )}
                    </p>
                    {g.observacao && <p className="mt-1 text-sm text-stone-500">{g.observacao}</p>}
                    {g.total > 0 && (
                      <>
                        <p className="mt-2 flex flex-wrap gap-1.5 text-xs font-semibold text-stone-700">
                          {Object.entries(g.partes)
                            .sort((a, b) => ordemDaParte(a[0]) - ordemDaParte(b[0]))
                            .map(([chave, n]) => (
                              <span key={chave} className="rounded-full bg-stone-100 px-2.5 py-0.5">
                                {parteCurta(chave)}: {n}
                              </span>
                            ))}
                          {g.lancadas > 0 && (
                            <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-900">
                              {g.lancadas} {g.lancadas === 1 ? 'lançada pelo líder' : 'lançadas pelo líder'}
                            </span>
                          )}
                        </p>
                        <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200">
                          <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(g.feitas / g.total) * 100}%` }} />
                        </div>
                        <p className="mt-1 text-xs text-stone-600">
                          {g.feitas} de {g.total} {g.total === 1 ? 'feita' : 'feitas'}
                        </p>
                      </>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <aside className="space-y-4 print:hidden">
          <FormularioGrupo pessoas={pessoas} />
          <div className="space-y-2 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
            <h2 className="text-lg font-extrabold text-stone-900">Ajuda para montar os grupos</h2>
            {gruposDoRoteiro.length > 0 && roteiro ? (
              <>
                <p>
                  O roteiro da IA de {quando.format(roteiro.criado_em)} junta as casas próximas em {gruposDoRoteiro.length} {gruposDoRoteiro.length === 1 ? 'grupo' : 'grupos'} com{' '}
                  {visitasDoRoteiro} {visitasDoRoteiro === 1 ? 'visita' : 'visitas'} que ainda estão sem grupo. Cada grupo já vem com as visitas na ordem do trajeto.
                </p>
                <BotaoRoteiro grupos={gruposDoRoteiro.length} visitas={visitasDoRoteiro} />
              </>
            ) : (
              <p>
                O{' '}
                <Link href="/admin/assistente" className="font-semibold text-emerald-800 underline">
                  Assistente de IA
                </Link>{' '}
                junta as casas próximas em roteiros. {roteiro ? 'As visitas do último roteiro já estão em grupos.' : 'Depois de montar um roteiro, dá para criar os grupos a partir dele aqui.'}
              </p>
            )}
            <p>
              Em <strong>Distribuir visitas</strong>, o sistema sugere para cada visita sem grupo o grupo que tem a casa mais perto no mesmo dia e horário.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
