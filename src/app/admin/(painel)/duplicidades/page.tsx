import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { iaPronta } from '@/lib/configuracoes';
import { listarDuplicidades, type Par } from '@/lib/duplicidade';
import { enderecoCompleto, type Visita } from '@/lib/visitas';
import BotaoExcluir from '../BotaoExcluir';
import { BotaoResolver, BotaoVerificar } from './Botoes';

export const metadata = { title: 'Duplicidades' };

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function telefoneFormatado(t: string) {
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

function Lado({ titulo, v }: { titulo: string; v: Visita }) {
  return (
    <div className="rounded-lg border border-stone-200 bg-stone-50 p-3">
      <p className="text-xs font-semibold text-stone-500 uppercase">
        {titulo} · Nº {v.id}
      </p>
      <p className="mt-1 text-lg font-bold text-stone-900">{v.responsavel}</p>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm text-stone-800">
        <dt className="text-stone-500">Telefone</dt>
        <dd>
          <a href={`https://wa.me/55${v.telefone}`} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">
            {telefoneFormatado(v.telefone)}
          </a>
        </dd>
        <dt className="text-stone-500">Endereço</dt>
        <dd>{enderecoCompleto(v)}</dd>
        {v.observacoes && (
          <>
            <dt className="text-stone-500">Como achar</dt>
            <dd>{v.observacoes}</dd>
          </>
        )}
        <dt className="text-stone-500">Visita</dt>
        <dd>
          {nomeDia(v.data_visita)} · {nomePeriodo(v.periodo)}
        </dd>
        <dt className="text-stone-500">Cadastrado em</dt>
        <dd>{quando.format(v.criado_em)}</dd>
        <dt className="text-stone-500">Portal oficial</dt>
        <dd className={v.migrado_em ? 'font-semibold text-emerald-800' : 'font-semibold text-amber-800'}>{v.migrado_em ? 'Migrado' : 'Falta migrar'}</dd>
      </dl>
      <div className="mt-2 flex justify-end gap-1">
        <Link href={`/admin/visitas/${v.id}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
          Editar
        </Link>
        <BotaoExcluir id={v.id} nome={v.responsavel} />
      </div>
    </div>
  );
}

function CartaoDoPar({ p }: { p: Par }) {
  return (
    <li id={`par-${p.id}`} className="scroll-mt-4 rounded-xl border border-stone-200 bg-white p-4 target:border-amber-400 target:ring-2 target:ring-amber-200">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <h2 className="text-lg font-bold text-stone-900">
          Nº {p.nova.id} pode ser a mesma família do Nº {p.antiga.id}
        </h2>
        <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-semibold ${p.grau === 'alta' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>
          {p.grau === 'alta' ? 'Muito provável' : 'Vale conferir'}
        </span>
      </div>
      <ul className="mt-2 flex flex-wrap gap-1.5 text-sm" aria-label="O que é parecido">
        {p.motivos.map((m) => (
          <li key={m} className="rounded-full bg-stone-100 px-2.5 py-0.5 font-semibold text-stone-800">
            {m}
          </li>
        ))}
      </ul>
      {p.parecer && (
        <p className="mt-2 text-sm text-stone-700">
          <span className="font-semibold">Parecer da IA:</span> {p.parecer}
        </p>
      )}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <Lado titulo="Cadastro mais novo" v={p.nova} />
        <Lado titulo="Já existia" v={p.antiga} />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-end gap-3 text-sm text-stone-600">
        <span>Se for a mesma família, exclua um dos dois cadastros acima (ou corrija os dados em Editar).</span>
        <BotaoResolver id={p.id} descartar />
      </div>
    </li>
  );
}

export default async function Duplicidades() {
  await exigirUsuario();
  const [abertas, descartadas, ia] = await Promise.all([listarDuplicidades('abertas'), listarDuplicidades('descartadas'), iaPronta()]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <h1 className="text-xl font-extrabold text-stone-900">Possíveis duplicidades</h1>
          <p className="mt-1 text-sm text-stone-600">
            A cada cadastro novo, o sistema compara o nome, o telefone e o endereço com os cadastros que já existiam e aponta aqui os que parecem ser da mesma família.{' '}
            {ia ? (
              'A IA conectada também analisa os casos parecidos: ela recebe o nome e o endereço, sem o telefone.'
            ) : (
              <>
                Nenhuma IA está conectada, então a análise usa só as regras. Para ter o parecer da IA, conecte uma em{' '}
                <Link href="/admin/configuracoes" className="font-semibold text-emerald-800 underline">
                  Configurações
                </Link>
                .
              </>
            )}
          </p>
        </div>
        <BotaoVerificar comIa={Boolean(ia)} />
      </div>

      {abertas.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Nenhuma possível duplicidade para conferir.</p>
      ) : (
        <ul className="space-y-4">
          {abertas.map((p) => (
            <CartaoDoPar key={p.id} p={p} />
          ))}
        </ul>
      )}

      {descartadas.length > 0 && (
        <details className="rounded-xl border border-stone-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-stone-800">
            {descartadas.length} {descartadas.length === 1 ? 'par marcado' : 'pares marcados'} como “não é duplicidade”
          </summary>
          <ul className="mt-3 divide-y divide-stone-100 text-sm">
            {descartadas.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
                <span className="text-stone-800">
                  Nº {p.nova.id} · {p.nova.responsavel} e Nº {p.antiga.id} · {p.antiga.responsavel}
                  <span className="text-stone-500">
                    {' '}
                    ({p.motivos.join(', ')}){p.descartada_por ? ` · por ${p.descartada_por}` : ''}
                    {p.descartada_em ? ` em ${quando.format(p.descartada_em)}` : ''}
                  </span>
                </span>
                <BotaoResolver id={p.id} descartar={false} />
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
