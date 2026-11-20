"use client";

import { useActionState } from "react";
import { salvarVisita } from "../../../acoes";
import CamposDaVisita, { type DadosDaVisita } from "../CamposDaVisita";

export default function FormularioEdicao({ id, v, grupos }: { id: number; v: DadosDaVisita; grupos: { valor: string; nome: string }[] }) {
  const [estado, acao, pendente] = useActionState(salvarVisita.bind(null, id), undefined);
  // Com erro, os campos voltam com o que foi digitado; depois de salvar, com os valores gravados.
  // Depois de salvar, a página manda de novo os valores gravados (inclusive o grupo)
  const valores = estado?.valores ?? v;

  return (
    <form action={acao} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      {/* A chave recria os campos (as listas não acompanham o valor inicial sozinhas) */}
      <CamposDaVisita key={JSON.stringify(valores)} v={valores} erros={estado?.erros ?? {}} grupos={grupos} />

      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
          <p className="font-semibold">{estado.ok}</p>
          {estado.mudancas && estado.mudancas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {estado.mudancas.map((m) => (
                <li key={m.campo}>
                  {m.campo}: <span className="text-stone-600 line-through">{m.antes}</span> → <strong>{m.depois}</strong>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      <button type="submit" disabled={pendente} className="adm-botao">
        {pendente ? "Salvando…" : "Salvar alterações"}
      </button>
    </form>
  );
}
