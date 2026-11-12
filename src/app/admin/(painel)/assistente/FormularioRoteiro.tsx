'use client';

import { useActionState } from 'react';
import { gerarRoteiro } from '../../acoes';

export default function FormularioRoteiro({ maxAnterior, orientacoesAnteriores, jaTem }: { maxAnterior: number; orientacoesAnteriores: string; jaTem: boolean }) {
  const [estado, acao, pendente] = useActionState(gerarRoteiro, undefined);
  return (
    <form action={acao} className="space-y-4 rounded-xl border border-stone-200 bg-white p-4 print:hidden">
      <div className="grid gap-4 sm:grid-cols-[12rem_1fr]">
        <label className="block text-sm font-semibold text-stone-800">
          Máximo de visitas por grupo
          <input name="max" type="number" min={2} max={30} defaultValue={maxAnterior} required className="adm-campo mt-1" />
        </label>
        <label className="block text-sm font-semibold text-stone-800">
          Orientações para a IA <span className="font-normal text-stone-500">(opcional)</span>
          <textarea
            name="orientacoes"
            rows={2}
            maxLength={600}
            defaultValue={orientacoesAnteriores}
            placeholder="Ex: temos 5 equipes no sábado de manhã; as equipes vão a pé"
            className="adm-campo mt-1"
          />
        </label>
      </div>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <button type="submit" disabled={pendente} className="adm-botao">
          {pendente ? 'A IA está organizando as visitas…' : jaTem ? 'Montar roteiros de novo' : 'Montar roteiros com IA'}
        </button>
        <span className="text-sm text-stone-600" role="status">
          {pendente ? 'Isso pode levar de 1 a 3 minutos. Não feche esta página.' : 'A IA recebe só rua, número, bairro, dia, horário e posição. Nomes e telefones não são enviados.'}
        </span>
      </div>
    </form>
  );
}
