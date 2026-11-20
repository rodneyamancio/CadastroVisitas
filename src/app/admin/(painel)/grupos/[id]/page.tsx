import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS } from '@/lib/config';
import { grupoPorId, linkTrajeto, opcoesDeGrupo, pessoasParaLiderar, telefoneFormatado, visitasDoGrupo } from '@/lib/grupos';
import { enderecoCompleto } from '@/lib/visitas';
import { ordenarGrupo } from '../../../acoes-grupos';
import BotaoImprimir from '../../assistente/BotaoImprimir';
import { BotaoExcluirGrupo, ControlesDaVisita } from '../Botoes';
import FormularioGrupo from '../FormularioGrupo';

export const metadata = { title: 'Grupo de visita' };

const diaHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default async function TelaDoGrupo({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [grupo, visitas, pessoas, opcoes] = await Promise.all([grupoPorId(id), visitasDoGrupo(id), pessoasParaLiderar(), opcoesDeGrupo()]);
  if (!grupo) notFound();
  const semOrdem = visitas.some((v) => v.ordem == null);

  return (
    <div className="space-y-5">
      <Link href="/admin/grupos" className="text-sm font-semibold text-emerald-800 underline print:hidden">
        ← Voltar para os grupos
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900">{grupo.nome}</h1>
          <p className="text-sm text-stone-600">
            {grupo.lider_nome ? (
              <>
                Líder: <strong>{grupo.lider_nome}</strong>
                {grupo.lider_telefone ? ` · ${telefoneFormatado(grupo.lider_telefone)}` : ''} · {grupo.lider_email}
                {grupo.lider_ativo === false ? ' · desativado' : ''}
              </>
            ) : (
              'Sem líder'
            )}{' '}
            · {grupo.total} {grupo.total === 1 ? 'visita' : 'visitas'} · {grupo.feitas} {grupo.feitas === 1 ? 'feita' : 'feitas'}
          </p>
          {grupo.observacao && <p className="text-sm text-stone-600">{grupo.observacao}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2 print:hidden">
          {visitas.length > 1 && (
            <form action={ordenarGrupo.bind(null, grupo.id)}>
              <button type="submit" className="adm-botao-sec" title="Põe as casas de cada dia e horário em ordem de trajeto: começa pela mais afastada e segue sempre para a mais próxima">
                Ordenar pelo trajeto
              </button>
            </form>
          )}
          <BotaoImprimir />
          <BotaoExcluirGrupo id={grupo.id} nome={grupo.nome} visitas={grupo.total} />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <section className="space-y-5" aria-label="Visitas do grupo">
          {visitas.length === 0 && (
            <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
              Este grupo ainda não tem visitas.{' '}
              <Link href="/admin/grupos/distribuir" className="font-semibold text-emerald-800 underline">
                Distribuir visitas
              </Link>
            </p>
          )}
          {visitas.length > 1 && semOrdem && (
            <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-950 print:hidden">
              Há visitas sem ordem de trajeto (entraram no grupo depois). Use <strong>Ordenar pelo trajeto</strong> para o líder ver as casas na sequência.
            </p>
          )}
          {DIAS.flatMap((d) =>
            PERIODOS.map((p) => {
              const lista = visitas.filter((v) => v.data_visita === d.valor && v.periodo === p.valor);
              if (!lista.length) return null;
              const trajeto = linkTrajeto(lista);
              return (
                <div key={`${d.valor}-${p.valor}`} className="break-inside-avoid">
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-3">
                    <h2 className="text-base font-extrabold text-stone-900">
                      {d.curto} · {p.nome}{' '}
                      <span className="font-semibold text-stone-600">
                        · {lista.length} {lista.length === 1 ? 'visita' : 'visitas'}, {lista.filter((v) => v.feita_em).length} {lista.filter((v) => v.feita_em).length === 1 ? 'feita' : 'feitas'}
                      </span>
                    </h2>
                    {trajeto && (
                      <a href={trajeto} target="_blank" rel="noopener noreferrer" className="text-sm font-semibold text-emerald-800 underline print:hidden">
                        Abrir trajeto no Google Maps
                      </a>
                    )}
                  </div>
                  <ol className="space-y-2">
                    {lista.map((v, i) => (
                      <li key={v.id} className={`rounded-xl border p-3 ${v.feita_em ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
                        <div className="flex gap-3">
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-sm font-bold text-emerald-900">{i + 1}</span>
                          <div className="min-w-0 flex-1 text-sm">
                            <p>
                              <Link href={`/admin/visitas/${v.id}`} className="font-bold text-stone-900 underline">
                                {v.responsavel}
                              </Link>{' '}
                              · {telefoneFormatado(v.telefone)} <span className="text-stone-500">· nº {v.id}</span>
                            </p>
                            <p className="text-stone-700">{enderecoCompleto(v)}</p>
                            {v.observacoes && <p className="text-stone-500">Como achar: {v.observacoes}</p>}
                            <p className="mt-1.5 flex flex-wrap gap-1.5 text-xs font-semibold">
                              {v.feita_em ? (
                                <span className="rounded-full bg-emerald-700 px-2.5 py-0.5 text-white">
                                  Feita · {diaHora.format(v.feita_em)}
                                  {v.feita_por ? ` · ${v.feita_por}` : ''}
                                </span>
                              ) : (
                                <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-stone-700">A fazer</span>
                              )}
                              {v.lancada_por && <span className="rounded-full bg-sky-100 px-2.5 py-0.5 text-sky-900">Lançada pelo líder: {v.lancada_por}</span>}
                              {v.confirmada_em ? (
                                <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-emerald-900">Confirmada por telefone</span>
                              ) : (
                                v.confirmar_contato && !v.feita_em && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-amber-900">Falta ligar para confirmar</span>
                              )}
                            </p>
                            {v.comentario && (
                              <p className="mt-1.5 rounded-lg bg-white/80 p-2 text-stone-800 ring-1 ring-stone-200">
                                <strong>Comentário{v.comentario_por ? ` de ${v.comentario_por}` : ''}:</strong> {v.comentario}
                              </p>
                            )}
                            <div className="mt-2">
                              <ControlesDaVisita id={v.id} nome={v.responsavel} feita={v.feita_em != null} grupo={grupo.id} outros={opcoes.map((o) => ({ id: o.id, nome: o.nome }))} />
                            </div>
                          </div>
                        </div>
                      </li>
                    ))}
                  </ol>
                </div>
              );
            }),
          )}
        </section>

        <aside className="space-y-4 print:hidden">
          <FormularioGrupo id={grupo.id} pessoas={pessoas} inicio={{ nome: grupo.nome, lider: grupo.lider_id ? String(grupo.lider_id) : '', observacao: grupo.observacao ?? '' }} />
          <p className="rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-600">
            O líder marca as visitas feitas e escreve os comentários pelo celular. Depois de marcada, só a coordenação desmarca, aqui nesta tela.
          </p>
        </aside>
      </div>
    </div>
  );
}
