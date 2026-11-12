'use client';

import { useActionState } from 'react';
import CampoSenha from '@/components/CampoSenha';
import { pedirAcesso } from '../acoes-conta';

export default function FormularioCadastro() {
  const [estado, acao, pendente] = useActionState(pedirAcesso, undefined);
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
        <label htmlFor="nome" className="mb-1 block text-sm font-semibold text-stone-800">
          Nome completo
        </label>
        <input id="nome" name="nome" autoComplete="name" defaultValue={estado?.valores?.nome ?? ''} required maxLength={120} className="adm-campo" />
      </div>
      <div>
        <label htmlFor="email" className="mb-1 block text-sm font-semibold text-stone-800">
          E-mail
        </label>
        <input id="email" name="email" type="email" autoComplete="username" defaultValue={estado?.valores?.email ?? ''} required maxLength={160} className="adm-campo" />
      </div>
      <CampoSenha name="nova" rotulo="Crie uma senha" autoComplete="new-password" minLength={8} ajuda="Pelo menos 8 caracteres. Você vai usar esta senha depois da aprovação." />
      <CampoSenha name="confirmar" rotulo="Digite a senha de novo" autoComplete="new-password" minLength={8} />
      <div className="hidden" aria-hidden="true">
        <label>
          Não preencha este campo
          <input type="text" name="site" tabIndex={-1} autoComplete="off" />
        </label>
      </div>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className="adm-botao w-full py-3">
        {pendente ? 'Enviando…' : 'Enviar pedido de acesso'}
      </button>
    </form>
  );
}
