import { createHash, randomBytes } from 'node:crypto';
import type { Perfil } from '../auth';
import { sql } from '../db';

// Tokens de acesso ao servidor MCP. Cada token pertence a um usuário do painel e
// enxerga o mesmo que ele: o do super admin vê também usuários, auditoria e IP.
export type DonoDoToken = { tokenId: number; nomeDoToken: string; id: number; nome: string; email: string; perfil: Perfil };

const resumo = (token: string) => createHash('sha256').update(token).digest('hex');
export const MAX_TOKENS = 10;

export async function criarTokenMcp(usuarioId: number, nome: string): Promise<string> {
  const token = `mfo_${randomBytes(32).toString('base64url')}`;
  // As novidades começam a contar a partir de agora, não desde o primeiro cadastro.
  await sql(
    `INSERT INTO tokens_mcp (usuario_id, nome, hash, final, visto_visita, visto_usuario)
     VALUES ($1, $2, $3, $4, (SELECT COALESCE(max(id), 0) FROM visitas), (SELECT COALESCE(max(id), 0) FROM usuarios))`,
    [usuarioId, nome, resumo(token), token.slice(-4)],
  );
  return token;
}

export async function lerTokenMcp(token: string): Promise<DonoDoToken | null> {
  if (!/^mfo_[\w-]{40,50}$/.test(token)) return null;
  const [t] = await sql<DonoDoToken & { ultimo_uso: Date | null }>(
    `SELECT t.id AS "tokenId", t.nome AS "nomeDoToken", t.ultimo_uso, u.id, u.nome, u.email, u.perfil
     FROM tokens_mcp t JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.hash = $1 AND u.ativo AND NOT u.aguardando_aprovacao`,
    [resumo(token)],
  );
  if (!t) return null;
  if (!t.ultimo_uso || Date.now() - new Date(t.ultimo_uso).getTime() > 60_000) {
    await sql('UPDATE tokens_mcp SET ultimo_uso = now() WHERE id = $1', [t.tokenId]);
  }
  const { ultimo_uso: _, ...dono } = t;
  return dono;
}

export type TokenListado = { id: number; nome: string; final: string; criado_em: Date; ultimo_uso: Date | null };

export const listarTokensMcp = (usuarioId: number) =>
  sql<TokenListado>('SELECT id, nome, final, criado_em, ultimo_uso FROM tokens_mcp WHERE usuario_id = $1 ORDER BY id', [usuarioId]);

export async function revogarTokenMcp(id: number, usuarioId: number): Promise<TokenListado | null> {
  const [t] = await sql<TokenListado>('DELETE FROM tokens_mcp WHERE id = $1 AND usuario_id = $2 RETURNING id, nome, final, criado_em, ultimo_uso', [id, usuarioId]);
  return t ?? null;
}

// Perfil atual do dono de cada token que continua valendo, entre os informados.
export async function tokensValidos(ids: number[]): Promise<Map<number, Perfil>> {
  if (!ids.length) return new Map();
  const linhas = await sql<{ id: number; perfil: Perfil }>(
    `SELECT t.id, u.perfil FROM tokens_mcp t JOIN usuarios u ON u.id = t.usuario_id
     WHERE t.id = ANY($1::int[]) AND u.ativo AND NOT u.aguardando_aprovacao`,
    [ids],
  );
  return new Map(linhas.map((l) => [l.id, l.perfil]));
}
