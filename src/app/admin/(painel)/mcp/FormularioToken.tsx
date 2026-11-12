'use client';

import { useActionState, useState } from 'react';
import { criarMeuTokenMcp } from '../../acoes-conta';

function Copiavel({ rotulo, valor }: { rotulo: string; valor: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <div>
      <div className="mb-1 flex items-center justify-between gap-3">
        <span className="text-sm font-semibold text-stone-700">{rotulo}</span>
        <button
          type="button"
          className="rounded-lg px-2 py-1 text-sm font-semibold text-emerald-800 underline hover:bg-emerald-100"
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(valor);
              setCopiado(true);
              setTimeout(() => setCopiado(false), 2000);
            } catch {}
          }}
        >
          {copiado ? 'Copiado ✓' : 'Copiar'}
        </button>
      </div>
      <pre className="overflow-x-auto rounded-lg bg-stone-900 p-3 text-sm whitespace-pre-wrap break-all text-stone-50">{valor}</pre>
    </div>
  );
}

export default function FormularioToken({ endereco }: { endereco: string }) {
  const [estado, acao, pendente] = useActionState(criarMeuTokenMcp, undefined);
  return (
    <div className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <form action={acao} className="flex flex-wrap items-end gap-3">
        <div className="min-w-56 flex-1">
          <label htmlFor="nome-token" className="mb-1 block text-sm font-semibold text-stone-700">
            Novo token: onde ele será usado?
          </label>
          <input id="nome-token" name="nome" className="adm-campo" placeholder="Ex: Claude no meu computador" maxLength={60} required />
        </div>
        <button type="submit" disabled={pendente} className="adm-botao">
          {pendente ? 'Criando…' : 'Criar token'}
        </button>
      </form>
      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.token && (
        <div className="space-y-4 rounded-xl border border-emerald-300 bg-emerald-50 p-4" role="status">
          <p className="font-semibold text-emerald-950">
            Token “{estado.nome}” criado. Copie agora: por segurança, ele não aparece de novo.
          </p>
          <Copiavel rotulo="Token" valor={estado.token} />
          <Copiavel
            rotulo="Para conectar o Claude Code (cole no terminal)"
            valor={`claude mcp add --transport http missao-fraternal ${endereco} --header "Authorization: Bearer ${estado.token}"`}
          />
        </div>
      )}
    </div>
  );
}
