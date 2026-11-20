import { DIAS, PERIODOS } from "@/lib/config";

// Campos de uma visita, usados na tela de editar e na de cadastrar pelo painel.
// Com "semVisita", servem ao cadastro sem visita (lista geral): sai o bloco da visita e entra o motivo.

export type DadosDaVisita = {
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
  // Na edição, "" = não informado. No cadastro, "" = ainda não escolheu e "ni" = não informado.
  confirmar: "" | "sim" | "nao" | "ni";
  // Só no cadastro sem visita: por que a família não vai receber visita neste evento
  motivo?: string;
};

export const VISITA_VAZIA: DadosDaVisita = {
  responsavel: "",
  telefone: "",
  endereco: "",
  numero: "",
  complemento: "",
  bairro: "",
  cep: "",
  observacoes: "",
  data_visita: "",
  periodo: "",
  confirmar: "",
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
  obrigatorio?: boolean;
}) {
  const id = `visita-${props.nome}`;
  return (
    <div className={props.largura}>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-stone-700">
        {props.rotulo}
      </label>
      <input
        id={id}
        name={props.nome}
        type={props.tipo ?? "text"}
        inputMode={props.modo}
        defaultValue={props.valor}
        maxLength={props.max}
        aria-required={props.obrigatorio || undefined}
        aria-invalid={Boolean(props.erro)}
        aria-describedby={props.erro ? `${id}-erro` : undefined}
        className={`adm-campo ${props.erro ? "border-red-500" : ""}`}
      />
      {props.erro ? (
        <p id={`${id}-erro`} className="mt-1 text-sm font-semibold text-red-700">
          {props.erro}
        </p>
      ) : (
        props.ajuda && <p className="mt-1 text-xs text-stone-500">{props.ajuda}</p>
      )}
    </div>
  );
}

function Escolha(props: {
  nome: keyof DadosDaVisita;
  rotulo: string;
  valor: string;
  erro?: string;
  opcoes: { valor: string; nome: string }[];
}) {
  const id = `visita-${props.nome}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-stone-700">
        {props.rotulo}
      </label>
      <select
        id={id}
        name={props.nome}
        defaultValue={props.valor}
        aria-invalid={Boolean(props.erro)}
        aria-describedby={props.erro ? `${id}-erro` : undefined}
        className={`adm-campo ${props.erro ? "border-red-500" : ""}`}
      >
        {props.opcoes.map((o) => (
          <option key={o.valor} value={o.valor}>
            {o.nome}
          </option>
        ))}
      </select>
      {props.erro && (
        <p id={`${id}-erro`} className="mt-1 text-sm font-semibold text-red-700">
          {props.erro}
        </p>
      )}
    </div>
  );
}

export default function CamposDaVisita({
  v,
  erros,
  novo = false,
  semVisita = false,
}: {
  v: DadosDaVisita;
  erros: Record<string, string>;
  novo?: boolean;
  semVisita?: boolean;
}) {
  const escolha = novo ? [{ valor: "", nome: "Escolha…" }] : [];
  return (
    <div className="space-y-5">
      <fieldset className="grid gap-4 sm:grid-cols-2">
        <legend className="mb-2 text-lg font-extrabold text-stone-900">Quem mora na casa</legend>
        <Campo nome="responsavel" rotulo="Responsável" valor={v.responsavel} erro={erros.responsavel} max={120} obrigatorio ajuda={novo ? "Nome completo." : undefined} />
        <Campo nome="telefone" rotulo="Telefone" valor={v.telefone} erro={erros.telefone} tipo="tel" modo="tel" ajuda="Com DDD." obrigatorio />
      </fieldset>

      <fieldset className="grid gap-4 sm:grid-cols-6">
        <legend className="mb-2 text-lg font-extrabold text-stone-900">Endereço</legend>
        <Campo nome="endereco" rotulo="Rua ou avenida" valor={v.endereco} erro={erros.endereco} max={160} largura="sm:col-span-4" obrigatorio />
        <Campo nome="numero" rotulo="Número" valor={v.numero} erro={erros.numero} max={12} largura="sm:col-span-2" ajuda="S/N se não tiver." obrigatorio />
        <Campo nome="complemento" rotulo="Complemento" valor={v.complemento} max={120} largura="sm:col-span-2" />
        <Campo
          nome="bairro"
          rotulo="Bairro"
          valor={v.bairro}
          max={80}
          largura="sm:col-span-2"
          ajuda={novo ? "Se deixar em branco, o sistema descobre pela rua." : "Se mudar a rua e deixar o bairro como está, o sistema confere o bairro pelos Correios."}
        />
        <Campo nome="cep" rotulo="CEP" valor={v.cep} erro={erros.cep} modo="numeric" max={9} largura="sm:col-span-2" />
        <div className="sm:col-span-6">
          <label htmlFor="visita-observacoes" className="mb-1 block text-sm font-semibold text-stone-700">
            Como achar a casa
          </label>
          <textarea id="visita-observacoes" name="observacoes" defaultValue={v.observacoes} maxLength={500} rows={3} className="adm-campo" />
        </div>
      </fieldset>

      {semVisita ? (
        <fieldset>
          <legend className="mb-2 text-lg font-extrabold text-stone-900">Sem visita neste evento</legend>
          <Campo
            nome="motivo"
            rotulo="Por que não vai ter visita"
            valor={v.motivo ?? ""}
            max={200}
            ajuda="Opcional. Exemplos: pediu depois do prazo, mora fora do setor, vai estar viajando."
          />
        </fieldset>
      ) : (
      <fieldset className="grid gap-4 sm:grid-cols-3">
        <legend className="mb-2 text-lg font-extrabold text-stone-900">Visita</legend>
        <Escolha nome="data_visita" rotulo="Dia" valor={v.data_visita} erro={erros.data_visita} opcoes={[...escolha, ...DIAS.map((d) => ({ valor: d.valor, nome: d.curto }))]} />
        <Escolha nome="periodo" rotulo="Horário" valor={v.periodo} erro={erros.periodo} opcoes={[...escolha, ...PERIODOS.map((p) => ({ valor: p.valor, nome: p.nome }))]} />
        <Escolha
          nome="confirmar"
          rotulo="Entrar em contato antes para confirmar"
          valor={v.confirmar}
          erro={erros.confirmar}
          opcoes={[
            ...escolha,
            { valor: "sim", nome: "Sim" },
            { valor: "nao", nome: "Não" },
            { valor: novo ? "ni" : "", nome: "Não informado" },
          ]}
        />
      </fieldset>
      )}
    </div>
  );
}
