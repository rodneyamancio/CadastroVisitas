"use client";

import Link from "next/link";
import { useActionState, useState } from "react";
import { cadastrarVisita } from "../../../acoes";
import CamposDaVisita, { VISITA_VAZIA } from "../CamposDaVisita";

const telefone = (t: string) =>
  t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;

type Grupos = { valor: string; nome: string }[];

function Formulario({ recomecar, grupos }: { recomecar: () => void; grupos: Grupos }) {
  const [estado, acao, pendente] = useActionState(cadastrarVisita, undefined);
  const valores = estado?.valores ?? VISITA_VAZIA;
  const parecidas = estado?.parecidas ?? [];

  return (
    <form action={acao} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      {estado?.criada && (
        <div className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950" role="status">
          <p className="font-semibold">
            Cadastro nº {estado.criada.id} gravado: {estado.criada.nome} · {estado.criada.visita} · {estado.criada.grupo ?? "ainda sem grupo"}.
          </p>
          <p className="mt-1">
            O bairro, a posição no mapa e a duplicidade são conferidos em seguida.{" "}
            <Link href={`/admin/visitas/${estado.criada.id}`} className="font-semibold underline">
              Abrir o cadastro nº {estado.criada.id}
            </Link>
          </p>
          <p className="mt-1 text-emerald-800">O formulário abaixo já está limpo para o próximo cadastro.</p>
        </div>
      )}

      {/* Cadastros que a pessoa já disse serem de outra família continuam dispensados */}
      {(estado?.ignoradas ?? []).map((id) => (
        <input key={id} type="hidden" name="ignorar" value={id} />
      ))}

      {/* A chave recria os campos: com erro, voltam com o que foi digitado; depois de gravar, vazios */}
      <CamposDaVisita key={`${estado?.criada?.id ?? 0}-${JSON.stringify(valores)}`} v={valores} erros={estado?.erros ?? {}} novo grupos={grupos} />

      {estado?.erro && !parecidas.length && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}

      {parecidas.length > 0 && (
        <div className="space-y-3 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">
          <p className="font-bold">Nada foi gravado: {parecidas.length === 1 ? "já existe um cadastro parecido" : "já existem cadastros parecidos"}.</p>
          <ul className="space-y-2">
            {parecidas.map((p) => (
              <li key={p.id} className="rounded-lg bg-white/70 p-3">
                <p className="font-semibold">
                  Nº {p.id} · {p.responsavel}{" "}
                  <span className="font-normal text-amber-800">({p.motivos.join(", ")})</span>
                </p>
                <p>
                  {telefone(p.telefone)} · {p.endereco}
                </p>
                <p>{p.visita}</p>
                <Link href={`/admin/visitas/${p.id}`} target="_blank" className="font-semibold underline">
                  Abrir o cadastro nº {p.id} (nova aba)
                </Link>
              </li>
            ))}
          </ul>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={recomecar} className="adm-botao-sec">
              É a mesma família: não cadastrar
            </button>
            <button type="submit" name="ignorar" value={parecidas.map((p) => p.id).join(",")} disabled={pendente} className="adm-botao">
              É outra família: cadastrar mesmo assim
            </button>
          </div>
        </div>
      )}

      <button type="submit" disabled={pendente} className="adm-botao">
        {pendente ? "Gravando…" : "Cadastrar visita"}
      </button>
    </form>
  );
}

export default function FormularioNovaVisita({ grupos }: { grupos: Grupos }) {
  // "É a mesma família": recomeça o formulário do zero
  const [rodada, setRodada] = useState(0);
  return <Formulario key={rodada} recomecar={() => setRodada((r) => r + 1)} grupos={grupos} />;
}
