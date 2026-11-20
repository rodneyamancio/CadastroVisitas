'use client';

import { useTransition } from 'react';
import { apagarCadastro } from '../../acoes-cadastros';

export default function BotaoExcluirCadastro({ id, nome }: { id: number; nome: string }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (confirm(`Excluir o cadastro sem visita de ${nome}? Esta ação não pode ser desfeita.`)) iniciar(() => apagarCadastro(id));
      }}
      className="rounded-lg px-2 py-1 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pendente ? 'Excluindo…' : 'Excluir'}
    </button>
  );
}
