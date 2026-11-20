'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

// Abas da área de grupos: tudo o que é de grupo e de líder fica aqui dentro, em um item só do menu.
export default function Abas({ semGrupo }: { semGrupo: number }) {
  const caminho = usePathname();
  const abas = [
    { href: '/admin/grupos', nome: 'Grupos', ativa: caminho === '/admin/grupos' || /^\/admin\/grupos\/\d+/.test(caminho) },
    { href: '/admin/grupos/distribuir', nome: 'Distribuir visitas', aviso: semGrupo, ativa: caminho.startsWith('/admin/grupos/distribuir') },
    { href: '/admin/grupos/lideres', nome: 'Líderes', ativa: caminho.startsWith('/admin/grupos/lideres') },
  ];
  return (
    <nav aria-label="Grupos de visita" className="flex flex-wrap gap-1 border-b border-stone-300 print:hidden">
      {abas.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          aria-current={a.ativa ? 'page' : undefined}
          className={`-mb-px rounded-t-lg border-b-2 px-4 py-2 text-sm font-bold ${a.ativa ? 'border-emerald-700 bg-white text-emerald-900' : 'border-transparent text-stone-600 hover:bg-stone-200/60'}`}
        >
          {a.nome}
          {(a.aviso ?? 0) > 0 && (
            <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white" title="Visitas ainda sem grupo">
              {a.aviso}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}
