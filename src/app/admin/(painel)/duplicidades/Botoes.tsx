'use client';

import { useState, useTransition } from 'react';
import { resolverPar, verificarDuplicidades, type RetornoDuplicidades } from '../../acoes';

// Verifica de novo todos os cadastros, inclusive os anteriores a esta função.
export function BotaoVerificar({ comIa }: { comIa: boolean }) {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<RetornoDuplicidades>();
  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <button
        type="button"
        disabled={pendente}
        className="adm-botao-sec py-2.5"
        onClick={() => {
          if (!confirm(`Verificar todos os cadastros de novo${comIa ? ' (com a ajuda da IA, pode levar alguns minutos)' : ''}?\n\nO que você já marcou como "não é duplicidade" continua assim.`)) return;
          setR(undefined);
          iniciar(async () => setR(await verificarDuplicidades()));
        }}
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 text-emerald-700 ${pendente ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
        </svg>
        {pendente ? 'Verificando…' : 'Verificar todos de novo'}
      </button>
      {r && (
        <p role="status" className={`rounded-lg px-3 py-2 text-sm ${r.erro ? 'bg-red-50 text-red-900' : 'bg-emerald-50 text-emerald-950'}`}>
          {r.erro ??
            `${r.conferidas} ${r.conferidas === 1 ? 'cadastro verificado' : 'cadastros verificados'} (${r.comIa ? 'regras e IA' : 'só regras'}): ${
              r.apontadas === 0 ? 'nenhuma possível duplicidade.' : `${r.apontadas} ${r.apontadas === 1 ? 'possível duplicidade' : 'possíveis duplicidades'}.`
            }`}
        </p>
      )}
    </div>
  );
}

export function BotaoResolver({ id, descartar }: { id: number; descartar: boolean }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button type="button" disabled={pendente} className="adm-botao-sec" onClick={() => iniciar(() => resolverPar(id, descartar))}>
      {pendente ? 'Gravando…' : descartar ? 'Não é duplicidade' : 'Reabrir'}
    </button>
  );
}
