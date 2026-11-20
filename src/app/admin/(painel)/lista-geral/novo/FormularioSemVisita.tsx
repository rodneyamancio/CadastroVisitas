"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cadastrarSemVisita } from "../../../acoes-cadastros";
import CamposDaVisita, { VISITA_VAZIA } from "../../visitas/CamposDaVisita";

function Formulario({ recomecar }: { recomecar: () => void }) {
  const [estado, acao, pendente] = useActionState(cadastrarSemVisita, undefined);
  const valores = estado?.valores ?? VISITA_VAZIA;
  const parecidas = estado?.parecidas ?? [];

  return (
    <form action={acao} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      {estado?.criado && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
          <p className="font-semibold">
            Cadastro sem visita nº {estado.criado.id} gravado: {estado.criado.nome}.
          </p>
          <p className="mt-1">
            Ele já aparece na lista geral.{" "}
            <Link href={`/admin/lista-geral/${estado.criado.id}`} className="font-semibold underline">
              Abrir o cadastro nº {estado.criado.id}
            </Link>
          </p>
          <p className="mt-1 text-emerald-800">O formulário abaixo já está limpo para o próximo cadastro.</p>
        </div>
      )}

      {/* Famílias que a pessoa já disse serem outras continuam dispensadas */}
      {(estado?.ignoradas ?? []).map((chave) => (
        <input key={chave} type="hidden" name="ignorar" value={chave} />
      ))}

      {/* A chave recria os campos: com erro, voltam com o que foi digitado; depois de gravar, vazios */}
      <CamposDaVisita key={`${estado?.criado?.id ?? 0}-${JSON.stringify(valores)}`} v={valores} erros={estado?.erros ?? {}} novo semVisita />

      {estado?.erro && !parecidas.length && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}

      {parecidas.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p className="font-bold">Nada foi gravado: parece que esta família já está na lista geral.</p>
          <ul className="space-y-2">
            {parecidas.map((p) => (
              <li key={p.chave} className="rounded-lg bg-white/70 p-3">
                <p className="font-semibold">
                  {p.titulo} <span className="font-normal text-amber-800">({p.motivos.join(", ")})</span>
                </p>
                <p>
                  {p.telefone} · {p.endereco}
                </p>
                <p>{p.situacao}</p>
                <Link href={p.href} target="_blank" className="font-semibold underline">
                  Abrir (nova aba)
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={recomecar} className="adm-botao-sec">
              É a mesma família: não cadastrar
            </button>
            <button type="submit" name="ignorar" value={parecidas.map((p) => p.chave).join(",")} disabled={pendente} className="adm-botao">
              É outra família: cadastrar mesmo assim
            </button>
          </div>
        </div>
      )}

      <button type="submit" disabled={pendente} className="adm-botao">
        {pendente ? "Gravando…" : "Gravar cadastro sem visita"}
      </button>
    </form>
  );
}

export default function FormularioSemVisita() {
  // "É a mesma família": recomeça o formulário do zero
  const [rodada, setRodada] = useState(0);
  return <Formulario key={rodada} recomecar={() => setRodada((r) => r + 1)} />;
}
