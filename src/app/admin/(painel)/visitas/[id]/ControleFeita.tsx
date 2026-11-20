'use client';

import { useTransition } from 'react';
import { marcarFeitaPeloPainel } from '../../../acoes-grupos';

// A coordenação marca ou desmarca a visita feita (o líder só consegue marcar).
export function ControleFeita({ id, nome, feita }: { id: number; nome: string; feita: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        const pergunta = feita ? `Desmarcar a visita feita de ${nome}? Ela volta a aparecer como a fazer para o líder.` : `Marcar a visita de ${nome} como feita?`;
        if (confirm(pergunta)) iniciar(() => marcarFeitaPeloPainel(id, !feita));
      }}
      className="adm-botao-sec py-1.5"
    >
      {pendente ? 'Salvando…' : feita ? 'Desmarcar feita' : 'Marcar como feita'}
    </button>
  );
}
