import Link from 'next/link';
import { exigirSuperAdmin } from '@/lib/auth';
import { sql } from '@/lib/db';
import { emailPronto } from '@/lib/email';
import { alternarAtivo, aprovarPedido, enviarLink, excluirUsuario, mudarPerfil, recusarPedido, redefinirSenha } from '../../acoes';
import NovoUsuario from './NovoUsuario';

type Linha = {
  id: number;
  nome: string;
  email: string;
  perfil: 'super_admin' | 'admin';
  ativo: boolean;
  senha_pendente: boolean;
  aguardando_aprovacao: boolean;
  criado_em: Date;
};

const AVISOS: Record<string, { texto: string; erro?: boolean }> = {
  salvo: { texto: 'Alteração salva.' },
  senha: { texto: 'Senha redefinida.' },
  excluido: { texto: 'Usuário excluído.' },
  link: { texto: 'E-mail enviado com o link para a pessoa criar a senha.' },
  aprovado: { texto: 'Pedido aprovado. A pessoa já pode entrar no painel.' },
  recusado: { texto: 'Pedido recusado e removido.' },
  'email-falhou': { texto: 'Não foi possível enviar o e-mail. Confira o envio de e-mail em Configurações (o motivo está na Auditoria).', erro: true },
  proprio: { texto: 'Você não pode alterar o seu próprio usuário por aqui. Para trocar a sua senha, use "Minha conta".', erro: true },
  'senha-curta': { texto: 'A senha precisa ter pelo menos 8 caracteres.', erro: true },
  invalido: { texto: 'Não foi possível concluir: os dados mudaram. Confira a lista e tente de novo.', erro: true },
};

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export default async function Usuarios({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eu = await exigirSuperAdmin();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === 'string' ? AVISOS[sp.aviso] : undefined;
  const [todos, comEmail] = await Promise.all([
    sql<Linha>('SELECT id, nome, email, perfil, ativo, senha_pendente, aguardando_aprovacao, criado_em FROM usuarios ORDER BY nome'),
    emailPronto(),
  ]);
  const pedidos = todos.filter((u) => u.aguardando_aprovacao);
  const usuarios = todos.filter((u) => !u.aguardando_aprovacao);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-1 text-xl font-extrabold text-stone-900">Usuários do painel</h1>
        <p className="mb-4 text-sm text-stone-600">
          <strong>Super admin</strong> vê tudo e cuida de usuários, auditoria e configurações. <strong>Admin</strong> vê, exporta e exclui visitas.
        </p>
        {aviso && (
          <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${aviso.erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`} role="status">
            {aviso.texto}
          </p>
        )}

        {pedidos.length > 0 && (
          <div className="mb-6 rounded-xl border-2 border-amber-300 bg-amber-50 p-4">
            <h2 className="text-base font-extrabold text-amber-950">
              {pedidos.length} {pedidos.length === 1 ? 'pedido de acesso aguardando' : 'pedidos de acesso aguardando'} a sua aprovação
            </h2>
            <p className="mb-3 text-sm text-amber-900">Pessoas que preencheram o cadastro pela tela de entrada. Elas só entram no painel depois de aprovadas.</p>
            <ul className="space-y-2">
              {pedidos.map((u) => (
                <li key={u.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-lg bg-white p-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-stone-900">{u.nome}</p>
                    <p className="text-sm break-all text-stone-600">
                      {u.email} · pediu em {quando.format(u.criado_em)}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <form action={aprovarPedido.bind(null, u.id)}>
                      <button type="submit" className="adm-botao">
                        Aprovar
                      </button>
                    </form>
                    <form action={recusarPedido.bind(null, u.id)}>
                      <button type="submit" className="adm-botao-sec text-red-700">
                        Recusar
                      </button>
                    </form>
                  </div>
                </li>
              ))}
            </ul>
          </div>
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
                  {u.senha_pendente && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Convite enviado: ainda não criou a senha</span>}
                  {!u.ativo && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Desativado</span>}
                  {souEu && <span className="text-xs text-stone-500">(você)</span>}
                </div>
                <p className="text-sm text-stone-600">{u.email}</p>

                {souEu ? (
                  <Link href="/admin/conta" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline">
                    Alterar minha senha
                  </Link>
                ) : (
                  <div className="mt-3 flex flex-wrap items-end gap-2">
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
                    {comEmail && u.ativo && (
                      <form action={enviarLink.bind(null, u.id)}>
                        <button type="submit" className="adm-botao-sec">
                          {u.senha_pendente ? 'Reenviar convite por e-mail' : 'Enviar link para criar nova senha'}
                        </button>
                      </form>
                    )}
                    <details className="w-full">
                      <summary className="cursor-pointer py-1 text-sm font-semibold text-emerald-800">Definir a senha aqui</summary>
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
                    <details className="w-full">
                      <summary className="cursor-pointer py-1 text-sm font-semibold text-red-700">Excluir usuário</summary>
                      <form action={excluirUsuario.bind(null, u.id)} className="mt-2">
                        <button type="submit" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                          Confirmar exclusão de {u.nome}
                        </button>
                      </form>
                    </details>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <aside>
        <NovoUsuario comEmail={comEmail} />
      </aside>
    </div>
  );
}
