'use client';

import { useTransition } from 'react';
import { excluirVisita } from '../acoes';

export default function BotaoExcluir({ id, nome }: { id: number; nome: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (confirm(`Excluir o cadastro de ${nome}? Esta ação não pode ser desfeita.`)) iniciar(() => excluirVisita(id));
      }}
      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pendente ? 'Excluindo…' : 'Excluir'}
    </button>
  );
}
