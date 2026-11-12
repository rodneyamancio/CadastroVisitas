import { NextResponse } from 'next/server';
import { ipDoCliente } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ehRobo, tipoDeAparelho } from '@/lib/dispositivo';
import { dentroDoLimite } from '@/lib/limite';

const TIPOS = new Set(['acesso', 'clique', 'campo', 'tentativa', 'cadastro']);
const ID = /^[\w-]{6,64}$/;
const fracao = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : null);

export async function POST(req: Request) {
  const agente = req.headers.get('user-agent') ?? '';
  const corpo = (await req.json().catch(() => null)) as { visitante?: unknown; sessao?: unknown; eventos?: unknown } | null;
  if (!corpo || ehRobo(agente)) return new NextResponse(null, { status: 204 });
  const { visitante, sessao } = corpo;
  if (typeof visitante !== 'string' || typeof sessao !== 'string' || !ID.test(visitante) || !ID.test(sessao) || !Array.isArray(corpo.eventos)) {
    return new NextResponse(null, { status: 204 });
  }
  if (!dentroDoLimite(`eventos:${await ipDoCliente()}`, 300, 10 * 60_000)) return new NextResponse(null, { status: 429 });

  const dispositivo = tipoDeAparelho(agente);
  const linhas = (corpo.eventos as Record<string, unknown>[])
    .slice(0, 40)
    .filter((e) => e && typeof e.tipo === 'string' && TIPOS.has(e.tipo))
    .map((e) => ({
      tipo: e.tipo as string,
      chave: typeof e.chave === 'string' ? e.chave.slice(0, 40) : null,
      fx: fracao(e.fx),
      fy: fracao(e.fy),
      dados: e.dados && typeof e.dados === 'object' ? JSON.stringify(e.dados).slice(0, 500) : null,
    }));
  if (linhas.length) {
    await sql(
      `INSERT INTO eventos (visitante, sessao, tipo, chave, fx, fy, dispositivo, dados)
       SELECT $1, $2, e.tipo, e.chave, e.fx, e.fy, $3, e.dados::jsonb
       FROM jsonb_to_recordset($4::jsonb) AS e(tipo text, chave text, fx real, fy real, dados text)`,
      [visitante, sessao, dispositivo, JSON.stringify(linhas)],
    );
  }
  return new NextResponse(null, { status: 204 });
}
