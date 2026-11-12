import Link from 'next/link';
import { redirect } from 'next/navigation';
import { usuarioAtual } from '@/lib/auth';
import { SUBTITULO } from '@/lib/config';
import FormularioCadastro from './FormularioCadastro';

export const metadata = { title: 'Pedir acesso - Painel' };

export default async function Cadastro() {
  if (await usuarioAtual()) redirect('/admin');
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="cartao">
        <h1 className="text-2xl font-extrabold text-stone-900">Pedir acesso ao painel</h1>
        <p className="mt-1 mb-6 text-sm text-stone-600">
          {SUBTITULO}. Preencha os seus dados: a coordenação recebe o pedido e libera o seu acesso.
        </p>
        <FormularioCadastro />
        <p className="mt-5 text-center text-sm">
          <Link href="/admin/login" className="font-semibold text-emerald-800 underline">
            Já tenho acesso: entrar
          </Link>
        </p>
      </div>
    </main>
  );
}
