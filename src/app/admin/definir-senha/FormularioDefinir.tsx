'use client';

import { useActionState } from 'react';
import CampoSenha from '@/components/CampoSenha';
import { definirSenha } from '../acoes-conta';

export default function FormularioDefinir({ codigo }: { codigo: string }) {
  const [estado, acao, pendente] = useActionState(definirSenha, undefined);
  return (
    <form action={acao} className="space-y-4">
      <input type="hidden" name="codigo" value={codigo} />
      <CampoSenha name="nova" rotulo="Nova senha" autoComplete="new-password" minLength={8} ajuda="Pelo menos 8 caracteres." />
      <CampoSenha name="confirmar" rotulo="Digite a senha de novo" autoComplete="new-password" minLength={8} />
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      <button type="submit" disabled={pendente} className="adm-botao w-full py-3">
        {pendente ? 'Salvando…' : 'Salvar senha e entrar'}
      </button>
    </form>
  );
}
