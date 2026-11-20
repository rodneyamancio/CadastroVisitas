'use client';

import { useActionState } from 'react';
import { criarGrupo, salvarGrupo, type ValoresDoGrupo } from '../../acoes-grupos';

export type PessoaParaLiderar = { id: number; nome: string; lider: boolean };

// Formulário de grupo: serve para criar (sem "id") e para alterar.
export default function FormularioGrupo({ id, inicio, pessoas }: { id?: number; inicio?: ValoresDoGrupo; pessoas: PessoaParaLiderar[] }) {
  const [estado, acao, pendente] = useActionState(id ? salvarGrupo.bind(null, id) : criarGrupo, undefined);
  // Com erro, volta o que foi digitado; depois de criar, o formulário fica limpo para o próximo
  const v = estado?.valores ?? inicio ?? { nome: '', lider: '', observacao: '' };
  const lideres = pessoas.filter((p) => p.lider);
  const doPainel = pessoas.filter((p) => !p.lider);

  return (
    <form action={acao} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
      <h2 className="text-lg font-extrabold text-stone-900">{id ? 'Dados do grupo' : 'Criar grupo'}</h2>
      <div key={`${estado?.criado ?? 0}-${JSON.stringify(v)}`} className="space-y-3">
        <label className="block text-sm font-semibold text-stone-700">
          Nome do grupo
          <input name="nome" defaultValue={v.nome} required maxLength={100} placeholder="Exemplo: Grupo 1 ou Vila Bancária" className="adm-campo mt-1" />
        </label>
        <label className="block text-sm font-semibold text-stone-700">
          Líder
          <select name="lider" defaultValue={v.lider} className="adm-campo mt-1">
            <option value="">Sem líder por enquanto</option>
            {lideres.length > 0 && (
              <optgroup label="Líderes de grupo">
                {lideres.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            )}
            {doPainel.length > 0 && (
              <optgroup label="Pessoas do painel">
                {doPainel.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                  </option>
                ))}
              </optgroup>
            )}
          </select>
          <span className="mt-1 block text-xs font-normal text-stone-500">O líder ainda não está na lista? Cadastre na aba Líderes.</span>
        </label>
        <label className="block text-sm font-semibold text-stone-700">
          Observação <span className="font-normal text-stone-500">(opcional, o líder também vê)</span>
          <textarea name="observacao" defaultValue={v.observacao} maxLength={400} rows={2} placeholder="Exemplo: ponto de encontro, quem vai junto" className="adm-campo mt-1" />
        </label>
      </div>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
          {estado.ok}
        </p>
      )}
      <button type="submit" disabled={pendente} className={id ? 'adm-botao' : 'adm-botao w-full'}>
        {pendente ? 'Salvando…' : id ? 'Salvar grupo' : 'Criar grupo'}
      </button>
    </form>
  );
}
