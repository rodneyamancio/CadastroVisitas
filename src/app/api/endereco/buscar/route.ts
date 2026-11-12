import { NextResponse } from 'next/server';
import { ipDoCliente } from '@/lib/auth';
import { sugerirEnderecos } from '@/lib/geocode';
import { dentroDoLimite } from '@/lib/limite';

export async function GET(req: Request) {
  const q = (new URL(req.url).searchParams.get('q') ?? '').trim().slice(0, 120);
  if (q.length < 3) return NextResponse.json({ itens: [] });
  if (!dentroDoLimite(`busca:${await ipDoCliente()}`, 600, 10 * 60_000)) {
    return NextResponse.json({ itens: [] }, { status: 429 });
  }
  try {
    return NextResponse.json({ itens: await sugerirEnderecos(q) });
  } catch {
    return NextResponse.json({ itens: [], indisponivel: true });
  }
}
