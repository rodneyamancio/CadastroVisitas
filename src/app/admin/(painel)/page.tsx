import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS, PRECISOES, nomeDia, nomePeriodo } from '@/lib/config';
import { enderecoCompleto, filtrosParaUrl, lerFiltros, listarVisitas, resumoVisitas, type Visita } from '@/lib/visitas';
import BotaoExcluir from './BotaoExcluir';

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

export default async function Painel({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const filtros = lerFiltros(await searchParams);
  const [visitas, resumo] = await Promise.all([listarVisitas(filtros), resumoVisitas()]);
  const consulta = filtrosParaUrl(filtros);
  const filtrando = Boolean(consulta);

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

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto] sm:items-end">
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
          <a href={`/api/admin/exportar${consulta ? `?${consulta}` : ''}`} className="adm-botao" download>
            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
            </svg>
            Exportar para Excel
          </a>
        </div>

        {visitas.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
            {filtrando ? 'Nenhuma visita encontrada com estes filtros.' : 'Ainda não há visitas cadastradas.'}
          </p>
        ) : (
          <ul className="grid gap-3 lg:grid-cols-2">
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
                  <span className="ml-auto">
                    <BotaoExcluir id={v.id} nome={v.responsavel} />
                  </span>
                </div>
                <p className="mt-2 text-xs text-stone-500">
                  Cadastrado em {quando.format(v.criado_em)} · No mapa: {v.precisao ? PRECISOES[v.precisao] : 'ainda não localizado'}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
