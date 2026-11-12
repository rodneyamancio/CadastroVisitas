'use client';

import { useActionState } from 'react';
import { pedirRedefinicao } from '../acoes-conta';

export default function FormularioEsqueci() {
  const [estado, acao, pendente] = useActionState(pedirRedefinicao, undefined);
  if (estado?.ok) {
    return (
      <p className="rounded-lg bg-emerald-50 p-4 text-sm font-semibold text-emerald-900" role="status">
        {estado.ok}
      </p>
    );
  }
  return (
    <form action={acao} className="space-y-4">
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-stone-800">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" required className="adm-campo" />
      </div>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className="adm-botao w-full py-3">
        {pendente ? 'Enviando…' : 'Enviar link por e-mail'}
      </button>
    </form>
  );
}
