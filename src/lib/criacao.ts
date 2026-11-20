import { CIDADE_PADRAO, DIAS, PERIODOS, UF_PADRAO } from './config';
import { sql } from './db';
import { conferirDuplicidade } from './duplicidade';
import { avisarNovaVisita } from './mcp/sessoes';
import { conferirBairro, localizarVisita, type Visita } from './visitas';

// Cadastro de uma visita nova, usado pelo formulário público e pelo MCP:
// mesmas regras de validação, mesma gravação e mesmo trabalho depois de gravar.

export type NovaVisita = {
  responsavel: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string | null;
  bairro: string | null;
  cidade: string;
  uf: string;
  cep: string | null;
  observacoes: string | null;
  data_visita: string;
  periodo: string;
  confirmar_contato: boolean | null;
};

export const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

// A parte do cadastro que não depende da visita: quem mora na casa e o endereço
export type DadosDaFamilia = Omit<NovaVisita, 'data_visita' | 'periodo' | 'confirmar_contato'>;

type CamposDaFamilia = {
  nome?: unknown;
  telefone?: unknown;
  rua?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  cidade?: unknown;
  uf?: unknown;
  cep?: unknown;
  obs?: unknown;
};

// Normaliza os campos e devolve os erros por campo (chaves com os nomes do formulário público)
export function validarFamilia(c: CamposDaFamilia): { dados: DadosDaFamilia; erros: Record<string, string> } {
  const dados: DadosDaFamilia = {
    responsavel: texto(c.nome, 120),
    telefone: texto(c.telefone, 20).replace(/\D/g, ''),
    endereco: texto(c.rua, 160),
    numero: texto(c.numero, 12),
    complemento: texto(c.complemento, 120) || null,
    bairro: texto(c.bairro, 80) || null,
    cidade: texto(c.cidade, 80) || CIDADE_PADRAO,
    uf: texto(c.uf, 30) || UF_PADRAO,
    cep: texto(c.cep, 10) || null,
    observacoes: texto(c.obs, 500) || null,
  };
  const erros: Record<string, string> = {};
  if (dados.responsavel.length < 3) erros.nome = 'Escreva o nome completo do responsável pela casa.';
  if (dados.telefone.length < 10 || dados.telefone.length > 11) erros.telefone = 'Escreva o telefone com DDD. Exemplo: (11) 91234-5678.';
  if (dados.endereco.length < 3) erros.rua = 'Escreva o nome da rua ou avenida.';
  if (!dados.numero) erros.numero = 'Escreva o número da casa.';
  return { dados, erros };
}

export function validarNovaVisita(
  c: CamposDaFamilia & { dia?: unknown; periodo?: unknown; confirmar: boolean | null },
): { dados: NovaVisita; erros: Record<string, string> } {
  const familia = validarFamilia(c);
  const dados: NovaVisita = { ...familia.dados, data_visita: texto(c.dia, 10), periodo: texto(c.periodo, 10), confirmar_contato: c.confirmar };
  const erros = familia.erros;
  if (!DIAS.some((d) => d.valor === dados.data_visita)) erros.dia = 'Escolha o dia da visita.';
  if (!PERIODOS.some((p) => p.valor === dados.periodo)) erros.periodo = 'Escolha o horário da visita.';
  return { dados, erros };
}

export async function gravarVisita(
  d: NovaVisita,
  origem: { lat: number | null; lng: number | null; precisao: string | null; ip: string | null; agente: string | null; extra: Visita['extra'] },
): Promise<Visita> {
  const [nova] = await sql<Visita>(
    `INSERT INTO visitas (responsavel, telefone, endereco, numero, complemento, bairro, cidade, uf, cep, observacoes,
                          data_visita, periodo, lat, lng, precisao, ip, agente, extra, confirmar_contato)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19) RETURNING *`,
    [
      d.responsavel,
      d.telefone,
      d.endereco,
      d.numero,
      d.complemento,
      d.bairro,
      d.cidade,
      d.uf,
      d.cep,
      d.observacoes,
      d.data_visita,
      d.periodo,
      origem.lat,
      origem.lng,
      origem.precisao,
      origem.ip,
      origem.agente,
      JSON.stringify(origem.extra ?? {}),
      d.confirmar_contato,
    ],
  );
  return nova;
}

// Depois de gravar (sem prender a resposta): confere o bairro pela rua e pelo número (Correios),
// avisa quem está conectado pelo MCP, acha a casa no mapa e procura cadastro repetido.
// "trocarBairro": o bairro pode ser trocado pelo dos Correios (o escrito à mão é respeitado).
export async function processarNovaVisita(id: number, trocarBairro: boolean, precisao: string | null) {
  await conferirBairro(id, trocarBairro).catch((e) => console.error('Falha ao conferir bairro', id, e));
  await avisarNovaVisita(id).catch((e) => console.error('Falha ao avisar pelo MCP', id, e));
  if (precisao !== 'gps') await localizarVisita(id).catch((e) => console.error('Falha ao localizar endereço', id, e));
  // Por último (a IA pode demorar)
  await conferirDuplicidade(id).catch((e) => console.error('Falha ao conferir duplicidade', id, e));
}
