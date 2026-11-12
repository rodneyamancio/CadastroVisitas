import { registrar } from './auditoria';
import { urlBase, type Usuario } from './auth';
import { sql } from './db';
import { ErroEmail, emailPronto, emails, enviarEmail } from './email';

// Pedidos de acesso feitos pelo autocadastro: o super admin aprova ou recusa
// (pelo painel ou pelo servidor MCP).
export type Pedido = { id: number; nome: string; email: string; perfil: string; criado_em: Date };

export const pedidosPendentes = () =>
  sql<Pedido>('SELECT id, nome, email, perfil, criado_em FROM usuarios WHERE aguardando_aprovacao ORDER BY id');

const falhaDeEmail = (autor: Usuario, u: Pedido, qual: string) => (e: unknown) =>
  registrar('email.falha', autor, `${u.nome} <${u.email}>`, { email: qual, motivo: e instanceof ErroEmail ? e.message : 'erro inesperado' });

export async function aprovarPedidoDeAcesso(id: number, autor: Usuario, origem?: string): Promise<Pedido | null> {
  const [u] = await sql<Pedido>(
    'UPDATE usuarios SET ativo = TRUE, aguardando_aprovacao = FALSE WHERE id = $1 AND aguardando_aprovacao RETURNING id, nome, email, perfil, criado_em',
    [id],
  );
  if (!u) return null;
  await registrar('usuario.aprovado', autor, `${u.nome} <${u.email}>`, { perfil: u.perfil === 'super_admin' ? 'Super admin' : 'Admin', ...(origem ? { origem } : {}) });
  if (await emailPronto()) {
    await enviarEmail({ para: u.email, ...emails.acessoAprovado(u.nome, `${await urlBase()}/admin/login`) }).catch(falhaDeEmail(autor, u, 'acesso aprovado'));
  }
  return u;
}

export async function recusarPedidoDeAcesso(id: number, autor: Usuario, origem?: string): Promise<Pedido | null> {
  const [u] = await sql<Pedido>('DELETE FROM usuarios WHERE id = $1 AND aguardando_aprovacao RETURNING id, nome, email, perfil, criado_em', [id]);
  if (!u) return null;
  await registrar('usuario.recusado', autor, `${u.nome} <${u.email}>`, origem ? { origem } : undefined);
  if (await emailPronto()) {
    await enviarEmail({ para: u.email, ...emails.acessoRecusado(u.nome) }).catch(falhaDeEmail(autor, u, 'acesso recusado'));
  }
  return u;
}
