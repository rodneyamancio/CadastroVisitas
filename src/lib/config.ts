export const TITULO = 'Cadastro de Famílias';
export const SUBTITULO = 'Missão Fraternal · Setor Freguesia do Ó';

export const DIAS = [
  { valor: '2026-11-28', semana: 'Sábado', data: '28 de novembro', numero: '28/11', curto: 'Sábado 28/11' },
  { valor: '2026-11-29', semana: 'Domingo', data: '29 de novembro', numero: '29/11', curto: 'Domingo 29/11' },
] as const;

export const PERIODOS = [
  { valor: 'manha', nome: 'Manhã', detalhe: 'antes do almoço' },
  { valor: 'tarde', nome: 'Tarde', detalhe: 'depois do almoço' },
] as const;

export type Dia = (typeof DIAS)[number]['valor'];
export type Periodo = (typeof PERIODOS)[number]['valor'];

export const nomeDia = (v: string) => DIAS.find((d) => d.valor === v)?.curto ?? v;
export const nomePeriodo = (v: string) => PERIODOS.find((p) => p.valor === v)?.nome ?? v;

// Centro aproximado da Freguesia do Ó (São Paulo - SP)
export const CENTRO = { lat: -23.4925, lng: -46.6975 };
export const CIDADE_PADRAO = 'São Paulo';
export const UF_PADRAO = 'SP';

export const PRECISOES: Record<string, string> = {
  gps: 'Localização do celular',
  numero: 'Número da casa',
  rua: 'Rua',
};
