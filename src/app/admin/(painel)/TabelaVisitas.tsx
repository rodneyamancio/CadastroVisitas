'use client';

import Link from 'next/link';
import { Fragment, useEffect, useMemo, useState } from 'react';
import BotaoExcluir from './BotaoExcluir';
import CaixaConfirmada from './CaixaConfirmada';
import CaixaPortal from './CaixaPortal';

// Uma linha da tabela, já pronta para mostrar. O IP e o aparelho só vêm para o super admin.
export type LinhaVisita = {
  id: number;
  responsavel: string;
  telefone: string;
  telefoneTexto: string;
  endereco: string;
  observacoes: string;
  bairro: string;
  dataVisita: string;
  dia: string;
  periodo: string;
  periodoNome: string;
  confirmar: boolean | null;
  criadoEm: number;
  criadoTexto: string;
  criadoDia: string; // AAAA-MM-DD, horário de Brasília
  migrado: boolean;
  detalhePortal?: string;
  // A equipe já ligou e confirmou a visita com a família
  confirmada: boolean;
  detalheConfirmada?: string;
  linkMapa: string;
  // Outros cadastros que podem ser da mesma família
  duplicidades: { par: number; texto: string }[];
  ip?: string;
  aparelho?: string;
};

type Coluna = 'portal' | 'responsavel' | 'telefone' | 'endereco' | 'bairro' | 'dia' | 'periodo' | 'confirmar' | 'confirmada' | 'criado' | 'ip';
type Ordem = { coluna: Coluna; sentido: 'asc' | 'desc' } | null;
type Filtros = Record<Coluna, string>;

const SEM_FILTROS: Filtros = { portal: '', responsavel: '', telefone: '', endereco: '', bairro: '', dia: '', periodo: '', confirmar: '', confirmada: '', criado: '', ip: '' };
const SEM_BAIRRO = '(sem bairro)';
const GUARDADO = 'painel-tabela-visitas';

const alfabetico = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const limpo = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
const contem = (onde: string, trecho: string) => limpo(onde).includes(limpo(trecho.trim()));
const ordemConfirmar = (l: LinhaVisita) => (l.confirmar == null ? 2 : l.confirmar ? 0 : 1);
const textoConfirmar = (l: LinhaVisita) => (l.confirmar == null ? 'Não informado' : l.confirmar ? 'Sim' : 'Não');
// Situação da confirmação: 0 = falta confirmar (pediu contato), 1 = não confirmada, 2 = confirmada
const ordemConfirmada = (l: LinhaVisita) => (l.confirmada ? 2 : l.confirmar ? 0 : 1);
const textoConfirmada = (l: LinhaVisita) => (l.confirmada ? 'Confirmada' : l.confirmar ? 'Falta confirmar (pediu contato)' : 'Não confirmada');
const dataCurta = (iso: string) => iso.split('-').reverse().join('/');

const COLUNAS: { id: Coluna; nome: string; soSuperAdmin?: boolean; comparar: (a: LinhaVisita, b: LinhaVisita) => number }[] = [
  { id: 'portal', nome: 'Portal oficial', comparar: (a, b) => Number(a.migrado) - Number(b.migrado) },
  { id: 'confirmada', nome: 'Ligou e confirmou', comparar: (a, b) => ordemConfirmada(a) - ordemConfirmada(b) },
  { id: 'responsavel', nome: 'Responsável', comparar: (a, b) => alfabetico.compare(a.responsavel, b.responsavel) },
  { id: 'telefone', nome: 'Telefone', comparar: (a, b) => alfabetico.compare(a.telefone, b.telefone) },
  { id: 'endereco', nome: 'Endereço', comparar: (a, b) => alfabetico.compare(a.endereco, b.endereco) },
  { id: 'bairro', nome: 'Bairro', comparar: (a, b) => alfabetico.compare(a.bairro, b.bairro) },
  { id: 'dia', nome: 'Dia', comparar: (a, b) => a.dataVisita.localeCompare(b.dataVisita) || a.periodo.localeCompare(b.periodo) },
  { id: 'periodo', nome: 'Horário', comparar: (a, b) => a.periodo.localeCompare(b.periodo) },
  { id: 'confirmar', nome: 'Confirmar antes', comparar: (a, b) => ordemConfirmar(a) - ordemConfirmar(b) },
  { id: 'criado', nome: 'Cadastrado em', comparar: (a, b) => a.criadoEm - b.criadoEm },
  { id: 'ip', nome: 'IP / aparelho', soSuperAdmin: true, comparar: (a, b) => alfabetico.compare(a.ip ?? '', b.ip ?? '') },
];

// Formas de agrupar: "chave" ordena os grupos, "rotulo" é o nome que aparece.
const GRUPOS: { id: string; nome: string; soSuperAdmin?: boolean; chave: (l: LinhaVisita) => string; rotulo: (l: LinhaVisita) => string }[] = [
  { id: 'portal', nome: 'Portal oficial', chave: (l) => (l.migrado ? '1' : '0'), rotulo: (l) => (l.migrado ? 'Migrado' : 'Falta migrar') },
  { id: 'bairro', nome: 'Bairro', chave: (l) => (l.bairro ? `0${limpo(l.bairro)}` : '1'), rotulo: (l) => l.bairro || 'Sem bairro' },
  { id: 'dia', nome: 'Dia', chave: (l) => l.dataVisita, rotulo: (l) => l.dia },
  { id: 'periodo', nome: 'Horário', chave: (l) => l.periodo, rotulo: (l) => l.periodoNome },
  { id: 'diaPeriodo', nome: 'Dia e horário', chave: (l) => `${l.dataVisita}|${l.periodo}`, rotulo: (l) => `${l.dia} · ${l.periodoNome}` },
  { id: 'confirmar', nome: 'Confirmar antes', chave: (l) => String(ordemConfirmar(l)), rotulo: (l) => `Confirmar antes: ${textoConfirmar(l)}` },
  { id: 'confirmada', nome: 'Ligou e confirmou', chave: (l) => String(ordemConfirmada(l)), rotulo: (l) => textoConfirmada(l) },
  { id: 'duplicidade', nome: 'Possível duplicidade', chave: (l) => (l.duplicidades.length ? '0' : '1'), rotulo: (l) => (l.duplicidades.length ? 'Com possível duplicidade' : 'Sem duplicidade apontada') },
  { id: 'criado', nome: 'Data do cadastro', chave: (l) => l.criadoDia, rotulo: (l) => `Cadastradas em ${dataCurta(l.criadoDia)}` },
  { id: 'ip', nome: 'IP de quem cadastrou', soSuperAdmin: true, chave: (l) => (l.ip ? `0${l.ip}` : '1'), rotulo: (l) => (l.ip ? `${l.ip}${l.aparelho ? ` · ${l.aparelho}` : ''}` : 'Sem IP') },
];

function passa(l: LinhaVisita, f: Filtros): boolean {
  if (f.portal && (f.portal === 'migrado') !== l.migrado) return false;
  if (f.responsavel.trim() && !contem(l.responsavel, f.responsavel)) return false;
  if (f.telefone.trim()) {
    const digitos = f.telefone.replace(/\D/g, '');
    if (digitos ? !l.telefone.includes(digitos) : !contem(l.telefoneTexto, f.telefone)) return false;
  }
  if (f.endereco.trim() && !contem(`${l.endereco} ${l.observacoes}`, f.endereco)) return false;
  if (f.bairro && (l.bairro || SEM_BAIRRO) !== f.bairro) return false;
  if (f.dia && l.dataVisita !== f.dia) return false;
  if (f.periodo && l.periodo !== f.periodo) return false;
  if (f.confirmar && String(ordemConfirmar(l)) !== f.confirmar) return false;
  if (f.confirmada === 'nao' ? l.confirmada : f.confirmada && String(ordemConfirmada(l)) !== f.confirmada) return false;
  if (f.criado && l.criadoDia !== f.criado) return false;
  if (f.ip.trim() && !contem(`${l.ip ?? ''} ${l.aparelho ?? ''}`, f.ip)) return false;
  return true;
}

const CAMPO =
  'block w-full min-w-0 rounded-md border border-stone-300 bg-white px-1.5 py-1 text-xs font-normal text-stone-900 normal-case placeholder:text-stone-400 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-200 focus:outline-none';
const BOTAO_LEVE = 'rounded-md px-2 py-1 text-sm font-semibold text-emerald-800 underline hover:bg-emerald-50';

export default function TabelaVisitas({ linhas, superAdmin }: { linhas: LinhaVisita[]; superAdmin: boolean }) {
  const [ordem, setOrdem] = useState<Ordem>(null);
  const [filtros, setFiltros] = useState<Filtros>(SEM_FILTROS);
  const [agrupar, setAgrupar] = useState('');
  const [fechados, setFechados] = useState<Set<string>>(new Set());
  const [carregou, setCarregou] = useState(false);

  const colunas = COLUNAS.filter((c) => superAdmin || !c.soSuperAdmin);
  const grupos = GRUPOS.filter((g) => superAdmin || !g.soSuperAdmin);
  const totalDeColunas = colunas.length + 1;

  // A ordem e o agrupamento escolhidos ficam guardados neste navegador.
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(GUARDADO) ?? 'null') as { ordem?: Ordem; agrupar?: string } | null;
      if (g?.ordem && COLUNAS.some((c) => c.id === g.ordem?.coluna)) setOrdem(g.ordem);
      if (g?.agrupar && GRUPOS.some((x) => x.id === g.agrupar)) setAgrupar(g.agrupar);
    } catch {}
    setCarregou(true);
  }, []);
  useEffect(() => {
    if (!carregou) return;
    try {
      localStorage.setItem(GUARDADO, JSON.stringify({ ordem, agrupar }));
    } catch {}
  }, [carregou, ordem, agrupar]);

  const opcoes = useMemo(() => {
    const unicos = <T,>(itens: T[], chave: (i: T) => string) => [...new Map(itens.map((i) => [chave(i), i])).values()];
    return {
      bairros: [...new Set(linhas.map((l) => l.bairro || SEM_BAIRRO))].sort((a, b) => (a === SEM_BAIRRO ? 1 : b === SEM_BAIRRO ? -1 : alfabetico.compare(a, b))),
      dias: unicos(linhas, (l) => l.dataVisita).sort((a, b) => a.dataVisita.localeCompare(b.dataVisita)),
      periodos: unicos(linhas, (l) => l.periodo).sort((a, b) => a.periodo.localeCompare(b.periodo)),
      cadastros: [...new Set(linhas.map((l) => l.criadoDia))].sort().reverse(),
    };
  }, [linhas]);

  const visiveis = useMemo(() => {
    const filtradas = linhas.filter((l) => passa(l, filtros));
    const coluna = ordem && COLUNAS.find((c) => c.id === ordem.coluna);
    if (!coluna) return filtradas;
    const sinal = ordem.sentido === 'asc' ? 1 : -1;
    return [...filtradas].sort((a, b) => sinal * coluna.comparar(a, b));
  }, [linhas, filtros, ordem]);

  const grupoAtivo = grupos.find((g) => g.id === agrupar);
  const blocos = useMemo(() => {
    if (!grupoAtivo) return null;
    const mapa = new Map<string, { chave: string; rotulo: string; linhas: LinhaVisita[] }>();
    for (const l of visiveis) {
      const chave = grupoAtivo.chave(l);
      const bloco = mapa.get(chave) ?? { chave, rotulo: grupoAtivo.rotulo(l), linhas: [] };
      bloco.linhas.push(l);
      mapa.set(chave, bloco);
    }
    return [...mapa.values()].sort((a, b) => alfabetico.compare(a.chave, b.chave));
  }, [visiveis, grupoAtivo]);

  const filtrando = Object.values(filtros).some((v) => v.trim());
  const filtrar = (coluna: Coluna, valor: string) => setFiltros((f) => ({ ...f, [coluna]: valor }));
  const ordenar = (coluna: Coluna) =>
    setOrdem((o) => (o?.coluna !== coluna ? { coluna, sentido: 'asc' } : o.sentido === 'asc' ? { coluna, sentido: 'desc' } : null));
  const alternarGrupo = (chave: string) =>
    setFechados((f) => {
      const novo = new Set(f);
      if (!novo.delete(chave)) novo.add(chave);
      return novo;
    });

  function campoDeFiltro(c: (typeof COLUNAS)[number]) {
    const comum = { className: CAMPO, value: filtros[c.id], 'aria-label': `Filtrar por ${c.nome}` };
    const escolha = (itens: { valor: string; nome: string }[]) => (
      <select {...comum} onChange={(e) => filtrar(c.id, e.target.value)}>
        <option value="">Todos</option>
        {itens.map((i) => (
          <option key={i.valor} value={i.valor}>
            {i.nome}
          </option>
        ))}
      </select>
    );
    switch (c.id) {
      case 'portal':
        return escolha([
          { valor: 'falta', nome: 'Falta migrar' },
          { valor: 'migrado', nome: 'Migrado' },
        ]);
      case 'bairro':
        return escolha(opcoes.bairros.map((b) => ({ valor: b, nome: b })));
      case 'dia':
        return escolha(opcoes.dias.map((l) => ({ valor: l.dataVisita, nome: l.dia })));
      case 'periodo':
        return escolha(opcoes.periodos.map((l) => ({ valor: l.periodo, nome: l.periodoNome })));
      case 'confirmar':
        return escolha([
          { valor: '0', nome: 'Sim' },
          { valor: '1', nome: 'Não' },
          { valor: '2', nome: 'Não informado' },
        ]);
      case 'confirmada':
        return escolha([
          { valor: '0', nome: 'Falta confirmar (pediu contato)' },
          { valor: 'nao', nome: 'Não confirmadas (todas)' },
          { valor: '2', nome: 'Confirmadas' },
        ]);
      case 'criado':
        return escolha(opcoes.cadastros.map((d) => ({ valor: d, nome: dataCurta(d) })));
      default:
        return <input {...comum} type="search" placeholder="Filtrar" onChange={(e) => filtrar(c.id, e.target.value)} />;
    }
  }

  const linhaDaVisita = (l: LinhaVisita) => (
    <tr key={l.id} className="align-top hover:bg-stone-50">
      <td className="px-2 py-2">
        <CaixaPortal id={l.id} nome={l.responsavel} migrado={l.migrado} detalhe={l.detalhePortal} />
      </td>
      <td className="px-2 py-2">
        <CaixaConfirmada id={l.id} nome={l.responsavel} confirmada={l.confirmada} pediuContato={l.confirmar === true} detalhe={l.detalheConfirmada} />
      </td>
      <td className="min-w-32 px-2 py-2.5 font-semibold text-stone-900">
        {l.responsavel}
        {l.duplicidades.map((d) => (
          <Link key={d.par} href={`/admin/duplicidades#par-${d.par}`} className="mt-0.5 block text-xs font-semibold text-amber-800 underline">
            Possível duplicidade: {d.texto}
          </Link>
        ))}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap">
        <a href={`https://wa.me/55${l.telefone}`} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">
          {l.telefoneTexto}
        </a>
      </td>
      <td className="min-w-48 px-2 py-2.5">
        <a href={l.linkMapa} target="_blank" rel="noopener noreferrer" className="text-emerald-800 underline">
          {l.endereco}
        </a>
        {l.observacoes && <div className="text-xs text-stone-500">{l.observacoes}</div>}
      </td>
      <td className="px-2 py-2.5">{l.bairro}</td>
      <td className="px-2 py-2.5 whitespace-nowrap">{l.dia}</td>
      <td className="px-2 py-2.5">{l.periodoNome}</td>
      <td className="px-2 py-2.5">
        {l.confirmar == null ? <span className="text-stone-400">não informado</span> : l.confirmar ? <span className="font-semibold text-amber-800">Sim</span> : 'Não'}
      </td>
      <td className="px-2 py-2.5 whitespace-nowrap text-stone-600">{l.criadoTexto}</td>
      {superAdmin && (
        <td className="px-2 py-2.5 text-xs text-stone-600">
          <div className="font-mono">{l.ip || 'sem IP'}</div>
          <div>{l.aparelho}</div>
        </td>
      )}
      <td className="px-2 py-2.5 text-right whitespace-nowrap">
        <Link href={`/admin/visitas/${l.id}`} className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 hover:bg-emerald-50">
          Editar
        </Link>
        <BotaoExcluir id={l.id} nome={l.responsavel} />
      </td>
    </tr>
  );

  return (
    <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-stone-200 px-3 py-2.5 text-sm">
        <label className="flex items-center gap-2 font-semibold text-stone-700">
          Agrupar por
          <select
            value={agrupar}
            onChange={(e) => {
              setAgrupar(e.target.value);
              setFechados(new Set());
            }}
            className="rounded-lg border border-stone-300 bg-white px-2 py-1.5 text-sm font-normal text-stone-900 focus:border-emerald-700 focus:ring-2 focus:ring-emerald-200 focus:outline-none"
          >
            <option value="">Sem agrupar</option>
            {grupos.map((g) => (
              <option key={g.id} value={g.id}>
                {g.nome}
              </option>
            ))}
          </select>
        </label>
        {blocos && blocos.length > 0 && (
          <span className="flex items-center gap-1">
            <button type="button" className={BOTAO_LEVE} onClick={() => setFechados(new Set())}>
              Expandir todos
            </button>
            <button type="button" className={BOTAO_LEVE} onClick={() => setFechados(new Set(blocos.map((b) => b.chave)))}>
              Recolher todos
            </button>
          </span>
        )}
        <span className="ml-auto text-stone-600" role="status">
          {filtrando ? `Mostrando ${visiveis.length} de ${linhas.length}` : `${linhas.length} ${linhas.length === 1 ? 'visita' : 'visitas'}`}
          {blocos ? ` em ${blocos.length} ${blocos.length === 1 ? 'grupo' : 'grupos'}` : ''}
        </span>
        {(filtrando || ordem) && (
          <button
            type="button"
            className={BOTAO_LEVE}
            onClick={() => {
              setFiltros(SEM_FILTROS);
              setOrdem(null);
            }}
          >
            Limpar filtros e ordem
          </button>
        )}
      </div>

      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[70rem] border-collapse text-left text-sm">
          <thead className="bg-stone-50 text-xs text-stone-600 uppercase">
            <tr>
              {colunas.map((c) => {
                const ativa = ordem?.coluna === c.id ? ordem.sentido : null;
                return (
                  <th key={c.id} scope="col" className="px-1 pt-1.5 font-semibold" aria-sort={ativa === 'asc' ? 'ascending' : ativa === 'desc' ? 'descending' : 'none'}>
                    <button
                      type="button"
                      onClick={() => ordenar(c.id)}
                      title={`Ordenar por ${c.nome}`}
                      className={`flex w-full items-center gap-1 rounded-md px-1 py-1.5 text-left uppercase hover:bg-stone-200 ${ativa ? 'text-emerald-800' : ''}`}
                    >
                      {c.nome}
                      <span aria-hidden="true" className={`text-sm leading-none ${ativa ? '' : 'text-stone-400'}`}>
                        {ativa === 'asc' ? '↑' : ativa === 'desc' ? '↓' : '↕'}
                      </span>
                    </button>
                  </th>
                );
              })}
              <th scope="col" className="px-2 py-2.5 font-semibold">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
            <tr className="border-b border-stone-200">
              {colunas.map((c) => (
                <td key={c.id} className="px-1 pt-0.5 pb-2">
                  {campoDeFiltro(c)}
                </td>
              ))}
              <td />
            </tr>
          </thead>
          <tbody className="divide-y divide-stone-100">
            {visiveis.length === 0 ? (
              <tr>
                <td colSpan={totalDeColunas} className="px-3 py-8 text-center text-stone-600">
                  Nenhuma visita com estes filtros.{' '}
                  <button type="button" className={BOTAO_LEVE} onClick={() => setFiltros(SEM_FILTROS)}>
                    Limpar filtros
                  </button>
                </td>
              </tr>
            ) : blocos ? (
              blocos.map((b) => {
                const fechado = fechados.has(b.chave);
                const migradas = b.linhas.filter((l) => l.migrado).length;
                return (
                  <Fragment key={b.chave}>
                    <tr className="bg-stone-100">
                      <td colSpan={totalDeColunas} className="p-0">
                        <button
                          type="button"
                          aria-expanded={!fechado}
                          onClick={() => alternarGrupo(b.chave)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-stone-200"
                        >
                          <svg viewBox="0 0 24 24" className={`h-4 w-4 shrink-0 text-stone-600 transition-transform ${fechado ? '' : 'rotate-90'}`} fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                            <path d="m9 6 6 6-6 6" />
                          </svg>
                          <span className="font-bold text-stone-900">{b.rotulo}</span>
                          <span className="text-stone-600">
                            {b.linhas.length} {b.linhas.length === 1 ? 'visita' : 'visitas'} · {migradas} {migradas === 1 ? 'migrada' : 'migradas'}
                          </span>
                        </button>
                      </td>
                    </tr>
                    {!fechado && b.linhas.map(linhaDaVisita)}
                  </Fragment>
                );
              })
            ) : (
              visiveis.map(linhaDaVisita)
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
