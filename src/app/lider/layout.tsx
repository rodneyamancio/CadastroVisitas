import Link from 'next/link';
import { exigirPessoa } from '@/lib/auth';
import { sair } from '../admin/acoes';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Visitas do meu grupo' };

// Área do líder de grupo: feita para o celular, só com as visitas dos grupos dele.
export default async function AreaDoLider({ children }: { children: React.ReactNode }) {
  const eu = await exigirPessoa();
  return (
    <div className="min-h-dvh">
      <header className="border-b border-stone-200 bg-white">
        <div className="mx-auto flex max-w-2xl flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <Link href="/lider" className="text-lg font-extrabold text-emerald-800">
            Visitas do meu grupo
          </Link>
          <div className="ml-auto flex items-center gap-2 text-sm">
            {eu.perfil !== 'lider' && (
              <Link href="/admin" className="rounded-lg px-2 py-1 font-semibold text-stone-700 underline hover:bg-stone-100">
                Painel
              </Link>
            )}
            <Link href="/lider/conta" className="rounded-lg px-2 py-1 font-semibold text-stone-700 underline hover:bg-stone-100" title="Trocar a minha senha">
              {eu.nome.split(' ')[0]}
            </Link>
            <form action={sair}>
              <button type="submit" className="adm-botao-sec">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-5">{children}</main>
    </div>
  );
}
