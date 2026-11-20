import { cookies } from 'next/headers';
import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS, PRECISOES, nomeDia, nomePeriodo } from '@/lib/config';
import { suspeitasPorVisita } from '@/lib/duplicidade';
import { opcoesDeGrupo } from '@/lib/grupos';
import { enderecoCompleto, filtrosParaUrl, lerFiltros, listarVisitas, resumoVisitas, type Visita } from '@/lib/visitas';
import BotaoBairros from './BotaoBairros';
import BotaoExcluir from './BotaoExcluir';
import CaixaConfirmada from './CaixaConfirmada';
import CaixaPortal from './CaixaPortal';
import SeletorVisao, { type Visao } from './SeletorVisao';
import TabelaVisitas, { type LinhaVisita } from './TabelaVisitas';

function telefoneFormatado(t: string) {
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

function linkMapa(v: Visita) {
  const alvo = v.lat != null && v.lng != null && v.precisao !== 'rua' ? `${v.lat},${v.lng}` : enderecoCompleto(v);
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(alvo)}`;
}

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

const diaIso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' });
const diaHora = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

// "13/11, 14:02 · Rodney": quando e quem marcou
const quemEQuando = (em: Date | null, por: string | null) => (em ? [diaHora.format(em), por?.split(' ')[0]].filter(Boolean).join(' · ') : undefined);
const detalheDaConfirmacao = (v: Visita) => quemEQuando(v.confirmada_em, v.confirmada_por);

// Quando e quem marcou o cadastro como migrado para o portal oficial
function detalheDoPortal(v: Visita) {
  if (!v.migrado_em) return undefined;
  return [diaHora.format(v.migrado_em), v.migrado_por?.split(' ')[0]].filter(Boolean).join(' · ');
}

function tempoDePreenchimento(s: number | null | undefined) {
  if (s == null) return 'não medido';
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${s % 60} s`;
}

// Só o super admin vê: IP e aparelho de quem preencheu o cadastro.
function QuemCadastrou({ v }: { v: Visita }) {
  const e = v.extra ?? {};
  return (
    <details className="mt-2 rounded-lg bg-stone-50 px-3 py-2 text-sm">
      <summary className="cursor-pointer font-semibold text-stone-700">Quem cadastrou (IP e aparelho)</summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-stone-700">
        <dt className="text-stone-500">IP</dt>
        <dd className="font-mono">{v.ip ?? 'não registrado'}</dd>
        <dt className="text-stone-500">Aparelho</dt>
        <dd>{e.aparelho ?? 'não registrado'}</dd>
        <dt className="text-stone-500">Tela</dt>
        <dd>{e.tela || 'não informada'}</dd>
        <dt className="text-stone-500">Idioma / fuso</dt>
        <dd>{[e.idioma, e.fuso].filter(Boolean).join(' · ') || 'não informado'}</dd>
        <dt className="text-stone-500">Tempo preenchendo</dt>
        <dd>{tempoDePreenchimento(e.tempoS)}</dd>
        <dt className="text-stone-500">Localização do celular</dt>
        <dd>{e.usouGps ? 'usou' : 'não usou'}</dd>
        <dt className="text-stone-500">Navegador</dt>
        <dd className="break-all text-xs">{v.agente ?? 'não registrado'}</dd>
      </dl>
    </details>
  );
}

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const usuario = await exigirUsuario();
  const superAdmin = usuario.perfil === 'super_admin';
  const visao: Visao = (await cookies()).get('visao')?.value === 'tabela' ? 'tabela' : 'cards';
  const filtros = lerFiltros(await searchParams);
  const [visitas, resumo, suspeitas, grupos] = await Promise.all([listarVisitas(filtros), resumoVisitas(), suspeitasPorVisita(), opcoesDeGrupo()]);
  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.nome]));
  const paresSuspeitos = new Set([...suspeitas.values()].flat().map((s) => s.par)).size;
  const consulta = filtrosParaUrl(filtros);
  const filtrando = Boolean(consulta);
  const faltam = resumo.total - resumo.migradas;
  // Linhas da tabela: o IP e o aparelho só vão para o navegador do super admin.
  const linhas: LinhaVisita[] =
    visao !== 'tabela'
      ? []
      : visitas.map((v) => ({
          id: v.id,
          responsavel: v.responsavel,
          telefone: v.telefone,
          telefoneTexto: telefoneFormatado(v.telefone),
          endereco: [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - '),
          observacoes: v.observacoes ?? '',
          bairro: v.bairro ?? '',
          dataVisita: v.data_visita,
          dia: nomeDia(v.data_visita),
          periodo: v.periodo,
          periodoNome: nomePeriodo(v.periodo),
          confirmar: v.confirmar_contato,
          criadoEm: v.criado_em.getTime(),
          criadoTexto: quando.format(v.criado_em),
          criadoDia: diaIso.format(v.criado_em),
          migrado: v.migrado_em != null,
          detalhePortal: detalheDoPortal(v),
          confirmada: v.confirmada_em != null,
          detalheConfirmada: detalheDaConfirmacao(v),
          linkMapa: linkMapa(v),
          duplicidades: (suspeitas.get(v.id) ?? []).map((s) => ({ par: s.par, texto: `Nº ${s.id} · ${s.responsavel}` })),
          grupo: v.grupo_id ? { id: v.grupo_id, nome: nomeDoGrupo.get(v.grupo_id) ?? `Grupo ${v.grupo_id}` } : undefined,
          feita: v.feita_em != null,
          lancada: v.lancada_por != null,
          ...(superAdmin ? { ip: v.ip ?? '', aparelho: v.extra?.aparelho ?? '' } : {}),
        }));

  return (
    <div className="space-y-6">
      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <div className="col-span-2 rounded-xl bg-emerald-700 p-4 text-white sm:col-span-1">
          <p className="text-sm text-emerald-50">Total de famílias</p>
          <p className="text-3xl font-extrabold">{resumo.total}</p>
        </div>
        {DIAS.flatMap((d) =>
          PERIODOS.map((p) => (
            <div key={`${d.valor}${p.valor}`} className="rounded-xl border border-stone-200 bg-white p-4">
              <p className="text-sm text-stone-600">
                {d.semana} · {p.nome}
              </p>
              <p className="text-3xl font-extrabold text-stone-900">{resumo.grupos[`${d.valor}|${p.valor}`] ?? 0}</p>
            </div>
          )),
        )}
      </section>

      {resumo.total > 0 && (
        <section aria-label="Portal oficial" className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-stone-800">
              <span className="font-bold text-stone-900">Portal oficial:</span> {resumo.migradas} de {resumo.total} já {resumo.migradas === 1 ? 'migrada' : 'migradas'}
              {faltam > 0 ? (
                <>
                  {' · '}
                  <span className="font-semibold text-amber-800">{faltam === 1 ? 'falta 1' : `faltam ${faltam}`}</span>
                </>
              ) : (
                <span className="font-semibold text-emerald-800"> · tudo migrado</span>
              )}
            </p>
            {faltam > 0 && filtros.portal !== 'falta' && (
              <Link href="/admin?portal=falta" className="text-sm font-semibold text-emerald-800 underline">
                Ver as que faltam
              </Link>
            )}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(resumo.migradas / resumo.total) * 100}%` }} />
          </div>
        </section>
      )}

      {resumo.total > 0 && (
        <section aria-label="Confirmação com a família" className="rounded-xl border border-stone-200 bg-white p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-stone-800">
              <span className="font-bold text-stone-900">Confirmação por telefone:</span> {resumo.confirmadas} de {resumo.total} já{' '}
              {resumo.confirmadas === 1 ? 'confirmada' : 'confirmadas'}
              {resumo.pedemContato > 0 &&
                (resumo.pendentes > 0 ? (
                  <>
                    {' · '}
                    <span className="font-semibold text-amber-800">
                      {resumo.pendentes === 1 ? 'falta 1' : `faltam ${resumo.pendentes}`} das {resumo.pedemContato} que pediram contato antes
                    </span>
                  </>
                ) : (
                  <span className="font-semibold text-emerald-800"> · todas as que pediram contato antes já foram confirmadas</span>
                ))}
            </p>
            {resumo.pendentes > 0 && filtros.confirmada !== 'pendente' && (
              <Link href="/admin?confirmada=pendente" className="text-sm font-semibold text-emerald-800 underline">
                Ver as que faltam
              </Link>
            )}
          </div>
          <div className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200" aria-hidden="true">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(resumo.confirmadas / resumo.total) * 100}%` }} />
          </div>
        </section>
      )}

      {paresSuspeitos > 0 && (
        <section aria-label="Duplicidades" className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950">
          <p>
            <span className="font-bold">
              {paresSuspeitos} {paresSuspeitos === 1 ? 'possível duplicidade' : 'possíveis duplicidades'}
            </span>{' '}
            para conferir: cadastros com nome, telefone ou endereço parecidos.
          </p>
          <Link href="/admin/duplicidades" className="font-semibold underline">
            Conferir
          </Link>
        </section>
      )}

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-2 sm:items-end lg:grid-cols-3 xl:grid-cols-[minmax(12rem,1fr)_auto_auto_auto_auto_auto_auto]">
          <div>
            <label htmlFor="q" className="mb-1 block text-sm font-semibold text-stone-700">
              Buscar
            </label>
            <input id="q" name="q" type="search" defaultValue={filtros.q ?? ''} placeholder="Nome, rua, bairro ou telefone" className="adm-campo" />
          </div>
          <div>
            <label htmlFor="dia" className="mb-1 block text-sm font-semibold text-stone-700">
              Dia
            </label>
            <select id="dia" name="dia" defaultValue={filtros.dia ?? ''} className="adm-campo">
              <option value="">Todos</option>
              {DIAS.map((d) => (
                <option key={d.valor} value={d.valor}>
                  {d.curto}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="periodo" className="mb-1 block text-sm font-semibold text-stone-700">
              Horário
            </label>
            <select id="periodo" name="periodo" defaultValue={filtros.periodo ?? ''} className="adm-campo">
              <option value="">Todos</option>
              {PERIODOS.map((p) => (
                <option key={p.valor} value={p.valor}>
                  {p.nome}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="portal" className="mb-1 block text-sm font-semibold text-stone-700">
              Portal oficial
            </label>
            <select id="portal" name="portal" defaultValue={filtros.portal ?? ''} className="adm-campo">
              <option value="">Todos</option>
              <option value="falta">Falta migrar</option>
              <option value="migrado">Já migrados</option>
            </select>
          </div>
          <div>
            <label htmlFor="confirmada" className="mb-1 block text-sm font-semibold text-stone-700">
              Confirmação
            </label>
            <select id="confirmada" name="confirmada" defaultValue={filtros.confirmada ?? ''} className="adm-campo">
              <option value="">Todas</option>
              <option value="pendente">Falta (pediram contato)</option>
              <option value="nao">Não confirmadas</option>
              <option value="sim">Já confirmadas</option>
            </select>
          </div>
          {grupos.length > 0 && (
            <div>
              <label htmlFor="grupo" className="mb-1 block text-sm font-semibold text-stone-700">
                Grupo
              </label>
              <select id="grupo" name="grupo" defaultValue={filtros.grupo ?? ''} className="adm-campo xl:max-w-44">
                <option value="">Todos</option>
                <option value="sem">Sem grupo</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="flex gap-2">
            <button type="submit" className="adm-botao">
              Filtrar
            </button>
            {filtrando && (
              <Link href="/admin" className="adm-botao-sec">
                Limpar
              </Link>
            )}
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-xl font-extrabold text-stone-900">
            {visitas.length} {visitas.length === 1 ? 'visita cadastrada' : 'visitas cadastradas'}
            {filtrando && <span className="font-normal text-stone-500"> (com os filtros)</span>}
          </h1>
          <div className="flex flex-wrap items-center gap-2">
            <SeletorVisao atual={visao} />
            <BotaoBairros />
            <Link href="/admin/assistente" className="adm-botao-sec py-2.5">
              <svg viewBox="0 0 24 24" className="h-5 w-5 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z" />
              </svg>
              Assistente de IA
            </Link>
            <Link href="/admin/visitas/nova" className="adm-botao">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Nova visita
            </Link>
            <a href={`/api/admin/exportar${consulta ? `?${consulta}` : ''}`} className="adm-botao-sec py-2.5" download>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Exportar para Excel
            </a>
          </div>
        </div>

        {visitas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
            {filtrando ? 'Nenhuma visita encontrada com estes filtros.' : 'Ainda não há visitas cadastradas.'}
          </p>
        ) : visao === 'cards' ? (
          <ul className="grid gap-3 lg:grid-cols-2 2xl:grid-cols-3">
            {visitas.map((v) => (
              <li key={v.id} className="rounded-xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between gap-3">
                  <h2 className="text-lg font-bold text-stone-900">{v.responsavel}</h2>
                  <span className="shrink-0 rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold text-emerald-900">
                    {nomeDia(v.data_visita)} · {nomePeriodo(v.periodo)}
                  </span>
                </div>
                <p className="mt-1 text-stone-800">{enderecoCompleto(v)}</p>
                {v.observacoes && <p className="mt-1 text-sm text-stone-600">Como achar: {v.observacoes}</p>}
                {(suspeitas.get(v.id) ?? []).map((s) => (
                  <p key={s.par} className="mt-2 text-sm">
                    <Link href={`/admin/duplicidades#par-${s.par}`} className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900 underline">
                      Possível duplicidade com Nº {s.id} · {s.responsavel}
                    </Link>
                  </p>
                ))}
                {(grupos.length > 0 || v.feita_em || v.lancada_por) && (
                  <p className="mt-2 flex flex-wrap gap-1.5 text-sm font-semibold">
                    {v.grupo_id ? (
                      <Link href={`/admin/grupos/${v.grupo_id}`} className="rounded-full bg-stone-100 px-3 py-1 text-stone-800 underline">
                        {nomeDoGrupo.get(v.grupo_id) ?? `Grupo ${v.grupo_id}`}
                      </Link>
                    ) : (
                      grupos.length > 0 && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Sem grupo</span>
                    )}
                    {v.feita_em && <span className="rounded-full bg-emerald-700 px-3 py-1 text-white">Visita feita</span>}
                    {v.lancada_por && <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-900">Lançada pelo líder</span>}
                  </p>
                )}
                {v.confirmar_contato != null && (
                  <p className="mt-2 text-sm">
                    {v.confirmar_contato ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 font-semibold text-amber-900">Entrar em contato antes para confirmar</span>
                    ) : (
                      <span className="text-stone-600">Não precisa confirmar antes da visita</span>
                    )}
                  </p>
                )}
                <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <a href={`tel:+55${v.telefone}`} className="font-semibold text-emerald-800 underline">
                    {telefoneFormatado(v.telefone)}
                  </a>
                  <a href={`https://wa.me/55${v.telefone}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">
                    WhatsApp
                  </a>
                  <a href={linkMapa(v)} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">
                    Abrir no mapa
                  </a>
                  <span className="ml-auto flex items-center gap-1">
                    <Link href={`/admin/visitas/${v.id}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
                      Editar
                    </Link>
                    <BotaoExcluir id={v.id} nome={v.responsavel} />
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-stone-100 pt-3 text-sm">
                  <span className="text-stone-600">Portal oficial:</span>
                  <CaixaPortal id={v.id} nome={v.responsavel} migrado={v.migrado_em != null} detalhe={detalheDoPortal(v)} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                  <span className="text-stone-600">Ligou e confirmou a visita:</span>
                  <CaixaConfirmada
                    id={v.id}
                    nome={v.responsavel}
                    confirmada={v.confirmada_em != null}
                    pediuContato={v.confirmar_contato === true}
                    detalhe={detalheDaConfirmacao(v)}
                  />
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  Cadastrado em {quando.format(v.criado_em)} · No mapa: {v.precisao ? PRECISOES[v.precisao] : 'ainda não localizado'}
                </p>
                {superAdmin && <QuemCadastrou v={v} />}
              </li>
            ))}
          </ul>
        ) : (
          <TabelaVisitas linhas={linhas} superAdmin={superAdmin} />
        )}
      </section>
    </div>
  );
}
