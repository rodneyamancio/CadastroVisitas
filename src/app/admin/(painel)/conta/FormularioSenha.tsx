'use client';

import { useActionState } from 'react';
import CampoSenha from '@/components/CampoSenha';
import { alterarMinhaSenha } from '../../acoes-conta';

export default function FormularioSenha() {
  const [estado, acao, pendente] = useActionState(alterarMinhaSenha, undefined);
  return (
    <form action={acao} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <h2 className="text-lg font-extrabold text-stone-900">Alterar senha</h2>
      <CampoSenha name="atual" rotulo="Senha atual" autoComplete="current-password" />
      <CampoSenha name="nova" rotulo="Nova senha" autoComplete="new-password" minLength={8} ajuda="Pelo menos 8 caracteres." />
      <CampoSenha name="confirmar" rotulo="Digite a nova senha de novo" autoComplete="new-password" minLength={8} />
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
          {estado.ok}
        </p>
      )}
      <button type="submit" disabled={pendente} className="adm-botao">
        {pendente ? 'Salvando…' : 'Salvar nova senha'}
      </button>
    </form>
  );
}
