import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { filtrosGeraisParaUrl, formatarTelefone, lerFiltrosGerais, listaGeral, resumoGeral, type Familia } from '@/lib/cadastros';
import { nomeDia, nomePeriodo } from '@/lib/config';

export const metadata = { title: 'Lista geral de famílias' };

const dia = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeZone: 'America/Sao_Paulo' });

const rua = (f: Familia) => [`${f.endereco}, ${f.numero}`, f.complemento].filter(Boolean).join(' - ');
const abrir = (f: Familia) => (f.tipo === 'visita' ? `/admin/visitas/${f.id}` : `/admin/lista-geral/${f.id}`);

function Situacao({ f }: { f: Familia }) {
  return f.tipo === 'visita' ? (
    <span className="inline-block rounded-full bg-emerald-100 px-3 py-1 text-sm font-semibold whitespace-nowrap text-emerald-900">
      Visita · {nomeDia(f.data_visita ?? '')} · {nomePeriodo(f.periodo ?? '')}
    </span>
  ) : (
    <span className="inline-block rounded-full bg-stone-200 px-3 py-1 text-sm font-semibold whitespace-nowrap text-stone-800">Sem visita</span>
  );
}

function TelefoneRepetido({ f }: { f: Familia }) {
  if (f.mesmo_telefone < 2) return null;
  return (
    <Link
      href={`/admin/lista-geral?q=${f.telefone.slice(-8)}`}
      className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold whitespace-nowrap text-amber-900 underline"
      title="Há outra linha da lista geral com este telefone. Toque para ver as duas."
    >
      Telefone repetido
    </Link>
  );
}

export default async function ListaGeral({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const filtros = lerFiltrosGerais(await searchParams);
  const [familias, resumo] = await Promise.all([listaGeral(filtros), resumoGeral()]);
  const consulta = filtrosGeraisParaUrl(filtros);
  const filtrando = Boolean(consulta);
  const total = resumo.visitas + resumo.semVisita;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Lista geral de famílias</h1>
        <p className="max-w-3xl text-sm text-stone-600">
          Junta as visitas deste evento com os cadastros sem visita, para servir de base nos próximos eventos. Os cadastros sem visita aparecem só aqui: não
          entram na tela de visitas, nos contadores, no mapa, nos roteiros nem no portal oficial.
        </p>
      </div>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="col-span-2 rounded-xl bg-emerald-700 p-4 text-white sm:col-span-1">
          <p className="text-sm text-emerald-50">Famílias na lista geral</p>
          <p className="text-3xl font-extrabold">{total}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-600">Com visita neste evento</p>
          <p className="text-3xl font-extrabold text-stone-900">{resumo.visitas}</p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white p-4">
          <p className="text-sm text-stone-600">Sem visita (só cadastro)</p>
          <p className="text-3xl font-extrabold text-stone-900">{resumo.semVisita}</p>
        </div>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-4">
        <form method="get" className="grid gap-3 sm:grid-cols-[minmax(14rem,1fr)_auto_auto] sm:items-end">
          <div>
            <label htmlFor="q" className="mb-1 block text-sm font-semibold text-stone-700">
              Buscar
            </label>
            <input id="q" name="q" type="search" defaultValue={filtros.q ?? ''} placeholder="Nome, rua, bairro ou telefone" className="adm-campo" />
          </div>
          <div>
            <label htmlFor="tipo" className="mb-1 block text-sm font-semibold text-stone-700">
              Mostrar
            </label>
            <select id="tipo" name="tipo" defaultValue={filtros.tipo ?? (filtros.repetidos ? 'repetidos' : '')} className="adm-campo">
              <option value="">Todas as famílias</option>
              <option value="visita">Com visita neste evento</option>
              <option value="cadastro">Sem visita (só cadastro)</option>
              <option value="repetidos">Telefone repetido</option>
            </select>
          </div>
          <div className="flex gap-2">
            <button type="submit" className="adm-botao">
              Filtrar
            </button>
            {filtrando && (
              <Link href="/admin/lista-geral" className="adm-botao-sec">
                Limpar
              </Link>
            )}
          </div>
        </form>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-extrabold text-stone-900">
            {familias.length} {familias.length === 1 ? 'família' : 'famílias'}
            {filtrando && <span className="font-normal text-stone-500"> (com os filtros)</span>}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            <Link href="/admin/lista-geral/novo" className="adm-botao">
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 5v14M5 12h14" />
              </svg>
              Cadastro sem visita
            </Link>
            <a href={`/api/admin/lista-geral${consulta ? `?${consulta}` : ''}`} className="adm-botao-sec py-2.5" download>
              <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M12 4v11m0 0-4-4m4 4 4-4M5 20h14" />
              </svg>
              Exportar para Excel
            </a>
          </div>
        </div>

        {familias.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
            {filtrando ? 'Nenhuma família encontrada com estes filtros.' : 'Ainda não há famílias na lista geral.'}
          </p>
        ) : (
          <>
            {/* Celular e telas médias: um cartão por família */}
            <ul className="grid gap-3 md:grid-cols-2 xl:hidden">
              {familias.map((f) => (
                <li key={`${f.tipo}${f.id}`} className="rounded-xl border border-stone-200 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-lg font-bold text-stone-900">{f.responsavel}</h3>
                    <Situacao f={f} />
                  </div>
                  <p className="mt-1 text-stone-800">{[rua(f), f.bairro].filter(Boolean).join(', ')}</p>
                  {f.motivo && <p className="mt-1 text-sm text-stone-600">Por que não vai ter visita: {f.motivo}</p>}
                  {f.observacoes && <p className="mt-1 text-sm text-stone-600">Como achar: {f.observacoes}</p>}
                  <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                    <span>
                      <a href={`tel:+55${f.telefone}`} className="font-semibold text-emerald-800 underline">
                        {formatarTelefone(f.telefone)}
                      </a>{' '}
                      <TelefoneRepetido f={f} />
                    </span>
                    <span className="text-stone-500">Cadastrado em {dia.format(f.criado_em)}</span>
                    <Link href={abrir(f)} className="ml-auto rounded-lg px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50">
                      Editar
                    </Link>
                  </div>
                </li>
              ))}
            </ul>

            {/* Telas largas: tabela */}
            <div className="hidden overflow-x-auto rounded-xl border border-stone-200 bg-white xl:block">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-stone-200 bg-stone-50 text-stone-700">
                  <tr>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Responsável</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Situação</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Telefone</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Endereço e bairro</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Observações</th>
                    <th scope="col" className="px-3 py-2.5 font-semibold">Cadastrado em</th>
                    <th scope="col" className="px-3 py-2.5">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-stone-100">
                  {familias.map((f) => (
                    <tr key={`${f.tipo}${f.id}`} className="align-top hover:bg-stone-50">
                      <th scope="row" className="min-w-40 px-3 py-2.5 font-semibold text-stone-900">
                        {f.responsavel}
                      </th>
                      <td className="px-3 py-2">
                        <Situacao f={f} />
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap">
                        <a href={`tel:+55${f.telefone}`} className="font-semibold text-emerald-800 underline">
                          {formatarTelefone(f.telefone)}
                        </a>
                        {f.mesmo_telefone > 1 && (
                          <p className="mt-1">
                            <TelefoneRepetido f={f} />
                          </p>
                        )}
                      </td>
                      <td className="min-w-56 px-3 py-2.5 text-stone-800">
                        {rua(f)}
                        {f.bairro && <span className="block text-stone-600">{f.bairro}</span>}
                      </td>
                      <td className="max-w-xs min-w-40 px-3 py-2.5 text-stone-600">
                        {f.motivo && <p>Sem visita: {f.motivo}</p>}
                        {f.observacoes && <p>{f.observacoes}</p>}
                      </td>
                      <td className="px-3 py-2.5 whitespace-nowrap text-stone-600">{dia.format(f.criado_em)}</td>
                      <td className="px-3 py-2 text-right">
                        <Link href={abrir(f)} className="rounded-lg px-2 py-1 font-semibold text-emerald-800 hover:bg-emerald-50">
                          Editar
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
