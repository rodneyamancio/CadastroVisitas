import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';

const COOKIE = 'sessao';
const DURACAO_S = 12 * 60 * 60;

export type Perfil = 'super_admin' | 'admin';
export type Usuario = { id: number; nome: string; email: string; perfil: Perfil };
// Quem está com a sessão aberta: gente do painel ou líder de grupo
export type Pessoa = { id: number; nome: string; email: string; perfil: Perfil | 'lider' };

function segredo(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou com menos de 32 caracteres');
  return new TextEncoder().encode(s);
}

export async function criarSessao(idUsuario: number, versao: number): Promise<void> {
  // "v" acompanha a versão da senha: trocar a senha invalida as sessões abertas antes
  const token = await new SignJWT({ v: versao })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(String(idUsuario))
    .setIssuedAt()
    .setExpirationTime(`${DURACAO_S}s`)
    .sign(segredo());
  const https = (await headers()).get('x-forwarded-proto')?.startsWith('https') ?? false;
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: https,
    path: '/',
    maxAge: DURACAO_S,
  });
}

export async function encerrarSessao(): Promise<void> {
  (await cookies()).delete(COOKIE);
}

export const pessoaAtual = cache(async (): Promise<Pessoa | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let id: number;
  let versao: number;
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ['HS256'] });
    id = Number(payload.sub);
    versao = typeof payload.v === 'number' ? payload.v : 1;
  } catch {
    return null;
  }
  if (!Number.isInteger(id)) return null;
  const [u] = await sql<Pessoa>('SELECT id, nome, email, perfil FROM usuarios WHERE id = $1 AND ativo AND versao = $2', [id, versao]);
  return u ?? null;
});

// Usuário do painel (admin ou super admin). O líder de grupo nunca passa por aqui:
// é esta função que protege as telas, as ações e as rotas do painel.
export async function usuarioAtual(): Promise<Usuario | null> {
  const p = await pessoaAtual();
  return p && p.perfil !== 'lider' ? { ...p, perfil: p.perfil } : null;
}

// Para onde a pessoa vai depois de entrar
export const inicioDe = (p: Pick<Pessoa, 'perfil'>) => (p.perfil === 'lider' ? '/lider' : '/admin');

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (u) return u;
  // O líder que tentar abrir o painel volta para a área dele
  redirect((await pessoaAtual()) ? '/lider' : '/admin/login');
}

// Área do líder: qualquer pessoa com sessão (o admin também pode liderar um grupo).
export async function exigirPessoa(): Promise<Pessoa> {
  const p = await pessoaAtual();
  if (!p) redirect('/admin/login');
  return p;
}

export async function exigirSuperAdmin(): Promise<Usuario> {
  const u = await exigirUsuario();
  if (u.perfil !== 'super_admin') redirect('/admin');
  return u;
}

export async function ipDoCliente(): Promise<string> {
  const h = await headers();
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || 'local';
}

// Endereço público do sistema, usado nos links enviados por e-mail.
export async function urlBase(): Promise<string> {
  const fixa = process.env.APP_URL?.trim().replace(/\/$/, '');
  if (fixa) return fixa;
  const h = await headers();
  const protocolo = h.get('x-forwarded-proto')?.split(',')[0] || 'http';
  return `${protocolo}://${h.get('x-forwarded-host') || h.get('host') || 'localhost'}`;
}
