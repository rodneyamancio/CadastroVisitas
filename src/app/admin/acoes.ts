'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { criarSessao, encerrarSessao, exigirSuperAdmin, exigirUsuario, ipDoCliente } from '@/lib/auth';
import { sql } from '@/lib/db';
import { dentroDoLimite } from '@/lib/limite';
import { conferirSenha, hashSenha } from '@/lib/senha';
import { localizarVisita } from '@/lib/visitas';

export type Retorno = { erro?: string; ok?: string; valores?: { nome?: string; email: string; perfil?: string } } | undefined;

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function entrar(_anterior: Retorno, fd: FormData): Promise<Retorno> {
  const email = campo(fd, 'email').toLowerCase();
  const senha = String(fd.get('senha') ?? '');
  if (!email || !senha) return { erro: 'Preencha o e-mail e a senha.' };
  if (!dentroDoLimite(`login:${await ipDoCliente()}:${email}`, 8, 10 * 60_000)) {
    return { erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' };
  }
  const [u] = await sql<{ id: number; senha_hash: string; ativo: boolean }>(
    'SELECT id, senha_hash, ativo FROM usuarios WHERE email = $1',
    [email],
  );
  if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) return { erro: 'E-mail ou senha incorretos.', valores: { email } };
  await criarSessao(u.id);
  redirect('/admin');
}

export async function sair(): Promise<void> {
  await encerrarSessao();
  redirect('/admin/login');
}

export async function excluirVisita(id: number): Promise<void> {
  await exigirUsuario();
  await sql('DELETE FROM visitas WHERE id = $1', [id]);
  revalidatePath('/admin', 'layout');
}

// Tenta achar no mapa os endereços que ainda não têm posição (até 15 por vez).
export async function localizarPendentes(): Promise<void> {
  await exigirUsuario();
  const pendentes = await sql<{ id: number }>('SELECT id FROM visitas WHERE lat IS NULL ORDER BY id LIMIT 15');
  for (const p of pendentes) {
    try {
      await localizarVisita(p.id);
    } catch (e) {
      console.error('Falha ao localizar endereço', p.id, e);
    }
  }
  revalidatePath('/admin', 'layout');
}

export async function criarUsuario(_anterior: Retorno, fd: FormData): Promise<Retorno> {
  await exigirSuperAdmin();
  const nome = campo(fd, 'nome').slice(0, 120);
  const email = campo(fd, 'email').toLowerCase().slice(0, 160);
  const senha = String(fd.get('senha') ?? '');
  const perfil = campo(fd, 'perfil');
  const falhou = (erro: string): Retorno => ({ erro, valores: { nome, email, perfil } });
  if (nome.length < 2) return falhou('Informe o nome do usuário.');
  if (!EMAIL.test(email)) return falhou('Informe um e-mail válido.');
  if (senha.length < 8) return falhou('A senha precisa ter pelo menos 8 caracteres.');
  if (perfil !== 'admin' && perfil !== 'super_admin') return falhou('Escolha o perfil.');
  const [existe] = await sql('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  if (existe) return falhou('Já existe um usuário com este e-mail.');
  await sql('INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, $4)', [nome, email, hashSenha(senha), perfil]);
  revalidatePath('/admin/usuarios');
  return { ok: `Usuário ${nome} cadastrado.` };
}

function voltar(aviso: string): never {
  revalidatePath('/admin/usuarios');
  redirect(`/admin/usuarios?aviso=${aviso}`);
}

export async function alternarAtivo(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  if (id === eu.id) voltar('proprio');
  await sql('UPDATE usuarios SET ativo = NOT ativo WHERE id = $1', [id]);
  voltar('salvo');
}

export async function mudarPerfil(id: number, fd: FormData): Promise<void> {
  const eu = await exigirSuperAdmin();
  const perfil = campo(fd, 'perfil');
  if (id === eu.id) voltar('proprio');
  if (perfil !== 'admin' && perfil !== 'super_admin') voltar('invalido');
  await sql('UPDATE usuarios SET perfil = $2 WHERE id = $1', [id, perfil]);
  voltar('salvo');
}

export async function redefinirSenha(id: number, fd: FormData): Promise<void> {
  await exigirSuperAdmin();
  const senha = String(fd.get('senha') ?? '');
  if (senha.length < 8) voltar('senha-curta');
  await sql('UPDATE usuarios SET senha_hash = $2 WHERE id = $1', [id, hashSenha(senha)]);
  voltar('senha');
}

export async function excluirUsuario(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  if (id === eu.id) voltar('proprio');
  await sql('DELETE FROM usuarios WHERE id = $1', [id]);
  voltar('excluido');
}
