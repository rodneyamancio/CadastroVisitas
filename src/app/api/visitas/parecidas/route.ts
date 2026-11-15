import { NextResponse } from 'next/server';
import { ipDoCliente } from '@/lib/auth';
import { parecidasCom } from '@/lib/duplicidade';
import { dentroDoLimite } from '@/lib/limite';

// Conferência enquanto a pessoa preenche o formulário: já existe cadastro parecido?
// Devolve só o que quem cadastra já digitou de forma parecida (ver parecidasCom).
const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export async function POST(req: Request) {
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c) return NextResponse.json({ parecidas: [] }, { status: 400 });
  if (!dentroDoLimite(`parecidas:${await ipDoCliente()}`, 300, 10 * 60_000)) return NextResponse.json({ parecidas: [] }, { status: 429 });

  const dados = {
    responsavel: texto(c.nome, 120),
    telefone: texto(c.telefone, 20).replace(/\D/g, ''),
    endereco: texto(c.rua, 160),
    numero: texto(c.numero, 12),
    complemento: texto(c.complemento, 120) || null,
  };
  const ignorar = new Set(Array.isArray(c.ignorar) ? c.ignorar.filter((n): n is number => Number.isInteger(n)) : []);
  try {
    const parecidas = (await parecidasCom(dados)).filter((p) => !ignorar.has(p.id));
    return NextResponse.json({ parecidas }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (e) {
    console.error('Falha ao procurar cadastro parecido', e);
    return NextResponse.json({ parecidas: [] }, { status: 500 });
  }
}
