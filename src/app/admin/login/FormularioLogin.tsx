'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { entrar } from '../acoes';

export default function FormularioLogin() {
  const [estado, acao, pendente] = useActionState(entrar, undefined);
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-stone-800">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" defaultValue={estado?.valores?.email ?? ''} required className="adm-campo" />
      </div>
      <div>
        <label htmlFor="senha" className="mb-1 block text-sm font-semibold text-stone-800">
          Senha
        </label>
        <input id="senha" name="senha" type="password" autoComplete="current-password" required className="adm-campo" />
      </div>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className="adm-botao w-full py-3">
        {pendente ? 'Entrando…' : 'Entrar'}
      </button>
      <p className="text-center text-sm">
        <Link href="/admin/esqueci-senha" className="font-semibold text-emerald-800 underline">
          Esqueci minha senha
        </Link>
      </p>
      <p className="border-t border-stone-200 pt-4 text-center text-sm text-stone-600">
        Ainda não tem acesso?{' '}
        <Link href="/admin/cadastro" className="font-semibold text-emerald-800 underline">
          Pedir cadastro
        </Link>
      </p>
    </form>
  );
}
