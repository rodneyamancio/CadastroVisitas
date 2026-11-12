import { createHash, randomBytes } from 'node:crypto';
import { sql } from './db';

export type TipoToken = 'convite' | 'redefinicao';

const VALIDADE_H: Record<TipoToken, number> = { convite: 72, redefinicao: 1 };
export const validadeEmTexto = (tipo: TipoToken) => (tipo === 'convite' ? '3 dias' : '1 hora');

const resumo = (codigo: string) => createHash('sha256').update(codigo).digest('hex');

// Cria um link de uso único. Os links anteriores do mesmo usuário deixam de valer.
export async function criarToken(usuarioId: number, tipo: TipoToken): Promise<string> {
  const codigo = randomBytes(32).toString('base64url');
  await sql('DELETE FROM tokens_senha WHERE usuario_id = $1 AND usado_em IS NULL', [usuarioId]);
  await sql(`INSERT INTO tokens_senha (usuario_id, hash, tipo, expira_em) VALUES ($1, $2, $3, now() + make_interval(hours => $4))`, [
    usuarioId,
    resumo(codigo),
    tipo,
    VALIDADE_H[tipo],
  ]);
  return codigo;
}

export type TokenValido = { id: number; usuario_id: number; tipo: TipoToken; nome: string; email: string };

export async function lerToken(codigo: string): Promise<TokenValido | null> {
  if (!/^[\w-]{20,100}$/.test(codigo)) return null;
  const [t] = await sql<TokenValido>(
    `SELECT t.id, t.usuario_id, t.tipo, u.nome, u.email
     FROM tokens_senha t JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.hash = $1 AND t.usado_em IS NULL AND t.expira_em > now() AND u.ativo`,
    [resumo(codigo)],
  );
  return t ?? null;
}

export const usarToken = (id: number) => sql('UPDATE tokens_senha SET usado_em = now() WHERE id = $1', [id]);
