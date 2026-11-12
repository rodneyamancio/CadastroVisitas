import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/auth';
import { SUBTITULO } from '@/lib/config';
import FormularioLogin from './FormularioLogin';

export const metadata = { title: 'Entrar - Painel' };

export default async function Login() {
  if (await usuarioAtual()) redirect('/admin');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="cartao">
        <h1 className="text-2xl font-extrabold text-stone-900">Painel de visitas</h1>
        <p className="mt-1 mb-6 text-sm text-stone-600">{SUBTITULO}</p>
        <FormularioLogin />
      </div>
    </main>
  );
}
