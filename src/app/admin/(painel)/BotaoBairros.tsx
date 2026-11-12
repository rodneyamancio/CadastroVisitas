'use client';

import { useState, useTransition } from 'react';
import { conferirBairros, type RetornoBairros } from '../acoes';

// Confere de novo o bairro de todas as visitas pela rua (base dos Correios).
export default function BotaoBairros() {
  const [pendente, iniciar] = useTransition();
  const [r, setR] = useState<RetornoBairros>();
  const corrigidas = r?.corrigidas ?? [];

  return (
    <>
      <button
        type="button"
        disabled={pendente}
        title="Olha de novo o bairro de cada visita pelo nome da rua, na base dos Correios"
        className="adm-botao-sec py-2.5"
        onClick={() => {
          if (!confirm('Conferir o bairro de todas as visitas pelo nome da rua (Correios)?\n\nOs bairros que estiverem diferentes serão corrigidos.')) return;
          setR(undefined);
          iniciar(async () => setR(await conferirBairros()));
        }}
      >
        <svg viewBox="0 0 24 24" className={`h-5 w-5 text-emerald-700 ${pendente ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 11a8 8 0 1 0-2.3 5.7M20 5v6h-6" />
        </svg>
        {pendente ? 'Conferindo bairros…' : 'Conferir bairros'}
      </button>

      {r && (
        <div role="status" className={`order-last w-full rounded-xl border p-3 text-sm ${r.erro ? 'border-red-200 bg-red-50 text-red-900' : 'border-emerald-200 bg-emerald-50 text-emerald-950'}`}>
          {r.erro ? (
            r.erro
          ) : (
            <>
              <p className="font-semibold">
                {corrigidas.length === 0
                  ? `Nenhum bairro precisou de correção (${r.conferidas} ${r.conferidas === 1 ? 'visita conferida' : 'visitas conferidas'}).`
                  : `${corrigidas.length} ${corrigidas.length === 1 ? 'bairro corrigido' : 'bairros corrigidos'} em ${r.conferidas} ${r.conferidas === 1 ? 'visita conferida' : 'visitas conferidas'}.`}
                {(r.naoAchadas ?? 0) > 0 && ` ${r.naoAchadas} ${r.naoAchadas === 1 ? 'rua não foi encontrada' : 'ruas não foram encontradas'} nos Correios e ${r.naoAchadas === 1 ? 'ficou' : 'ficaram'} como estava.`}
              </p>
              {corrigidas.length > 0 && (
                <ul className="mt-2 space-y-0.5">
                  {corrigidas.map((c) => (
                    <li key={c.id}>
                      Nº {c.id} · {c.responsavel} · {c.endereco}: <span className="text-stone-600 line-through">{c.antes || 'sem bairro'}</span> → <strong>{c.depois}</strong>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>
      )}
    </>
  );
}
