import { CENTRO, CIDADE_PADRAO, UF_PADRAO } from './config';

// Busca de endereços: Photon (sugestões enquanto digita e endereço a partir do GPS)
// e Nominatim (posição da casa pelo número). Ambos usam dados do OpenStreetMap.
const PHOTON = process.env.PHOTON_URL || 'https://photon.komoot.io';
const NOMINATIM = process.env.NOMINATIM_URL || 'https://nominatim.openstreetmap.org';
const AGENTE = process.env.GEOCODER_USER_AGENT || 'family-visit-form/1.0';

// Grande São Paulo: resultados fora desta área são descartados
export const REGIAO = { oeste: -47.25, sul: -24.05, leste: -46.0, norte: -23.15 };

export function dentroDaRegiao(lat: number, lng: number): boolean {
  return lat >= REGIAO.sul && lat <= REGIAO.norte && lng >= REGIAO.oeste && lng <= REGIAO.leste;
}

export type Sugestao = {
  rua: string;
  bairro: string;
  cidade: string;
  uf: string;
  cep: string;
  detalhe: string;
  lat: number;
  lng: number;
};

const UFS: Record<string, string> = {
  Acre: 'AC', Alagoas: 'AL', Amapá: 'AP', Amazonas: 'AM', Bahia: 'BA', Ceará: 'CE', 'Distrito Federal': 'DF',
  'Espírito Santo': 'ES', Goiás: 'GO', Maranhão: 'MA', 'Mato Grosso': 'MT', 'Mato Grosso do Sul': 'MS',
  'Minas Gerais': 'MG', Pará: 'PA', Paraíba: 'PB', Paraná: 'PR', Pernambuco: 'PE', Piauí: 'PI',
  'Rio de Janeiro': 'RJ', 'Rio Grande do Norte': 'RN', 'Rio Grande do Sul': 'RS', Rondônia: 'RO', Roraima: 'RR',
  'Santa Catarina': 'SC', 'São Paulo': 'SP', Sergipe: 'SE', Tocantins: 'TO',
};

async function buscarJson(url: string, ms = 6000): Promise<unknown> {
  const r = await fetch(url, {
    headers: { 'User-Agent': AGENTE, 'Accept-Language': 'pt-BR' },
    signal: AbortSignal.timeout(ms),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Serviço de endereços respondeu ${r.status}`);
  return r.json();
}

type PhotonItem = {
  properties: Record<string, string | undefined>;
  geometry: { coordinates: [number, number] };
};

function deFoton(item: PhotonItem): Sugestao | null {
  const p = item.properties;
  const rua = p.type === 'house' ? p.street : p.type === 'street' ? p.name : p.street;
  const [lng, lat] = item.geometry.coordinates;
  if (!rua || !dentroDaRegiao(lat, lng)) return null;
  const bairro = p.locality || p.district || '';
  const cidade = p.city || p.county || '';
  const uf = p.state ? (UFS[p.state] ?? p.state) : '';
  const partes = [bairro, p.district && p.district !== bairro ? p.district : '', cidade && uf ? `${cidade} - ${uf}` : cidade];
  return { rua, bairro, cidade, uf, cep: p.postcode || '', detalhe: partes.filter(Boolean).join(' · '), lat, lng };
}

const BBOX = `${REGIAO.oeste},${REGIAO.sul},${REGIAO.leste},${REGIAO.norte}`;
const cacheBusca = new Map<string, { em: number; itens: Sugestao[] }>();

export async function sugerirEnderecos(texto: string): Promise<Sugestao[]> {
  const chave = texto.trim().toLowerCase().replace(/\s+/g, ' ');
  const guardado = cacheBusca.get(chave);
  if (guardado && Date.now() - guardado.em < 10 * 60_000) return guardado.itens;

  const url =
    `${PHOTON}/api/?q=${encodeURIComponent(chave)}&lat=${CENTRO.lat}&lon=${CENTRO.lng}` +
    `&limit=25&bbox=${BBOX}&layer=street&layer=house`;
  const dados = (await buscarJson(url)) as { features?: PhotonItem[] };

  // Sem repetir a mesma rua/bairro e com as ruas mais próximas do setor primeiro
  const vistos = new Set<string>();
  const unicos: Sugestao[] = [];
  for (const f of dados.features ?? []) {
    const s = deFoton(f);
    if (!s) continue;
    const id = `${s.rua}|${s.bairro}|${s.cidade}`.toLowerCase();
    if (vistos.has(id)) continue;
    vistos.add(id);
    unicos.push(s);
  }
  const distancia = (s: Sugestao) => Math.hypot(s.lat - CENTRO.lat, (s.lng - CENTRO.lng) * 0.92);
  const itens = unicos.sort((a, b) => distancia(a) - distancia(b)).slice(0, 6);
  if (cacheBusca.size > 2000) cacheBusca.clear();
  cacheBusca.set(chave, { em: Date.now(), itens });
  return itens;
}

export async function enderecoDoPonto(lat: number, lng: number): Promise<Sugestao | null> {
  const url = `${PHOTON}/reverse?lat=${lat}&lon=${lng}&limit=1&layer=street&layer=house`;
  const dados = (await buscarJson(url)) as { features?: PhotonItem[] };
  const f = dados.features?.[0];
  return f ? deFoton(f) : null;
}

// O Nominatim aceita no máximo 1 consulta por segundo: as chamadas passam por uma fila.
let fila: Promise<unknown> = Promise.resolve();
const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));
function naFila<T>(fn: () => Promise<T>): Promise<T> {
  const resultado = fila.then(fn, fn);
  fila = resultado.then(
    () => espera(1100),
    () => espera(1100),
  );
  return resultado;
}

export type Posicao = { lat: number; lng: number; precisao: 'numero' | 'rua'; cep: string };

type NominatimItem = {
  lat: string;
  lon: string;
  place_rank?: number;
  address?: Record<string, string | undefined>;
};

export async function localizarEndereco(e: {
  rua: string;
  numero: string;
  bairro?: string | null;
  cidade?: string | null;
  uf?: string | null;
}): Promise<Posicao | null> {
  const numero = /^\d/.test(e.numero) ? e.numero : '';
  const cidade = e.cidade || CIDADE_PADRAO;
  const uf = e.uf || UF_PADRAO;
  const comum = `format=jsonv2&limit=1&addressdetails=1&countrycodes=br&viewbox=${BBOX}&bounded=1`;
  const consultas = [
    `street=${encodeURIComponent(`${numero} ${e.rua}`.trim())}&city=${encodeURIComponent(cidade)}&state=${encodeURIComponent(uf)}`,
    `q=${encodeURIComponent([e.rua, numero, e.bairro, cidade, uf].filter(Boolean).join(', '))}`,
  ];
  for (const consulta of consultas) {
    const itens = (await naFila(() => buscarJson(`${NOMINATIM}/search?${comum}&${consulta}`))) as NominatimItem[];
    const item = itens?.[0];
    if (!item) continue;
    const lat = Number(item.lat);
    const lng = Number(item.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng) || !dentroDaRegiao(lat, lng)) continue;
    const a = item.address ?? {};
    const achouNumero = Boolean(numero) && (a.house_number !== undefined || (item.place_rank ?? 0) >= 30);
    return {
      lat,
      lng,
      precisao: achouNumero ? 'numero' : 'rua',
      cep: a.postcode || '',
    };
  }
  return null;
}
