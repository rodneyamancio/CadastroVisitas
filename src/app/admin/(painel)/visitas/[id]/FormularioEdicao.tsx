"use client";

import { useActionState } from "react";
import { DIAS, PERIODOS } from "@/lib/config";
import { salvarVisita } from "../../../acoes";

export type DadosDaVisita = {
  id: number;
  responsavel: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  cep: string;
  observacoes: string;
  data_visita: string;
  periodo: string;
  confirmar: "" | "sim" | "nao";
};

function Campo(props: {
  nome: keyof DadosDaVisita;
  rotulo: string;
  valor: string;
  erro?: string;
  ajuda?: string;
  tipo?: string;
  max?: number;
  largura?: string;
  modo?: "numeric" | "tel";
}) {
  const id = `editar-${props.nome}`;
  return (
    <div className={props.largura}>
      <label
        htmlFor={id}
        className="mb-1 block text-sm font-semibold text-stone-700"
      >
        {props.rotulo}
      </label>
      <input
        id={id}
        name={props.nome}
        type={props.tipo ?? "text"}
        inputMode={props.modo}
        defaultValue={props.valor}
        maxLength={props.max}
        aria-invalid={Boolean(props.erro)}
        aria-describedby={props.erro ? `${id}-erro` : undefined}
        className={`adm-campo ${props.erro ? "border-red-500" : ""}`}
      />
      {props.erro ? (
        <p
          id={`${id}-erro`}
          className="mt-1 text-sm font-semibold text-red-700"
        >
          {props.erro}
        </p>
      ) : (
        props.ajuda && (
          <p className="mt-1 text-xs text-stone-500">{props.ajuda}</p>
        )
      )}
    </div>
  );
}

export default function FormularioEdicao({ v }: { v: DadosDaVisita }) {
  const [estado, acao, pendente] = useActionState(
    salvarVisita.bind(null, v.id),
    undefined,
  );
  const erros = estado?.erros ?? {};
  const escolha = (
    nome: string,
    rotulo: string,
    valor: string,
    opcoes: { valor: string; nome: string }[],
  ) => (
    <div>
      <label
        htmlFor={`editar-${nome}`}
        className="mb-1 block text-sm font-semibold text-stone-700"
      >
        {rotulo}
      </label>
      <select
        id={`editar-${nome}`}
        name={nome}
        defaultValue={valor}
        className={`adm-campo ${erros[nome] ? "border-red-500" : ""}`}
      >
        {opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nome}
          </option>
        ))}
      </select>
      {erros[nome] && (
        <p className="mt-1 text-sm font-semibold text-red-700">{erros[nome]}</p>
      )}
    </div>
  );

  return (
    <form
      action={acao}
      className="space-y-5 rounded-xl border border-stone-200 bg-white p-5"
    >
      {/* Depois de salvar, os campos recomeçam com os valores gravados (as listas não acompanham sozinhas) */}
      <div key={JSON.stringify(v)} className="space-y-5">
        <fieldset className="grid gap-4 sm:grid-cols-2">
          <legend className="mb-2 text-lg font-extrabold text-stone-900">
            Quem mora na casa
          </legend>
          <Campo
            nome="responsavel"
            rotulo="Responsável"
            valor={v.responsavel}
            erro={erros.responsavel}
            max={120}
          />
          <Campo
            nome="telefone"
            rotulo="Telefone"
            valor={v.telefone}
            erro={erros.telefone}
            tipo="tel"
            modo="tel"
            ajuda="Com DDD."
          />
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-6">
          <legend className="mb-2 text-lg font-extrabold text-stone-900">
            Endereço
          </legend>
          <Campo
            nome="endereco"
            rotulo="Rua ou avenida"
            valor={v.endereco}
            erro={erros.endereco}
            max={160}
            largura="sm:col-span-4"
          />
          <Campo
            nome="numero"
            rotulo="Número"
            valor={v.numero}
            erro={erros.numero}
            max={12}
            largura="sm:col-span-2"
            ajuda="S/N se não tiver."
          />
          <Campo
            nome="complemento"
            rotulo="Complemento"
            valor={v.complemento}
            max={120}
            largura="sm:col-span-2"
          />
          <Campo
            nome="bairro"
            rotulo="Bairro"
            valor={v.bairro}
            max={80}
            largura="sm:col-span-2"
            ajuda="Se mudar a rua e deixar o bairro como está, o sistema confere o bairro pelos Correios."
          />
          <Campo
            nome="cep"
            rotulo="CEP"
            valor={v.cep}
            erro={erros.cep}
            modo="numeric"
            max={9}
            largura="sm:col-span-2"
          />
          <div className="sm:col-span-6">
            <label
              htmlFor="editar-observacoes"
              className="mb-1 block text-sm font-semibold text-stone-700"
            >
              Como achar a casa
            </label>
            <textarea
              id="editar-observacoes"
              name="observacoes"
              defaultValue={v.observacoes}
              maxLength={500}
              rows={3}
              className="adm-campo"
            />
          </div>
        </fieldset>

        <fieldset className="grid gap-4 sm:grid-cols-3">
          <legend className="mb-2 text-lg font-extrabold text-stone-900">
            Visita
          </legend>
          {escolha(
            "data_visita",
            "Dia",
            v.data_visita,
            DIAS.map((d) => ({ valor: d.valor, nome: d.curto })),
          )}
          {escolha(
            "periodo",
            "Horário",
            v.periodo,
            PERIODOS.map((p) => ({ valor: p.valor, nome: p.nome })),
          )}
          {escolha(
            "confirmar",
            "Entrar em contato antes para confirmar",
            v.confirmar,
            [
              { valor: "sim", nome: "Sim" },
              { valor: "nao", nome: "Não" },
              { valor: "", nome: "Não informado" },
            ],
          )}
        </fieldset>
      </div>

      {estado?.erro && (
        <p
          className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800"
          role="alert"
        >
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <div
          className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-950"
          role="status"
        >
          <p className="font-semibold">{estado.ok}</p>
          {estado.mudancas && estado.mudancas.length > 0 && (
            <ul className="mt-1 space-y-0.5">
              {estado.mudancas.map((m) => (
                <li key={m.campo}>
                  {m.campo}:{" "}
                  <span className="text-stone-600 line-through">{m.antes}</span>{" "}
                  → <strong>{m.depois}</strong>
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
