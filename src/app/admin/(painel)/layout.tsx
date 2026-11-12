import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { sair } from '../acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel de visitas' };

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const links = [
    { href: '/admin', nome: 'Visitas' },
    { href: '/admin/mapa', nome: 'Mapa de calor' },
    ...(usuario.perfil === 'super_admin' ? [{ href: '/admin/usuarios', nome: 'Usuários' }] : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3">
          <span className="text-lg font-extrabold text-emerald-800">Painel de visitas</span>
          <nav className="flex flex-wrap gap-1" aria-label="Seções do painel">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                {l.nome}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-600">
            <span>
              {usuario.nome} · {usuario.perfil === 'super_admin' ? 'Super admin' : 'Admin'}
            </span>
            <form action={sair}>
              <button type="submit" className="adm-botao-sec">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6">{children}</main>
    </div>
  );
}
