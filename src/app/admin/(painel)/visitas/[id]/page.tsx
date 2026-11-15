import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/auth';
import { PRECISOES } from '@/lib/config';
import { sql } from '@/lib/db';
import { suspeitasPorVisita } from '@/lib/duplicidade';
import type { Visita } from '@/lib/visitas';
import BotaoExcluir from '../../BotaoExcluir';
import CaixaPortal from '../../CaixaPortal';
import FormularioEdicao from './FormularioEdicao';

export const metadata = { title: 'Editar visita' };

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function EditarVisita({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [[v], suspeitas] = await Promise.all([sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]), suspeitasPorVisita()]);
  if (!v) notFound();
  const duplicidades = suspeitas.get(v.id) ?? [];

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin" className="text-sm font-semibold text-emerald-800 underline">
        ← Voltar para as visitas
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900">
            Editar visita nº {v.id} · {v.responsavel}
          </h1>
          <p className="text-sm text-stone-600">
            Cadastrado em {quando.format(v.criado_em)} · No mapa: {v.precisao ? PRECISOES[v.precisao] : 'ainda não localizado'}
          </p>
        </div>
        <div className="flex items-center gap-3 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <span className="text-stone-600">Portal oficial:</span>
          <CaixaPortal id={v.id} nome={v.responsavel} migrado={v.migrado_em != null} />
          <BotaoExcluir id={v.id} nome={v.responsavel} />
        </div>
      </div>

      {duplicidades.length > 0 && (
        <ul className="space-y-1 rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
          {duplicidades.map((s) => (
            <li key={s.par}>
              <Link href={`/admin/duplicidades#par-${s.par}`} className="font-semibold underline">
                Possível duplicidade com Nº {s.id} · {s.responsavel}
              </Link>
            </li>
          ))}
        </ul>
      )}

      <FormularioEdicao
        v={{
          id: v.id,
          responsavel: v.responsavel,
          telefone: v.telefone,
          endereco: v.endereco,
          numero: v.numero,
          complemento: v.complemento ?? '',
          bairro: v.bairro ?? '',
          cep: v.cep ?? '',
          observacoes: v.observacoes ?? '',
          data_visita: v.data_visita,
          periodo: v.periodo,
          confirmar: v.confirmar_contato == null ? '' : v.confirmar_contato ? 'sim' : 'nao',
        }}
      />
      <p className="text-sm text-stone-500">As alterações ficam na auditoria, com o valor de antes e o de depois.</p>
    </div>
  );
}
