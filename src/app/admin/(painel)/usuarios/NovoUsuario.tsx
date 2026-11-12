'use client';

import { useActionState, useState } from 'react';
import { criarUsuario } from '../../acoes';

export default function NovoUsuario({ comEmail }: { comEmail: boolean }) {
  const [estado, acao, pendente] = useActionState(criarUsuario, undefined);
  // Em caso de erro, o que foi digitado volta para os campos (menos a senha)
  const v = estado?.valores;
  const [modo, setModo] = useState<'email' | 'senha'>(comEmail ? 'email' : 'senha');
  const opcao = (ativo: boolean) =>
    `flex cursor-pointer items-start gap-2.5 rounded-lg border-2 px-3 py-2.5 text-sm ${ativo ? 'border-emerald-700 bg-emerald-50 text-emerald-950' : 'border-stone-300 text-stone-800'}`;

  return (
    <form action={acao} className="space-y-3 rounded-xl border border-stone-200 bg-white p-4">
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
        Perfil
        <select name="perfil" defaultValue={v?.perfil || 'admin'} className="adm-campo mt-1">
          <option value="admin">Admin</option>
          <option value="super_admin">Super admin</option>
        </select>
      </label>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-semibold text-stone-700">Como a pessoa recebe a senha</legend>
        <label className={`${opcao(modo === 'email')} ${comEmail ? '' : 'opacity-60'}`}>
          <input type="radio" name="modo" value="email" checked={modo === 'email'} disabled={!comEmail} onChange={() => setModo('email')} className="mt-0.5 h-4 w-4 accent-emerald-700" />
          <span>
            <strong>Enviar e-mail para ela criar a senha</strong>
            <br />
            {comEmail ? 'A pessoa recebe um convite e escolhe a própria senha.' : 'Disponível depois de configurar o envio de e-mail em Configurações.'}
          </span>
        </label>
        <label className={opcao(modo === 'senha')}>
          <input type="radio" name="modo" value="senha" checked={modo === 'senha'} onChange={() => setModo('senha')} className="mt-0.5 h-4 w-4 accent-emerald-700" />
          <span>
            <strong>Definir a senha agora</strong>
            <br />
            Você cria a senha e passa para a pessoa.
          </span>
        </label>
      </fieldset>

      {modo === 'senha' && (
        <label className="block text-sm font-semibold text-stone-700">
          Senha (mínimo 8 caracteres)
          <input name="senha" type="password" required minLength={8} autoComplete="new-password" className="adm-campo mt-1" />
        </label>
      )}

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
        {pendente ? 'Cadastrando…' : modo === 'email' ? 'Cadastrar e enviar convite' : 'Cadastrar usuário'}
      </button>
    </form>
  );
}
