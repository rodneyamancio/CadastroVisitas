import Link from 'next/link';
import FormularioEsqueci from './FormularioEsqueci';

export const metadata = { title: 'Esqueci minha senha - Painel' };

export default function EsqueciSenha() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="cartao">
        <h1 className="text-2xl font-extrabold text-stone-900">Esqueci minha senha</h1>
        <p className="mt-1 mb-6 text-sm text-stone-600">Digite o seu e-mail. Vamos enviar um link para você criar uma nova senha.</p>
        <FormularioEsqueci />
        <p className="mt-5 text-center text-sm">
          <Link href="/admin/login" className="font-semibold text-emerald-800 underline">
            Voltar para a entrada
          </Link>
        </p>
      </div>
    </main>
  );
}
