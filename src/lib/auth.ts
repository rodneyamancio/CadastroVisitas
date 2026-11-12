import { cache } from 'react';
import { SignJWT, jwtVerify } from 'jose';
import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { sql } from './db';

const COOKIE = 'sessao';
const DURACAO_S = 12 * 60 * 60;

export type Perfil = 'super_admin' | 'admin';
export type Usuario = { id: number; nome: string; email: string; perfil: Perfil };

function segredo(): Uint8Array {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 32) throw new Error('SESSION_SECRET ausente ou com menos de 32 caracteres');
  return new TextEncoder().encode(s);
}

export async function criarSessao(idUsuario: number): Promise<void> {
  const token = await new SignJWT({})
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

export const usuarioAtual = cache(async (): Promise<Usuario | null> => {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  let id: number;
  try {
    const { payload } = await jwtVerify(token, segredo(), { algorithms: ['HS256'] });
    id = Number(payload.sub);
  } catch {
    return null;
  }
  if (!Number.isInteger(id)) return null;
  const [u] = await sql<Usuario>('SELECT id, nome, email, perfil FROM usuarios WHERE id = $1 AND ativo', [id]);
  return u ?? null;
});

export async function exigirUsuario(): Promise<Usuario> {
  const u = await usuarioAtual();
  if (!u) redirect('/admin/login');
  return u;
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
