import { NextResponse } from 'next/server';
import { ipDoCliente } from '@/lib/auth';
import { bairroDaRua } from '@/lib/bairro';
import { dentroDaRegiao, enderecoDoPonto } from '@/lib/geocode';
import { dentroDoLimite } from '@/lib/limite';

export async function POST(req: Request) {
  const corpo = (await req.json().catch(() => null)) as { lat?: unknown; lng?: unknown } | null;
  const lat = Number(corpo?.lat);
  const lng = Number(corpo?.lng);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return NextResponse.json({ erro: 'invalido' }, { status: 400 });
  if (!dentroDaRegiao(lat, lng)) return NextResponse.json({ fora: true });
  if (!dentroDoLimite(`reverso:${await ipDoCliente()}`, 120, 10 * 60_000)) {
    return NextResponse.json({ endereco: null }, { status: 429 });
  }
  try {
    const endereco = await enderecoDoPonto(lat, lng);
    if (endereco) {
      // O bairro e o CEP do mapa não são confiáveis: valem os dos Correios para a rua encontrada.
      const oficial = await bairroDaRua({ rua: endereco.rua, cidade: endereco.cidade, uf: endereco.uf, cep: endereco.cep }).catch(() => null);
      if (oficial) {
        endereco.bairro = oficial.bairro;
        endereco.cep = oficial.cep;
      }
    }
    return NextResponse.json({ endereco });
  } catch {
    return NextResponse.json({ endereco: null });
  }
}
