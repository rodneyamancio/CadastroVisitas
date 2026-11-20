'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { DIAS, PERIODOS } from '@/lib/config';
import { lancarVisita, type ValoresDoLancamento } from '../acoes';

type Opcao = { valor: string; nome: string };

function Campo(props: {
  nome: keyof ValoresDoLancamento;
  rotulo: string;
  valor: string;
  erro?: string;
  ajuda?: string;
  tipo?: string;
  modo?: 'tel' | 'numeric';
  max?: number;
  opcional?: boolean;
}) {
  const id = `lancar-${props.nome}`;
  return (
    <div>
      <label htmlFor={id} className="block text-base font-bold text-stone-900">
        {props.rotulo} {props.opcional && <span className="font-normal text-stone-500">(opcional)</span>}
      </label>
      <input
        id={id}
        name={props.nome}
        type={props.tipo ?? 'text'}
        inputMode={props.modo}
        defaultValue={props.valor}
        maxLength={props.max}
        aria-invalid={Boolean(props.erro)}
        aria-describedby={props.erro ? `${id}-erro` : undefined}
        className={`adm-campo mt-1 py-3 text-lg ${props.erro ? 'border-red-500' : ''}`}
      />
      {props.erro ? (
        <p id={`${id}-erro`} className="mt-1 text-base font-semibold text-red-700">
          {props.erro}
        </p>
      ) : (
        props.ajuda && <p className="mt-1 text-sm text-stone-500">{props.ajuda}</p>
      )}
    </div>
  );
}

function Escolha(props: { nome: keyof ValoresDoLancamento; rotulo: string; valor: string; erro?: string; opcoes: Opcao[] }) {
  const id = `lancar-${props.nome}`;
  return (
    <div>
      <label htmlFor={id} className="block text-base font-bold text-stone-900">
        {props.rotulo}
      </label>
      <select id={id} name={props.nome} defaultValue={props.valor} aria-invalid={Boolean(props.erro)} className={`adm-campo mt-1 py-3 text-lg ${props.erro ? 'border-red-500' : ''}`}>
        <option value="">Escolha…</option>
        {props.opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nome}
          </option>
        ))}
      </select>
      {props.erro && <p className="mt-1 text-base font-semibold text-red-700">{props.erro}</p>}
    </div>
  );
}

export default function FormularioLancar({ grupos, inicio }: { grupos: Opcao[]; inicio: ValoresDoLancamento }) {
  const [estado, acao, pendente] = useActionState(lancarVisita, undefined);
  // Com erro, os campos voltam com o que foi digitado (o React limpa os campos depois de enviar)
  const v = estado?.valores ?? inicio;
  const erros = estado?.erros ?? {};
  const jaNaLista = estado?.jaNaLista ?? [];

  return (
    <form action={acao} className="cartao space-y-4">
      <div key={JSON.stringify(v)} className="space-y-4">
        {grupos.length > 1 ? <Escolha nome="grupo" rotulo="Grupo" valor={v.grupo} erro={erros.grupo} opcoes={grupos} /> : <input type="hidden" name="grupo" value={grupos[0]?.valor ?? ''} />}
        <Campo nome="responsavel" rotulo="Nome do responsável pela casa" valor={v.responsavel} erro={erros.responsavel} max={120} />
        <Campo nome="telefone" rotulo="Telefone" valor={v.telefone} erro={erros.telefone} tipo="tel" modo="tel" ajuda="Com DDD. Exemplo: (11) 91234-5678." />
        <Campo nome="endereco" rotulo="Rua ou avenida" valor={v.endereco} erro={erros.endereco} max={160} />
        <div className="grid grid-cols-2 gap-3">
          <Campo nome="numero" rotulo="Número" valor={v.numero} erro={erros.numero} max={12} ajuda="S/N se não tiver." />
          <Campo nome="complemento" rotulo="Complemento" valor={v.complemento} max={120} ajuda="Opcional. Exemplo: casa 2." />
        </div>
        <Campo nome="bairro" rotulo="Bairro" valor={v.bairro} max={80} opcional ajuda="Em branco, o sistema descobre pela rua." />
        <div className="grid gap-3 sm:grid-cols-2">
          <Escolha nome="data_visita" rotulo="Dia" valor={v.data_visita} erro={erros.data_visita} opcoes={DIAS.map((d) => ({ valor: d.valor, nome: d.curto }))} />
          <Escolha nome="periodo" rotulo="Horário" valor={v.periodo} erro={erros.periodo} opcoes={PERIODOS.map((p) => ({ valor: p.valor, nome: p.nome }))} />
        </div>
        <div>
          <label htmlFor="lancar-comentario" className="block text-base font-bold text-stone-900">
            Comentário <span className="font-normal text-stone-500">(opcional)</span>
          </label>
          <textarea id="lancar-comentario" name="comentario" defaultValue={v.comentario} maxLength={500} rows={3} className="adm-campo mt-1 text-lg" />
        </div>
      </div>

      {estado?.erro && !jaNaLista.length && (
        <p className="rounded-lg bg-red-50 p-3 text-base font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}

      {jaNaLista.length > 0 && (
        <div className="space-y-3 rounded-xl border-2 border-amber-300 bg-amber-50 p-4 text-base text-amber-950" role="alert">
          <p className="font-extrabold">Nada foi gravado: parece que esta família já está na sua lista.</p>
          <ul className="space-y-2">
            {jaNaLista.map((p) => (
              <li key={p.id} className="rounded-lg bg-white/70 p-3">
                <p className="font-bold">{p.responsavel}</p>
                <p>{p.endereco}</p>
                <p>
                  {p.visita} · {p.feita ? 'já marcada como feita' : 'ainda não marcada como feita'}
                </p>
              </li>
            ))}
          </ul>
          <p>Se for a mesma família, volte para a lista e marque a visita como feita lá.</p>
          <Link href={v.data_visita ? `/lider?dia=${v.data_visita}` : '/lider'} className="adm-botao w-full py-3 text-base">
            É a mesma família: voltar para a lista
          </Link>
          <button type="submit" name="mesmo_assim" value="1" disabled={pendente} className="adm-botao-sec w-full py-3 text-base">
            É outra família: lançar mesmo assim
          </button>
        </div>
      )}

      {!jaNaLista.length && (
        <button type="submit" disabled={pendente} className="w-full rounded-xl bg-emerald-700 px-4 py-3.5 text-lg font-extrabold text-white disabled:opacity-60">
          {pendente ? 'Gravando…' : 'Lançar visita feita'}
        </button>
      )}
    </form>
  );
}
