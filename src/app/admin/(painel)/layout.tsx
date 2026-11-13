import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { sql } from '@/lib/db';
import { sair } from '../acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Painel de visitas' };

export default async function PainelLayout({ children }: { children: React.ReactNode }) {
  const usuario = await exigirUsuario();
  const pedidos = usuario.perfil === 'super_admin' ? (await sql<{ n: number }>('SELECT count(*)::int AS n FROM usuarios WHERE aguardando_aprovacao'))[0].n : 0;
  const links = [
    { href: '/admin', nome: 'Visitas' },
    { href: '/admin/mapa', nome: 'Mapa de calor' },
    { href: '/admin/site', nome: 'Site' },
    { href: '/admin/assistente', nome: 'Assistente de IA' },
    { href: '/admin/mcp', nome: 'MCP' },
    ...(usuario.perfil === 'super_admin'
      ? [
          { href: '/admin/usuarios', nome: 'Usuários', aviso: pedidos },
          { href: '/admin/auditoria', nome: 'Auditoria' },
          { href: '/admin/configuracoes', nome: 'Configurações' },
        ]
      : []),
  ];
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white print:hidden">
        <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6 lg:px-8">
          <span className="text-lg font-extrabold text-emerald-800">Painel de visitas</span>
          <nav className="flex flex-wrap gap-1" aria-label="Seções do painel">
            {links.map((l) => (
              <Link key={l.href} href={l.href} className="rounded-lg px-3 py-2 text-sm font-semibold text-stone-700 hover:bg-stone-100">
                {l.nome}
                {'aviso' in l && (l.aviso ?? 0) > 0 && (
                  <span className="ml-1.5 rounded-full bg-amber-500 px-1.5 py-0.5 text-xs font-bold text-white" title="Pedidos de acesso aguardando aprovação">
                    {l.aviso}
                  </span>
                )}
              </Link>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm text-stone-600">
            <Link href="/admin/conta" className="rounded-lg px-2 py-1 font-semibold text-stone-700 underline hover:bg-stone-100" title="Minha conta e senha">
              {usuario.nome} · {usuario.perfil === 'super_admin' ? 'Super admin' : 'Admin'}
            </Link>
            <form action={sair}>
              <button type="submit" className="adm-botao-sec">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
    </div>
  );
}
