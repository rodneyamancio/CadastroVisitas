import { registrar } from './auditoria';
import { DIAS, PERIODOS, nomeDia, nomePeriodo } from './config';
import { sql } from './db';
import { conferirDuplicidade } from './duplicidade';
import { conferirBairro, localizarVisita, type Visita } from './visitas';

// Alteração dos dados de uma visita pelo painel ou pelo MCP. Só os campos enviados mudam.

export type Edicao = Partial<{
  responsavel: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string | null;
  bairro: string | null;
  cep: string | null;
  observacoes: string | null;
  data_visita: string;
  periodo: string;
  confirmar_contato: boolean | null;
}>;

type Campo = keyof Edicao;

export const NOMES_DOS_CAMPOS: Record<Campo, string> = {
  responsavel: 'Responsável',
  telefone: 'Telefone',
  endereco: 'Rua',
  numero: 'Número',
  complemento: 'Complemento',
  bairro: 'Bairro',
  cep: 'CEP',
  observacoes: 'Como achar a casa',
  data_visita: 'Dia da visita',
  periodo: 'Horário',
  confirmar_contato: 'Confirmar antes',
};

const MAXIMO: Partial<Record<Campo, number>> = { responsavel: 120, endereco: 160, numero: 12, complemento: 120, bairro: 80, observacoes: 500 };

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

function telefoneFormatado(t: string) {
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

// Como o valor aparece na auditoria e nas respostas
function legivel(campo: Campo, valor: unknown): string {
  if (campo === 'confirmar_contato' && valor == null) return 'Não informado';
  if (valor == null || valor === '') return '(vazio)';
  if (campo === 'telefone') return telefoneFormatado(String(valor));
  if (campo === 'data_visita') return nomeDia(String(valor));
  if (campo === 'periodo') return nomePeriodo(String(valor));
  if (campo === 'confirmar_contato') return valor ? 'Sim' : 'Não';
  return String(valor);
}

export type Mudanca = { campo: string; antes: string; depois: string };
export type ResultadoEdicao = { erro: string; erros?: Record<string, string> } | { visita: Visita; mudancas: Mudanca[] };

export async function editarVisita(
  id: number,
  pedido: Edicao,
  autor: { id: number; nome: string; email: string },
  origem: string,
): Promise<ResultadoEdicao> {
  const [atual] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
  if (!atual) return { erro: `Não existe cadastro com o número ${id}.` };

  // Normaliza o que veio, do mesmo jeito que o formulário público
  const novo: Edicao = {};
  for (const [chave, valor] of Object.entries(pedido) as [Campo, unknown][]) {
    if (valor === undefined) continue;
    if (chave === 'confirmar_contato') novo.confirmar_contato = valor == null ? null : Boolean(valor);
    else if (chave === 'telefone') novo.telefone = texto(valor, 20).replace(/\D/g, '');
    else if (chave === 'cep') novo.cep = texto(valor, 10).replace(/\D/g, '') || null;
    else if (chave === 'data_visita' || chave === 'periodo') novo[chave] = texto(valor, 10);
    else if (chave === 'responsavel' || chave === 'endereco' || chave === 'numero') novo[chave] = texto(valor, MAXIMO[chave] ?? 200);
    else novo[chave] = texto(valor, MAXIMO[chave] ?? 200) || null;
  }

  const erros: Record<string, string> = {};
  if (novo.responsavel !== undefined && novo.responsavel.length < 3) erros.responsavel = 'Escreva o nome completo do responsável pela casa.';
  if (novo.telefone !== undefined && (novo.telefone.length < 10 || novo.telefone.length > 11)) erros.telefone = 'Escreva o telefone com DDD. Exemplo: (11) 91234-5678.';
  if (novo.endereco !== undefined && novo.endereco.length < 3) erros.endereco = 'Escreva o nome da rua ou avenida.';
  if (novo.numero !== undefined && !novo.numero) erros.numero = 'Escreva o número da casa (ou S/N).';
  if (novo.cep != null && novo.cep.length !== 8) erros.cep = 'O CEP tem 8 números.';
  if (novo.data_visita !== undefined && !DIAS.some((d) => d.valor === novo.data_visita)) erros.data_visita = 'Escolha o dia da visita.';
  if (novo.periodo !== undefined && !PERIODOS.some((p) => p.valor === novo.periodo)) erros.periodo = 'Escolha o horário da visita.';
  if (Object.keys(erros).length) return { erro: 'Confira os campos destacados.', erros };

  const cepAtual = atual.cep?.replace(/\D/g, '') || null;
  const valorAtual = (c: Campo) => (c === 'cep' ? cepAtual : ((atual as Record<string, unknown>)[c] ?? null));
  const mudou = (Object.keys(novo) as Campo[]).filter((c) => (novo[c] ?? null) !== valorAtual(c));
  if (!mudou.length) return { visita: atual, mudancas: [] };

  const endereco = mudou.some((c) => c === 'endereco' || c === 'numero' || c === 'bairro');
  const sets = mudou.map((c, i) => `${c} = $${i + 2}`);
  // Endereço mudou: a posição no mapa é refeita (menos a do GPS, tirada na porta da casa)
  if (endereco && atual.precisao !== 'gps') sets.push('lat = NULL', 'lng = NULL', 'precisao = NULL');
  const [visita] = await sql<Visita>(`UPDATE visitas SET ${sets.join(', ')} WHERE id = $1 RETURNING *`, [id, ...mudou.map((c) => novo[c] ?? null)]);

  const mudancas = mudou.map((c) => ({ campo: NOMES_DOS_CAMPOS[c], antes: legivel(c, valorAtual(c)), depois: legivel(c, novo[c]) }));
  await registrar('visita.editada', autor, `Nº ${visita.id} · ${visita.responsavel}`, {
    origem,
    ...Object.fromEntries(mudancas.map((m) => [m.campo, `${m.antes} → ${m.depois}`])),
  });

  // Depois de responder: bairro pela rua, posição no mapa e duplicidade
  const ruaMudou = mudou.some((c) => c === 'endereco' || c === 'numero');
  const comparaveis = mudou.some((c) => c === 'responsavel' || c === 'telefone' || c === 'endereco' || c === 'numero' || c === 'complemento');
  void (async () => {
    if (ruaMudou && !mudou.includes('bairro')) await conferirBairro(id, true).catch((e) => console.error('Falha ao conferir bairro', id, e));
    if (endereco && atual.precisao !== 'gps') await localizarVisita(id).catch((e) => console.error('Falha ao localizar endereço', id, e));
    if (comparaveis) await conferirDuplicidade(id, true, true).catch((e) => console.error('Falha ao conferir duplicidade', id, e));
  })();

  return { visita, mudancas };
}
