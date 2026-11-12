'use client';

import { useActionState } from 'react';
import { criarUsuario } from '../../acoes';

export default function NovoUsuario() {
  const [estado, acao, pendente] = useActionState(criarUsuario, undefined);
  // Em caso de erro, o que foi digitado volta para os campos (menos a senha)
  const v = estado?.valores;

  return (
    <form
      action={acao}
      className="space-y-3 rounded-xl border border-stone-200 bg-white p-4"
    >
      <h2 className="text-lg font-extrabold text-stone-900">Cadastrar novo usuário</h2>
      <label className="block text-sm font-semibold text-stone-700">
        Nome
        <input name="nome" defaultValue={v?.nome ?? ''} required maxLength={120} className="adm-campo mt-1" />
      </label>
      <label className="block text-sm font-semibold text-stone-700">
        E-mail
        <input name="email" type="email" defaultValue={v?.email ?? ''} required maxLength={160} autoComplete="off" className="adm-campo mt-1" />
      </label>
      <label className="block text-sm font-semibold text-stone-700">
        Senha (mínimo 8 caracteres)
        <input name="senha" type="password" required minLength={8} autoComplete="new-password" className="adm-campo mt-1" />
      </label>
      <label className="block text-sm font-semibold text-stone-700">
        Perfil
        <select name="perfil" defaultValue={v?.perfil || 'admin'} className="adm-campo mt-1">
          <option value="admin">Admin</option>
          <option value="super_admin">Super admin</option>
        </select>
      </label>
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
      <button type="submit" disabled={pendente} className="adm-botao w-full">
        {pendente ? 'Cadastrando…' : 'Cadastrar usuário'}
      </button>
    </form>
  );
}
