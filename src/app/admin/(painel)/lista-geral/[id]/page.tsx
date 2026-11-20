import Link from 'next/link';
import { notFound } from 'next/navigation';
import { exigirUsuario } from '@/lib/auth';
import type { Cadastro } from '@/lib/cadastros';
import { sql } from '@/lib/db';
import BotaoExcluirCadastro from '../BotaoExcluirCadastro';
import FormularioEdicaoCadastro from './FormularioEdicaoCadastro';

export const metadata = { title: 'Editar cadastro sem visita' };

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function EditarCadastro({ params }: { params: Promise<{ id: string }> }) {
  await exigirUsuario();
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const [c] = await sql<Cadastro>('SELECT * FROM cadastros WHERE id = $1', [id]);
  if (!c) notFound();

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/lista-geral" className="text-sm font-semibold text-emerald-800 underline">
        ← Voltar para a lista geral
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900">
            Cadastro sem visita nº {c.id} · {c.responsavel}
          </h1>
          <p className="text-sm text-stone-600">
            Cadastrado em {quando.format(c.criado_em)}
            {c.criado_por ? ` por ${c.criado_por}` : ''} · Só na lista geral: não entra nas visitas deste evento
          </p>
        </div>
        <div className="rounded-xl border border-stone-200 bg-white px-3 py-2 text-sm">
          <BotaoExcluirCadastro id={c.id} nome={c.responsavel} />
        </div>
      </div>

      <FormularioEdicaoCadastro
        id={c.id}
        v={{
          responsavel: c.responsavel,
          telefone: c.telefone,
          endereco: c.endereco,
          numero: c.numero,
          complemento: c.complemento ?? '',
          bairro: c.bairro ?? '',
          cep: c.cep ?? '',
          observacoes: c.observacoes ?? '',
          data_visita: '',
          periodo: '',
          confirmar: '',
          motivo: c.motivo ?? '',
        }}
      />
      <p className="text-sm text-stone-500">As alterações ficam na auditoria, com o valor de antes e o de depois.</p>
    </div>
  );
}
