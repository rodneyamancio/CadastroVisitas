'use client';

import { useOptimistic, useTransition } from 'react';
import { marcarPortalOficial } from '../acoes';

// Caixa de marcar: o cadastro já foi passado para o portal oficial?
export default function CaixaPortal({ id, nome, migrado, detalhe }: { id: number; nome: string; migrado: boolean; detalhe?: string }) {
  const [pendente, iniciar] = useTransition();
  const [marcado, definir] = useOptimistic(migrado);
  return (
    <div className={pendente ? 'opacity-70' : ''}>
      <label className="inline-flex cursor-pointer items-center gap-2 py-0.5 whitespace-nowrap">
        <input
          type="checkbox"
          checked={marcado}
          aria-label={`${nome}: já migrado para o portal oficial`}
          onChange={(e) => {
            const novo = e.target.checked;
            iniciar(async () => {
              definir(novo);
              await marcarPortalOficial(id, novo);
            });
          }}
          className="h-5 w-5 shrink-0 cursor-pointer accent-emerald-700"
        />
        <span aria-hidden="true" className={`font-semibold ${marcado ? 'text-emerald-800' : 'text-amber-800'}`}>
          {marcado ? 'Migrado' : 'Falta migrar'}
        </span>
      </label>
      {marcado && detalhe && <div className="text-xs text-stone-500">{detalhe}</div>}
    </div>
  );
}
