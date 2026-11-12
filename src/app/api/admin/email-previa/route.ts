import { urlBase, usuarioAtual } from '@/lib/auth';
import { emails } from '@/lib/email';

export const dynamic = 'force-dynamic';

// Mostra como ficam os e-mails enviados pelo sistema (só super admin).
export async function GET(req: Request) {
  const eu = await usuarioAtual();
  if (eu?.perfil !== 'super_admin') return new Response('Não autorizado', { status: 401 });
  const tipo = new URL(req.url).searchParams.get('tipo');
  const origem = await urlBase();
  const link = `${origem}/admin/definir-senha?codigo=exemplo`;
  const email =
    tipo === 'redefinicao'
      ? emails.redefinicao(eu.nome, link, '1 hora')
      : tipo === 'alterada'
        ? emails.senhaAlterada(eu.nome)
        : tipo === 'teste'
          ? emails.teste(eu.nome)
          : tipo === 'pedido'
            ? emails.pedidoDeAcesso(eu.nome, { nome: 'Maria Aparecida', email: 'maria@exemplo.com' }, `${origem}/admin/usuarios`)
            : tipo === 'aprovado'
              ? emails.acessoAprovado('Maria Aparecida', `${origem}/admin/login`)
              : tipo === 'recusado'
                ? emails.acessoRecusado('Maria Aparecida')
                : emails.convite('Maria Aparecida', link, '3 dias', eu.nome);
  return new Response(email.html, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
