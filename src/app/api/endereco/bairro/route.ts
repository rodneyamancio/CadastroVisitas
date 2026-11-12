import { NextResponse } from 'next/server';
import { ipDoCliente } from '@/lib/auth';
import { bairroDaRua } from '@/lib/bairro';
import { dentroDoLimite } from '@/lib/limite';

// Bairro oficial (Correios) da rua escolhida no formulário.
export async function GET(req: Request) {
  const p = new URL(req.url).searchParams;
  const rua = (p.get('rua') ?? '').trim().slice(0, 120);
  if (rua.length < 3) return NextResponse.json({ bairro: null });
  if (!dentroDoLimite(`bairro:${await ipDoCliente()}`, 200, 10 * 60_000)) {
    return NextResponse.json({ bairro: null }, { status: 429 });
  }
  try {
    const achado = await bairroDaRua({
      rua,
      numero: (p.get('numero') ?? '').slice(0, 10),
      cidade: (p.get('cidade') ?? '').slice(0, 80),
      uf: (p.get('uf') ?? '').slice(0, 2),
      cep: (p.get('cep') ?? '').slice(0, 10),
    });
    return NextResponse.json({ bairro: achado?.bairro ?? null, cep: achado?.cep ?? null });
  } catch {
    return NextResponse.json({ bairro: null });
  }
}
