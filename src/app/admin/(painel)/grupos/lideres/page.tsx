import Link from 'next/link';
import { exigirUsuario, urlBase } from '@/lib/auth';
import { sql } from '@/lib/db';
import { emailPronto } from '@/lib/email';
import { opcoesDeGrupo, telefoneFormatado } from '@/lib/grupos';
import { alternarLider, definirSenhaDoLider, enviarLinkDoLider, excluirLider } from '../../../acoes-grupos';
import NovoLider from './NovoLider';

export const metadata = { title: 'Líderes de grupo' };

type Linha = {
  id: number;
  nome: string;
  email: string;
  telefone: string | null;
  perfil: string;
  ativo: boolean;
  senha_pendente: boolean;
  grupos: { id: number; nome: string }[];
};

const AVISOS: Record<string, { texto: string; erro?: boolean }> = {
  salvo: { texto: 'Alteração salva.' },
  senha: { texto: 'Senha definida. Passe a nova senha para o líder.' },
  excluido: { texto: 'Líder excluído. Os grupos dele ficaram sem líder.' },
  link: { texto: 'E-mail enviado com o link para o líder criar a senha.' },
  'email-falhou': { texto: 'Não foi possível enviar o e-mail. Defina a senha aqui mesmo (o motivo está na Auditoria).', erro: true },
  'senha-curta': { texto: 'A senha precisa ter pelo menos 8 caracteres.', erro: true },
  invalido: { texto: 'Não foi possível concluir: os dados mudaram. Confira a lista e tente de novo.', erro: true },
};

export default async function Lideres({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const sp = await searchParams;
  const aviso = typeof sp.aviso === 'string' ? AVISOS[sp.aviso] : undefined;
  const [pessoas, comEmail, grupos, base] = await Promise.all([
    // Líderes cadastrados e também quem é do painel e lidera algum grupo
    sql<Linha>(
      `SELECT u.id, u.nome, u.email, u.telefone, u.perfil, u.ativo, u.senha_pendente,
              COALESCE((SELECT jsonb_agg(jsonb_build_object('id', g.id, 'nome', g.nome) ORDER BY g.nome) FROM grupos g WHERE g.lider_id = u.id), '[]'::jsonb) AS grupos
       FROM usuarios u
       WHERE u.perfil = 'lider' OR EXISTS (SELECT 1 FROM grupos g WHERE g.lider_id = u.id)
       ORDER BY u.nome`,
    ),
    emailPronto(),
    opcoesDeGrupo(),
    urlBase(),
  ]);
  const lideres = pessoas.filter((p) => p.perfil === 'lider');
  const doPainel = pessoas.filter((p) => p.perfil !== 'lider');

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <section>
        <h1 className="mb-1 text-xl font-extrabold text-stone-900">Líderes de grupo</h1>
        <p className="mb-4 text-sm text-stone-600">
          O líder tem um acesso só para isso: entra em <strong className="break-all">{base}/lider</strong> com o e-mail e a senha, vê as visitas dos grupos dele, marca as que foram feitas, escreve comentários e
          lança visitas que não estavam na lista. Ele não enxerga o painel.
        </p>
        {aviso && (
          <p className={`mb-4 rounded-lg p-3 text-sm font-semibold ${aviso.erro ? 'bg-red-50 text-red-800' : 'bg-emerald-50 text-emerald-900'}`} role="status">
            {aviso.texto}
          </p>
        )}

        {lideres.length === 0 && <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">Ainda não há líderes cadastrados. Cadastre o primeiro ao lado.</p>}

        <ul className="space-y-3">
          {lideres.map((u) => (
            <li key={u.id} className={`rounded-xl border border-stone-200 bg-white p-4 ${u.ativo ? '' : 'opacity-70'}`}>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <span className="text-base font-bold text-stone-900">{u.nome}</span>
                {u.senha_pendente && <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Convite enviado: ainda não criou a senha</span>}
                {!u.ativo && <span className="rounded-full bg-red-100 px-2.5 py-0.5 text-xs font-semibold text-red-800">Desativado: não consegue entrar</span>}
              </div>
              <p className="text-sm break-all text-stone-600">
                {u.email}
                {u.telefone ? ` · ${telefoneFormatado(u.telefone)}` : ''}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm">
                {u.grupos.length === 0 ? (
                  <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-900">Ainda sem grupo</span>
                ) : (
                  u.grupos.map((g) => (
                    <Link key={g.id} href={`/admin/grupos/${g.id}`} className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900 underline">
                      {g.nome}
                    </Link>
                  ))
                )}
              </p>

              <div className="mt-3 flex flex-wrap items-end gap-2">
                <form action={alternarLider.bind(null, u.id)}>
                  <button type="submit" className="adm-botao-sec">
                    {u.ativo ? 'Desativar' : 'Reativar'}
                  </button>
                </form>
                {comEmail && u.ativo && (
                  <form action={enviarLinkDoLider.bind(null, u.id)}>
                    <button type="submit" className="adm-botao-sec">
                      {u.senha_pendente ? 'Reenviar convite por e-mail' : 'Enviar link para criar nova senha'}
                    </button>
                  </form>
                )}
                <details className="w-full">
                  <summary className="cursor-pointer py-1 text-sm font-semibold text-emerald-800">Definir a senha aqui</summary>
                  <form action={definirSenhaDoLider.bind(null, u.id)} className="mt-2 flex flex-wrap items-end gap-2">
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
                  <summary className="cursor-pointer py-1 text-sm font-semibold text-red-700">Excluir líder</summary>
                  <form action={excluirLider.bind(null, u.id)} className="mt-2">
                    <p className="mb-2 text-sm text-stone-600">Os grupos dele ficam sem líder. As visitas e o que ele já marcou continuam guardados.</p>
                    <button type="submit" className="rounded-lg bg-red-700 px-3 py-2 text-sm font-semibold text-white hover:bg-red-800">
                      Confirmar exclusão de {u.nome}
                    </button>
                  </form>
                </details>
              </div>
            </li>
          ))}
        </ul>

        {doPainel.length > 0 && (
          <div className="mt-6 rounded-xl border border-stone-200 bg-white p-4 text-sm text-stone-700">
            <h2 className="text-base font-extrabold text-stone-900">Pessoas do painel que também lideram grupo</h2>
            <p className="mb-2 text-stone-600">Usam o mesmo acesso do painel e abrem as visitas do grupo em {base}/lider.</p>
            <ul className="space-y-1">
              {doPainel.map((u) => (
                <li key={u.id}>
                  <strong>{u.nome}</strong>:{' '}
                  {u.grupos.map((g, i) => (
                    <span key={g.id}>
                      {i > 0 && ', '}
                      <Link href={`/admin/grupos/${g.id}`} className="font-semibold text-emerald-800 underline">
                        {g.nome}
                      </Link>
                    </span>
                  ))}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <aside>
        <NovoLider comEmail={comEmail} grupos={grupos.map((g) => ({ valor: String(g.id), nome: g.lider ? `${g.nome} (hoje com ${g.lider})` : g.nome }))} />
      </aside>
    </div>
  );
}
