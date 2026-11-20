import { redirect } from 'next/navigation';
import { inicioDe, pessoaAtual } from '@/lib/auth';
import { SUBTITULO } from '@/lib/config';
import FormularioLogin from './FormularioLogin';

export const metadata = { title: 'Entrar - Painel' };

export default async function Login() {
  const eu = await pessoaAtual();
  if (eu) redirect(inicioDe(eu));
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="cartao">
        <h1 className="text-2xl font-extrabold text-stone-900">Painel de visitas</h1>
        <p className="mt-1 text-sm text-stone-600">{SUBTITULO}</p>
        <p className="mt-1 mb-6 text-sm text-stone-600">Coordenação e líderes de grupo entram por aqui.</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
