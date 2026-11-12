'use client';

import { useRouter } from 'next/navigation';

export type Visao = 'cards' | 'tabela';

export default function SeletorVisao({ atual }: { atual: Visao }) {
  const router = useRouter();
  const escolher = (v: Visao) => {
    document.cookie = `visao=${v}; path=/admin; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const classe = (ativo: boolean) =>
    `inline-flex items-center gap-1.5 px-3 py-2 text-sm font-semibold ${ativo ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700 hover:bg-stone-50'}`;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border border-stone-300" role="group" aria-label="Forma de ver as visitas">
      <button type="button" className={classe(atual === 'cards')} aria-pressed={atual === 'cards'} onClick={() => escolher('cards')}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="3" y="3" width="8" height="8" rx="1.5" />
          <rect x="13" y="3" width="8" height="8" rx="1.5" />
          <rect x="3" y="13" width="8" height="8" rx="1.5" />
          <rect x="13" y="13" width="8" height="8" rx="1.5" />
        </svg>
        Cards
      </button>
      <button type="button" className={classe(atual === 'tabela')} aria-pressed={atual === 'tabela'} onClick={() => escolher('tabela')}>
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M3 6h18M3 12h18M3 18h18" />
        </svg>
        Tabela
      </button>
    </div>
  );
}
