import { CIDADE_PADRAO, UF_PADRAO } from './config';

// Bairro oficial pela rua, na base dos Correios (ViaCEP).
// O mapa aberto (OpenStreetMap) marca bairros errados em boa parte da região, então o bairro
// vem daqui: procura a rua pelo nome, escolhe o trecho pelo número da casa e, quando há ruas
// de mesmo nome, fica com a de CEP mais próximo do setor.
const VIACEP = process.env.VIACEP_URL || 'https://viacep.com.br';
const CEP_DO_SETOR = 2_900_000; // região da Freguesia do Ó (029xx-xxx)

type ItemCep = { cep?: string; logradouro?: string; complemento?: string; bairro?: string };

export type BairroAchado = { bairro: string; cep: string; rua: string };

export const semAcento = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const TIPOS: Record<string, string> = {
  r: 'rua', av: 'avenida', tv: 'travessa', trav: 'travessa', al: 'alameda', pc: 'praca', pca: 'praca', est: 'estrada', estr: 'estrada', vl: 'viela',
};
const TIPO = /^(rua|avenida|travessa|alameda|praca|estrada|rodovia|viela|largo|beco|passagem|viaduto|ladeira|caminho)$/;
const ABREVIADOS: Record<string, string> = {
  dr: 'doutor', dra: 'doutora', prof: 'professor', profa: 'professora', pe: 'padre', cel: 'coronel', cap: 'capitao', ten: 'tenente',
  sgt: 'sargento', mal: 'marechal', gen: 'general', eng: 'engenheiro', sta: 'santa', sto: 'santo', pres: 'presidente', brig: 'brigadeiro',
  des: 'desembargador', cons: 'conselheiro', dep: 'deputado', sen: 'senador', ver: 'vereador', com: 'comendador', maj: 'major',
};
const TITULO =
  /^(doutor|doutora|professor|professora|padre|coronel|capitao|tenente|sargento|marechal|general|engenheiro|presidente|brigadeiro|desembargador|conselheiro|deputado|senador|vereador|comendador|major|dom|dona|frei|monsenhor)$/;

// "R. Dr. Ernesto Maieta, 120" -> { tipo: 'rua', nome: 'doutor ernesto maieta', semTitulo: 'ernesto maieta' }
function partesDaRua(rua: string) {
  const palavras = semAcento(rua.split(',')[0]).split(' ').filter(Boolean);
  let tipo = '';
  if (palavras.length > 1) {
    const primeira = TIPOS[palavras[0]] ?? palavras[0];
    if (TIPO.test(primeira)) {
      tipo = primeira;
      palavras.shift();
    }
  }
  const nome = palavras.map((p) => ABREVIADOS[p] ?? p);
  const semTitulo = nome.filter((p) => !TITULO.test(p));
  return { tipo, palavras: nome, nome: nome.join(' '), semTitulo: (semTitulo.length ? semTitulo : nome).join(' ') };
}

function distancia(a: string, b: string): number {
  if (a === b) return 0;
  let anterior = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const atual = [i];
    for (let j = 1; j <= b.length; j++) {
      atual[j] = Math.min(anterior[j] + 1, atual[j - 1] + 1, anterior[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    anterior = atual;
  }
  return anterior[b.length];
}

const parecido = (a: string, b: string) => (a && b ? 1 - distancia(a, b) / Math.max(a.length, b.length) : 0);

// Trechos dos Correios: "até 999/1000", "de 1001/1002 a 1899/1900", "de 1931/1932 ao fim", "lado ímpar"…
function trecho(complemento: string): { de: number; ate: number; lado: '' | 'par' | 'impar'; unico: boolean } {
  const c = semAcento(complemento);
  const lado = /lado impar/.test(c) ? 'impar' : /lado par/.test(c) ? 'par' : '';
  const numeros = (t: string | undefined) => (t ? t.split(' ').map(Number).filter(Number.isFinite) : []);
  const ate = c.match(/^ate ([\d ]+)/);
  if (ate) return { de: 0, ate: Math.max(...numeros(ate[1])), lado, unico: false };
  const entre = c.match(/^de ([\d ]+?) a(?:o fim| ([\d ]+))/);
  if (entre) return { de: Math.min(...numeros(entre[1])), ate: entre[2] ? Math.max(...numeros(entre[2])) : Infinity, lado, unico: false };
  // Só números ("52", "200/206"): CEP exclusivo de um prédio ou empresa, não serve para a rua toda
  return { de: 0, ate: Infinity, lado, unico: /^\d[\d ]*$/.test(c) };
}

function cabeNoTrecho(numero: number, complemento: string): boolean {
  const t = trecho(complemento);
  if (numero < t.de || numero > t.ate) return false;
  if (t.lado === 'par') return numero % 2 === 0;
  if (t.lado === 'impar') return numero % 2 === 1;
  return true;
}

const cache = new Map<string, { em: number; itens: ItemCep[] }>();

async function consultar(uf: string, cidade: string, termo: string): Promise<ItemCep[]> {
  if (termo.length < 3) return [];
  const chave = `${uf}|${cidade}|${termo}`;
  const guardado = cache.get(chave);
  if (guardado && Date.now() - guardado.em < 24 * 60 * 60_000) return guardado.itens;
  const r = await fetch(`${VIACEP}/ws/${uf}/${encodeURIComponent(cidade)}/${encodeURIComponent(termo)}/json/`, {
    signal: AbortSignal.timeout(6000),
    cache: 'no-store',
  });
  if (!r.ok) throw new Error(`Correios (ViaCEP) respondeu ${r.status}`);
  const dados = (await r.json()) as unknown;
  const itens = Array.isArray(dados) ? (dados as ItemCep[]) : [];
  if (cache.size > 5000) cache.clear();
  cache.set(chave, { em: Date.now(), itens });
  return itens;
}

const limparBairro = (b: string) => b.replace(/\s*\(.*$/, '').trim();
const cepEmNumero = (cep: string | null | undefined) => {
  const n = Number((cep ?? '').replace(/\D/g, ''));
  return (cep ?? '').replace(/\D/g, '').length === 8 ? n : NaN;
};

export async function bairroDaRua(e: {
  rua: string;
  numero?: string | null;
  cidade?: string | null;
  uf?: string | null;
  cep?: string | null;
}): Promise<BairroAchado | null> {
  const alvo = partesDaRua(e.rua);
  if (alvo.nome.length < 3) return null;
  const uf = /^[A-Za-z]{2}$/.test(e.uf ?? '') ? (e.uf as string).toUpperCase() : UF_PADRAO;
  const cidade = semAcento(e.cidade || CIDADE_PADRAO);

  // Do mais exato para o mais solto: os Correios às vezes escrevem o nome de outro jeito
  // (Maieta/Maietta, Flemming/Fleming), então as últimas buscas pegam só o começo do nome.
  const p = alvo.palavras;
  const termos = [`${alvo.tipo} ${alvo.nome}`.trim(), alvo.nome];
  if (alvo.semTitulo !== alvo.nome) termos.push(alvo.semTitulo);
  if (p.length > 1) {
    termos.push([...p.slice(0, -1), p[p.length - 1].slice(0, 3)].join(' '));
    termos.push(p.slice(0, -1).join(' '));
  }

  type Candidato = ItemCep & { nota: number; mesmoTipo: boolean };
  let candidatos: Candidato[] = [];
  for (const termo of [...new Set(termos)]) {
    const itens = await consultar(uf, cidade, termo);
    candidatos = itens
      .filter((i) => i.logradouro && i.bairro && i.cep && !trecho(i.complemento ?? '').unico)
      .map((i) => {
        const c = partesDaRua(i.logradouro as string);
        return { ...i, nota: Math.max(parecido(alvo.nome, c.nome), parecido(alvo.semTitulo, c.semTitulo)), mesmoTipo: !alvo.tipo || alvo.tipo === c.tipo };
      })
      .filter((c) => c.nota >= 0.84);
    if (candidatos.length) break;
  }
  if (!candidatos.length) return null;

  const melhorNota = Math.max(...candidatos.map((c) => c.nota));
  candidatos = candidatos.filter((c) => c.nota >= melhorNota - 0.02);
  if (candidatos.some((c) => c.mesmoTipo)) candidatos = candidatos.filter((c) => c.mesmoTipo);

  const numero = /^\d+/.test(e.numero ?? '') ? parseInt(e.numero as string, 10) : NaN;
  if (Number.isFinite(numero)) {
    const noTrecho = candidatos.filter((c) => cabeNoTrecho(numero, c.complemento ?? ''));
    if (noTrecho.length) candidatos = noTrecho;
  }

  // Ruas de mesmo nome em bairros diferentes: fica a de CEP mais perto do CEP conhecido ou do setor
  const pista = cepEmNumero(e.cep);
  const referencia = Number.isFinite(pista) ? pista : CEP_DO_SETOR;
  candidatos.sort((a, b) => Math.abs(cepEmNumero(a.cep) - referencia) - Math.abs(cepEmNumero(b.cep) - referencia));
  const escolhido = candidatos[0];
  const bairro = limparBairro(escolhido.bairro as string);
  return bairro ? { bairro, cep: escolhido.cep as string, rua: escolhido.logradouro as string } : null;
}
