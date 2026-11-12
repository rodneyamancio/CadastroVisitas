import Link from 'next/link';
import { ACOES, CATEGORIAS, POR_PAGINA, listarAuditoria } from '@/lib/auditoria';
import { exigirSuperAdmin } from '@/lib/auth';
import { resumoDoAparelho } from '@/lib/dispositivo';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium', timeZone: 'America/Sao_Paulo' });

const CORES: Record<string, string> = {
  login: 'bg-sky-100 text-sky-900',
  senha: 'bg-violet-100 text-violet-900',
  usuario: 'bg-emerald-100 text-emerald-900',
  visita: 'bg-stone-200 text-stone-800',
  roteiro: 'bg-amber-100 text-amber-900',
  config: 'bg-orange-100 text-orange-900',
  email: 'bg-pink-100 text-pink-900',
};
const ALERTAS = new Set(['login.falha', 'email.falha', 'roteiro.falha', 'usuario.excluido', 'visita.excluida', 'usuario.recusado']);

export default async function Auditoria({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirSuperAdmin();
  const sp = await searchParams;
  const um = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const categoria = CATEGORIAS.some((c) => c.valor === um(sp.categoria)) ? um(sp.categoria) : '';
  const q = um(sp.q).trim().slice(0, 100);
  const pagina = Math.max(1, Math.round(Number(um(sp.pagina))) || 1);
  const { linhas, total } = await listarAuditoria({ categoria: categoria || undefined, q: q || undefined, pagina });
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const link = (p: number) => {
    const params = new URLSearchParams();
    if (categoria) params.set('categoria', categoria);
    if (q) params.set('q', q);
    if (p > 1) params.set('pagina', String(p));
    const texto = params.toString();
    return `/admin/auditoria${texto ? `?${texto}` : ''}`;
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Auditoria</h1>
        <p className="text-sm text-stone-600">Registro de tudo o que acontece no painel: quem fez, o que fez, quando e de onde.</p>
      </div>

      <form method="get" className="grid gap-3 rounded-xl border border-stone-200 bg-white p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end">
        <div>
          <label htmlFor="q" className="mb-1 block text-sm font-semibold text-stone-700">
            Buscar
          </label>
          <input id="q" name="q" type="search" defaultValue={q} placeholder="Nome, e-mail, IP ou detalhe" className="adm-campo" />
        </div>
        <div>
          <label htmlFor="categoria" className="mb-1 block text-sm font-semibold text-stone-700">
            Tipo
          </label>
          <select id="categoria" name="categoria" defaultValue={categoria} className="adm-campo">
            <option value="">Todos</option>
            {CATEGORIAS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.nome}
              </option>
            ))}
          </select>
        </div>
        <div className="flex gap-2">
          <button type="submit" className="adm-botao">
            Filtrar
          </button>
          {(q || categoria) && (
            <Link href="/admin/auditoria" className="adm-botao-sec">
              Limpar
            </Link>
          )}
        </div>
      </form>

      <p className="text-sm text-stone-600">
        {total} {total === 1 ? 'registro' : 'registros'}
        {paginas > 1 && ` · página ${pagina} de ${paginas}`}
      </p>

      {linhas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Nenhum registro encontrado.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[60rem] border-collapse text-left text-sm">
            <thead className="bg-stone-50 text-xs text-stone-600 uppercase">
              <tr>
                <th className="px-3 py-2.5 font-semibold">Quando</th>
                <th className="px-3 py-2.5 font-semibold">Quem</th>
                <th className="px-3 py-2.5 font-semibold">O que fez</th>
                <th className="px-3 py-2.5 font-semibold">Sobre</th>
                <th className="px-3 py-2.5 font-semibold">Detalhes</th>
                <th className="px-3 py-2.5 font-semibold">De onde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-100">
              {linhas.map((l) => (
                <tr key={l.id} className={`align-top ${ALERTAS.has(l.acao) ? 'bg-red-50/60' : ''}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap text-stone-700">{quando.format(l.criado_em)}</td>
                  <td className="px-3 py-2.5 break-words text-stone-900">{l.usuario ?? 'Sistema'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${CORES[l.acao.split('.')[0]] ?? 'bg-stone-100 text-stone-700'}`}>
                      {ACOES[l.acao] ?? l.acao}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 break-words text-stone-800">{l.alvo ?? ''}</td>
                  <td className="px-3 py-2.5 text-stone-700">
                    {l.detalhes && (
                      <dl className="space-y-0.5">
                        {Object.entries(l.detalhes).map(([chave, valor]) => (
                          <div key={chave}>
                            <dt className="inline text-stone-500">{chave}: </dt>
                            <dd className="inline break-words">{typeof valor === 'object' ? JSON.stringify(valor) : String(valor)}</dd>
                          </div>
                        ))}
                      </dl>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-xs text-stone-600">
                    <div className="font-mono">{l.ip ?? 'sem IP'}</div>
                    <div title={l.agente ?? ''}>{l.agente ? resumoDoAparelho(l.agente) : ''}</div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {paginas > 1 && (
        <nav className="flex items-center justify-between" aria-label="Páginas">
          {pagina > 1 ? (
            <Link href={link(pagina - 1)} className="adm-botao-sec">
              Mais recentes
            </Link>
          ) : (
            <span />
          )}
          {pagina < paginas && (
            <Link href={link(pagina + 1)} className="adm-botao-sec">
              Mais antigos
            </Link>
          )}
        </nav>
      )}
    </div>
  );
}
