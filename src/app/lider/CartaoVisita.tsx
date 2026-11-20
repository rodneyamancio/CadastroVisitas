'use client';

import { useRef, useState, useTransition } from 'react';
import { marcarVisitaFeita, salvarComentario } from './acoes';

export type VisitaDoLider = {
  id: number;
  numero: number;
  responsavel: string;
  telefone: string;
  telefoneTexto: string;
  endereco: string;
  bairro: string;
  observacoes: string;
  linkMapa: string;
  pediuContato: boolean;
  confirmada: boolean;
  feita: boolean;
  feitaTexto: string;
  comentario: string;
  lancada: boolean;
  grupo: string;
};

const JANELA = 'm-auto w-[calc(100%-2rem)] max-w-md rounded-2xl bg-white p-5 text-stone-900 shadow-xl backdrop:bg-black/60';
const ACAO = 'inline-flex flex-1 items-center justify-center rounded-xl border-2 border-stone-300 bg-white px-3 py-2.5 text-base font-bold text-emerald-800 active:bg-stone-100';

// Cartão de uma visita na lista do líder. Marcar como feita abre um aviso para confirmar;
// depois de confirmada, o líder não tem como desmarcar (só a coordenação).
export default function CartaoVisita({ v }: { v: VisitaDoLider }) {
  const avisoFeita = useRef<HTMLDialogElement>(null);
  const avisoComentario = useRef<HTMLDialogElement>(null);
  const [pendente, iniciar] = useTransition();
  const [erro, setErro] = useState('');
  const [comentario, setComentario] = useState(v.comentario);

  const abrir = (janela: React.RefObject<HTMLDialogElement | null>) => {
    setErro('');
    setComentario(v.comentario);
    janela.current?.showModal();
    // O foco vai para o título e não para o campo de comentário: no celular, o teclado não sobe sozinho
    janela.current?.querySelector('h4')?.focus();
  };

  const enviar = (acao: typeof marcarVisitaFeita, janela: React.RefObject<HTMLDialogElement | null>) =>
    iniciar(async () => {
      try {
        const r = await acao(v.id, comentario);
        if (r?.erro) setErro(r.erro);
        else janela.current?.close();
      } catch {
        setErro('Não foi possível gravar. Confira a internet e tente de novo.');
      }
    });

  const campoComentario = (
    <label className="mt-4 block text-base font-bold text-stone-900">
      Comentário <span className="font-normal text-stone-500">(opcional)</span>
      <textarea
        value={comentario}
        onChange={(e) => setComentario(e.target.value)}
        maxLength={500}
        rows={3}
        placeholder="Exemplo: família pediu outra visita, não tinha ninguém em casa…"
        className="adm-campo mt-1 text-lg"
      />
    </label>
  );
  const mensagemDeErro = erro && (
    <p className="mt-3 rounded-lg bg-red-50 p-3 text-base font-semibold text-red-800" role="alert">
      {erro}
    </p>
  );

  return (
    <article className={`rounded-2xl border-2 p-4 shadow-sm ${v.feita ? 'border-emerald-300 bg-emerald-50' : 'border-stone-200 bg-white'}`}>
      <div className="flex items-start gap-3">
        <span
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-extrabold ${v.feita ? 'bg-emerald-700 text-white' : 'bg-stone-200 text-stone-800'}`}
          aria-hidden="true"
        >
          {v.feita ? '✓' : v.numero}
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-xl font-extrabold break-words text-stone-900">{v.responsavel}</h3>
          <p className="text-lg text-stone-800">
            {v.endereco}
            {v.bairro ? ` · ${v.bairro}` : ''}
          </p>
          {v.observacoes && <p className="mt-1 text-base text-stone-600">Como achar: {v.observacoes}</p>}
        </div>
      </div>

      {(v.lancada || v.grupo || v.confirmada || v.pediuContato) && (
        <p className="mt-3 flex flex-wrap gap-2 text-sm font-semibold">
          {v.lancada && <span className="rounded-full bg-sky-100 px-3 py-1 text-sky-900">Lançada no dia (fora da lista)</span>}
          {v.grupo && <span className="rounded-full bg-stone-100 px-3 py-1 text-stone-700">{v.grupo}</span>}
          {v.confirmada ? (
            <span className="rounded-full bg-emerald-100 px-3 py-1 text-emerald-900">Família avisada por telefone</span>
          ) : (
            v.pediuContato && !v.feita && <span className="rounded-full bg-amber-100 px-3 py-1 text-amber-900">Pediu para avisar antes de ir</span>
          )}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:+55${v.telefone}`} className={ACAO} aria-label={`Ligar para ${v.responsavel}: ${v.telefoneTexto}`}>
          Ligar
        </a>
        <a href={`https://wa.me/55${v.telefone}`} target="_blank" rel="noopener noreferrer" className={ACAO}>
          WhatsApp
        </a>
        <a href={v.linkMapa} target="_blank" rel="noopener noreferrer" className={ACAO}>
          Mapa
        </a>
      </div>
      <p className="mt-1 text-center text-sm text-stone-500">{v.telefoneTexto}</p>

      {v.comentario && (
        <p className="mt-3 rounded-xl bg-white/80 p-3 text-base text-stone-800 ring-1 ring-stone-200">
          <span className="font-bold">Comentário:</span> {v.comentario}
        </p>
      )}

      <div className="mt-3 space-y-2">
        {v.feita ? (
          <p className="text-center text-lg font-extrabold text-emerald-900">
            ✓ Visita feita
            {v.feitaTexto && <span className="block text-sm font-semibold text-emerald-800">{v.feitaTexto}</span>}
          </p>
        ) : (
          <button type="button" onClick={() => abrir(avisoFeita)} className="w-full rounded-xl bg-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white active:bg-emerald-800">
            Marcar como feita
          </button>
        )}
        <button type="button" onClick={() => abrir(avisoComentario)} className="w-full rounded-xl px-4 py-2 text-base font-bold text-emerald-800 underline">
          {v.comentario ? 'Alterar comentário' : 'Escrever comentário'}
        </button>
        {v.feita && <p className="text-center text-sm text-stone-600">Marcou por engano? Escreva um comentário e avise a coordenação: só ela desmarca.</p>}
      </div>

      <dialog ref={avisoFeita} className={JANELA} aria-labelledby={`feita-${v.id}`}>
        <h4 id={`feita-${v.id}`} tabIndex={-1} className="text-xl font-extrabold outline-none">
          A visita foi feita?
        </h4>
        <p className="mt-2 text-lg">
          <strong>{v.responsavel}</strong>
          <br />
          {v.endereco}
        </p>
        <p className="mt-3 rounded-lg bg-amber-50 p-3 text-base font-semibold text-amber-950">Depois de confirmar, você não consegue desmarcar. Só a coordenação desmarca.</p>
        {campoComentario}
        {mensagemDeErro}
        <div className="mt-4 grid gap-2">
          <button type="button" disabled={pendente} onClick={() => enviar(marcarVisitaFeita, avisoFeita)} className="rounded-xl bg-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white disabled:opacity-60">
            {pendente ? 'Gravando…' : 'Sim, a visita foi feita'}
          </button>
          <button type="button" disabled={pendente} onClick={() => avisoFeita.current?.close()} className="rounded-xl border-2 border-stone-300 px-4 py-3 text-lg font-bold text-stone-800">
            Ainda não, voltar
          </button>
        </div>
      </dialog>

      <dialog ref={avisoComentario} className={JANELA} aria-labelledby={`comentario-${v.id}`}>
        <h4 id={`comentario-${v.id}`} tabIndex={-1} className="text-xl font-extrabold outline-none">
          Comentário da visita
        </h4>
        <p className="mt-1 text-lg">{v.responsavel}</p>
        {campoComentario}
        {mensagemDeErro}
        <div className="mt-4 grid gap-2">
          <button type="button" disabled={pendente} onClick={() => enviar(salvarComentario, avisoComentario)} className="rounded-xl bg-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white disabled:opacity-60">
            {pendente ? 'Gravando…' : 'Salvar comentário'}
          </button>
          <button type="button" disabled={pendente} onClick={() => avisoComentario.current?.close()} className="rounded-xl border-2 border-stone-300 px-4 py-3 text-lg font-bold text-stone-800">
            Voltar
          </button>
        </div>
      </dialog>
    </article>
  );
}
