import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/auth';
import { PRECISOES } from '@/lib/config';
import { sql } from '@/lib/db';
import { suspeitasPorVisita } from '@/lib/duplicidade';
import { nomeDaOpcao, opcoesDeGrupo } from '@/lib/grupos';
import type { Visita } from '@/lib/visitas';
import BotaoExcluir from '../../BotaoExcluir';
import CaixaConfirmada from '../../CaixaConfirmada';
import CaixaPortal from '../../CaixaPortal';
import { ControleFeita } from './ControleFeita';
import FormularioEdicao from './FormularioEdicao';

export const metadata = { title: 'Editar visita' };

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function EditarVisita({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [[v], suspeitas, grupos] = await Promise.all([sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]), suspeitasPorVisita(), opcoesDeGrupo()]);
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
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <span className="text-stone-600">Portal oficial:</span>
          <CaixaPortal id={v.id} nome={v.responsavel} migrado={v.migrado_em != null} />
          <span className="text-stone-600">Ligou e confirmou:</span>
          <CaixaConfirmada
            id={v.id}
            nome={v.responsavel}
            confirmada={v.confirmada_em != null}
            pediuContato={v.confirmar_contato === true}
            detalhe={v.confirmada_em ? [quando.format(v.confirmada_em), v.confirmada_por].filter(Boolean).join(' · ') : undefined}
          />
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

      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-stone-200 bg-white px-4 py-3 text-sm">
        <span className="font-semibold text-stone-700">No dia da visita:</span>
        {v.feita_em ? (
          <span className="rounded-full bg-emerald-700 px-3 py-1 font-semibold text-white">
            Feita em {quando.format(v.feita_em)}
            {v.feita_por ? ` · ${v.feita_por}` : ''}
          </span>
        ) : (
          <span className="rounded-full bg-stone-100 px-3 py-1 font-semibold text-stone-700">Ainda não foi feita</span>
        )}
        {v.lancada_por && <span className="rounded-full bg-sky-100 px-3 py-1 font-semibold text-sky-900">Lançada pelo líder: {v.lancada_por}</span>}
        <ControleFeita id={v.id} nome={v.responsavel} feita={v.feita_em != null} />
        {v.comentario && (
          <p className="w-full text-stone-800">
            <strong>Comentário{v.comentario_por ? ` de ${v.comentario_por}` : ''}:</strong> {v.comentario}
          </p>
        )}
      </div>

      <FormularioEdicao
        id={v.id}
        grupos={grupos.map((g) => ({ valor: String(g.id), nome: nomeDaOpcao(g) }))}
        v={{
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
          grupo: v.grupo_id ? String(v.grupo_id) : '',
        }}
      />
      <p className="text-sm text-stone-500">As alterações ficam na auditoria, com o valor de antes e o de depois.</p>
    </div>
  );
}
