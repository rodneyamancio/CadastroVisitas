'use client';

import Link from 'next/link';
import { useState, useTransition } from 'react';
import { distribuir } from '../../../acoes-grupos';

export type LinhaSemGrupo = {
  id: number;
  responsavel: string;
  endereco: string;
  bairro: string;
  quando: string;
  semPosicao: boolean;
  sugestao?: { grupo: number; nome: string; motivo: string };
};

type GrupoDaLista = { id: number; nome: string; carga: number };

// Lista das visitas sem grupo: cada linha tem a escolha do grupo. Nada é gravado até "Salvar".
export default function Distribuicao({ linhas, grupos, recorte }: { linhas: LinhaSemGrupo[]; grupos: GrupoDaLista[]; recorte: string }) {
  const [escolhas, setEscolhas] = useState<Record<number, number>>({});
  const [marcadas, setMarcadas] = useState<Set<number>>(new Set());
  const [paraMarcadas, setParaMarcadas] = useState('');
  const [pendente, iniciar] = useTransition();
  const [retorno, setRetorno] = useState<{ erro?: string; ok?: string }>();

  const escolhidas = Object.entries(escolhas).filter(([, g]) => g > 0);
  const comSugestao = linhas.filter((l) => l.sugestao);
  // Quantas visitas cada grupo recebe com as escolhas da tela
  const recebe = new Map<number, number>();
  for (const [, g] of escolhidas) recebe.set(g, (recebe.get(g) ?? 0) + 1);

  const escolher = (id: number, grupo: number) => setEscolhas((e) => ({ ...e, [id]: grupo }));
  const marcar = (id: number, sim: boolean) =>
    setMarcadas((m) => {
      const novo = new Set(m);
      if (sim) novo.add(id);
      else novo.delete(id);
      return novo;
    });

  const salvar = () =>
    iniciar(async () => {
      setRetorno(undefined);
      try {
        const r = await distribuir(escolhidas.map(([id, grupo]) => ({ id: Number(id), grupo })));
        setRetorno(r);
        // Salvou: as visitas saem da lista e as escolhas começam do zero
        if (r?.ok) {
          setEscolhas({});
          setMarcadas(new Set());
        }
      } catch {
        setRetorno({ erro: 'Não foi possível salvar. Tente de novo.' });
      }
    });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-x-4 gap-y-2 rounded-xl border border-stone-200 bg-white p-3">
        <label className="flex items-center gap-2 text-sm font-semibold text-stone-700">
          <input
            type="checkbox"
            checked={linhas.length > 0 && linhas.every((l) => marcadas.has(l.id))}
            onChange={(e) => setMarcadas(e.target.checked ? new Set(linhas.map((l) => l.id)) : new Set())}
            className="h-5 w-5 accent-emerald-700"
          />
          Marcar todas
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <label className="text-sm font-semibold text-stone-700">
            Colocar as marcadas no grupo
            <select value={paraMarcadas} onChange={(e) => setParaMarcadas(e.target.value)} className="adm-campo mt-1 py-1.5 text-sm">
              <option value="">Escolha o grupo…</option>
              {grupos.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.nome}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            disabled={!paraMarcadas || marcadas.size === 0}
            onClick={() => setEscolhas((e) => ({ ...e, ...Object.fromEntries([...marcadas].map((id) => [id, Number(paraMarcadas)])) }))}
            className="adm-botao-sec"
          >
            Aplicar às {marcadas.size} marcadas
          </button>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {comSugestao.length > 0 && (
            <button
              type="button"
              onClick={() => setEscolhas((e) => ({ ...e, ...Object.fromEntries(comSugestao.filter((l) => !e[l.id]).map((l) => [l.id, l.sugestao!.grupo])) }))}
              className="adm-botao-sec"
              title="Preenche o grupo sugerido nas visitas que ainda estão sem escolha. Você confere e depois salva."
            >
              Usar as {comSugestao.length} sugestões
            </button>
          )}
          {escolhidas.length > 0 && (
            <button type="button" onClick={() => setEscolhas({})} className="adm-botao-sec">
              Limpar escolhas
            </button>
          )}
        </div>
      </div>

      <ul className="space-y-2">
        {linhas.map((l) => {
          const escolha = escolhas[l.id] ?? 0;
          return (
            <li key={l.id} className={`grid gap-x-4 gap-y-2 rounded-xl border bg-white p-3 md:grid-cols-[auto_1fr_18rem] md:items-center ${escolha ? 'border-emerald-500' : 'border-stone-200'}`}>
              <input
                type="checkbox"
                checked={marcadas.has(l.id)}
                onChange={(e) => marcar(l.id, e.target.checked)}
                aria-label={`Marcar a visita de ${l.responsavel}`}
                className="h-5 w-5 accent-emerald-700"
              />
              <div className="min-w-0 text-sm">
                <p>
                  <Link href={`/admin/visitas/${l.id}`} className="font-bold text-stone-900 underline">
                    {l.responsavel}
                  </Link>{' '}
                  <span className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-900">{l.quando}</span>
                </p>
                <p className="text-stone-700">
                  {l.endereco}
                  {l.bairro ? ` · ${l.bairro}` : ''}
                  {l.semPosicao ? ' · sem posição no mapa' : ''}
                </p>
                {l.sugestao && (
                  <p className="mt-0.5 text-stone-600">
                    Sugestão: <strong>{l.sugestao.nome}</strong> ({l.sugestao.motivo}){' '}
                    {escolha !== l.sugestao.grupo && (
                      <button type="button" onClick={() => escolher(l.id, l.sugestao!.grupo)} className="font-semibold text-emerald-800 underline">
                        usar
                      </button>
                    )}
                  </p>
                )}
              </div>
              <select value={escolha} onChange={(e) => escolher(l.id, Number(e.target.value))} aria-label={`Grupo da visita de ${l.responsavel}`} className="adm-campo py-1.5 text-sm">
                <option value={0}>Deixar sem grupo</option>
                {grupos.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.nome}
                  </option>
                ))}
              </select>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 border-t border-stone-300 bg-stone-100/95 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8">
        {escolhidas.length > 0 && (
          <p className="mb-2 flex flex-wrap gap-1.5 text-xs font-semibold text-stone-700">
            {grupos
              .filter((g) => recebe.has(g.id))
              .map((g) => (
                <span key={g.id} className="rounded-full bg-white px-2.5 py-0.5 ring-1 ring-stone-300">
                  {g.nome}: {g.carga} + {recebe.get(g.id)}
                  {recorte ? ` em ${recorte}` : ''}
                </span>
              ))}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button type="button" disabled={pendente || escolhidas.length === 0} onClick={salvar} className="adm-botao">
            {pendente ? 'Salvando…' : escolhidas.length ? `Salvar: colocar ${escolhidas.length} ${escolhidas.length === 1 ? 'visita' : 'visitas'} nos grupos` : 'Escolha o grupo das visitas'}
          </button>
          {retorno?.erro && (
            <p className="text-sm font-semibold text-red-800" role="alert">
              {retorno.erro}
            </p>
          )}
          {retorno?.ok && (
            <p className="text-sm font-semibold text-emerald-900" role="status">
              {retorno.ok}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
