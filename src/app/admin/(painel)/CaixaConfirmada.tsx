'use client';

import { useOptimistic, useTransition } from 'react';
import { marcarVisitaConfirmada } from '../acoes';

// Caixa de marcar: a equipe já ligou e confirmou a visita com a família?
// "pediuContato": a família pediu para ser avisada antes; enquanto não for confirmada, aparece em destaque.
export default function CaixaConfirmada({
  id,
  nome,
  confirmada,
  pediuContato,
  detalhe,
}: {
  id: number;
  nome: string;
  confirmada: boolean;
  pediuContato: boolean;
  detalhe?: string;
}) {
  const [pendente, iniciar] = useTransition();
  const [marcado, definir] = useOptimistic(confirmada);
  return (
    <div className={pendente ? 'opacity-70' : ''}>
      <label className="inline-flex cursor-pointer items-center gap-2 py-0.5 whitespace-nowrap">
        <input
          type="checkbox"
          checked={marcado}
          aria-label={`${nome}: já ligou e confirmou a visita com a família`}
          onChange={(e) => {
            const novo = e.target.checked;
            iniciar(async () => {
              definir(novo);
              await marcarVisitaConfirmada(id, novo);
            });
          }}
          className="h-5 w-5 shrink-0 cursor-pointer accent-emerald-700"
        />
        <span aria-hidden="true" className={`font-semibold ${marcado ? 'text-emerald-800' : pediuContato ? 'text-amber-800' : 'text-stone-500'}`}>
          {marcado ? 'Confirmada' : pediuContato ? 'Falta confirmar' : 'Não confirmada'}
        </span>
      </label>
      {marcado && detalhe && <div className="text-xs text-stone-500">{detalhe}</div>}
    </div>
  );
}
