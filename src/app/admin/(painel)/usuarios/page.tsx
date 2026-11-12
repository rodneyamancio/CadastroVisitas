import { exigirSuperAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { alternarAtivo, excluirUsuario, mudarPerfil, redefinirSenha } from '../../acoes';
import NovoUsuario from './NovoUsuario';

type Linha = { id: number; nome: string; email: string; perfil: 'super_admin' | 'admin'; ativo: boolean };

const AVISOS: Record<string, { texto: string; erro?: boolean }> = {
  salvo: { texto: 'Alteração salva.' },
  senha: { texto: 'Senha redefinida.' },
  excluido: { texto: 'Usuário excluído.' },
  proprio: { texto: 'Você não pode alterar o seu próprio usuário por aqui.', erro: true },
  'senha-curta': { texto: 'A senha precisa ter pelo menos 8 caracteres.', erro: true },
  invalido: { texto: 'Dados inválidos.', erro: true },
};

export default async function Usuarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eu = await exigirSuperAdmin();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === 'string' ? AVISOS[sp.aviso] : undefined;
  const usuarios = await sql<Linha>('SELECT id, nome, email, perfil, ativo FROM usuarios ORDER BY nome');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-1 text-xl font-extrabold text-stone-900">Usuários do painel</h1>
        <p className="mb-4 text-sm text-stone-600">
          <strong>Super admin</strong> vê as visitas e cadastra usuários. <strong>Admin</strong> vê, exporta e exclui visitas.
        </p>
        {aviso && (
          <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${aviso.erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`} role="status">
            {aviso.texto}
          </p>
        )}
        <ul className="space-y-3">
          {usuarios.map((u) => {
            const souEu = u.id === eu.id;
            return (
              <li key={u.id} className={`rounded-xl border border-stone-200 bg-white p-4 ${u.ativo ? '' : 'opacity-70'}`}>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="text-base font-bold text-stone-900">{u.nome}</span>
                  <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${u.perfil === 'super_admin' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-100 text-stone-700'}`}>
                    {u.perfil === 'super_admin' ? 'Super admin' : 'Admin'}
                  </span>
                  {!u.ativo && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Desativado</span>}
                  {souEu && <span className="text-xs text-stone-500">(você)</span>}
                </div>
                <p className="text-sm text-stone-600">{u.email}</p>

                <div className="mt-3 flex flex-wrap items-end gap-2">
                  {!souEu && (
                    <>
                      <form action={mudarPerfil.bind(null, u.id)} className="flex items-end gap-2">
                        <label className="text-xs font-semibold text-stone-600">
                          Perfil
                          <select name="perfil" defaultValue={u.perfil} className="adm-campo mt-1 py-1.5 text-sm">
                            <option value="admin">Admin</option>
                            <option value="super_admin">Super admin</option>
                          </select>
                        </label>
                        <button type="submit" className="adm-botao-sec">
                          Salvar perfil
                        </button>
                      </form>
                      <form action={alternarAtivo.bind(null, u.id)}>
                        <button type="submit" className="adm-botao-sec">
                          {u.ativo ? 'Desativar' : 'Reativar'}
                        </button>
                      </form>
                    </>
                  )}
                  <details className="w-full">
                    <summary className="cursor-pointer py-1 text-sm font-semibold text-emerald-800">Redefinir senha</summary>
                    <form action={redefinirSenha.bind(null, u.id)} className="mt-2 flex flex-wrap items-end gap-2">
                      <label className="text-xs font-semibold text-stone-600">
                        Nova senha (mínimo 8 caracteres)
                        <input name="senha" type="password" minLength={8} required autoComplete="new-password" className="adm-campo mt-1 py-1.5 text-sm" />
                      </label>
                      <button type="submit" className="adm-botao-sec">
                        Salvar senha
                      </button>
                    </form>
                  </details>
                  {!souEu && (
                    <details className="w-full">
                      <summary className="cursor-pointer py-1 text-sm font-semibold text-red-700">Excluir usuário</summary>
                      <form action={excluirUsuario.bind(null, u.id)} className="mt-2">
                        <button type="submit" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                          Confirmar exclusão de {u.nome}
                        </button>
                      </form>
                    </details>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      <aside>
        <NovoUsuario />
      </aside>
    </div>
  );
}
