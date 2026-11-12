import Link from 'next/link';
import { lerToken } from '@/lib/tokens';
import FormularioDefinir from './FormularioDefinir';

export const metadata = { title: 'Criar senha - Painel', referrer: 'no-referrer' as const };
export const dynamic = 'force-dynamic';

export default async function DefinirSenha({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const codigo = typeof sp.codigo === 'string' ? sp.codigo : '';
  const token = await lerToken(codigo);
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-sm flex-col justify-center px-4 py-10">
      <div className="cartao">
        {token ? (
          <>
            <h1 className="text-2xl font-extrabold text-stone-900">{token.tipo === 'convite' ? `Bem-vindo(a), ${token.nome.split(' ')[0]}!` : 'Criar nova senha'}</h1>
            <p className="mt-1 mb-6 text-sm text-stone-600">
              Escolha a senha que você vai usar para entrar no painel com o e-mail <strong>{token.email}</strong>.
            </p>
            <FormularioDefinir codigo={codigo} />
          </>
        ) : (
          <>
            <h1 className="text-2xl font-extrabold text-stone-900">Este link não vale mais</h1>
            <p className="mt-2 text-sm text-stone-600">
              O link já foi usado ou passou do prazo. Sem problema: peça um novo e ele chega no seu e-mail em instantes.
            </p>
            <Link href="/admin/esqueci-senha" className="adm-botao mt-5 w-full py-3">
              Pedir um novo link
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
