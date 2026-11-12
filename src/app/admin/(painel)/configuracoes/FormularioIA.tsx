'use client';

import { useActionState, useState } from 'react';
import { MODELOS_ANTHROPIC, PROVEDORES, type Provedor } from '@/lib/ia-opcoes';
import { salvarIA } from '../../acoes';

type Props = {
  provedor: Provedor;
  modeloAnthropic: string;
  modeloOpenai: string;
  chaveAnthropic: string | null;
  chaveOpenai: string | null;
};

export default function FormularioIA(p: Props) {
  const [estado, acao, pendente] = useActionState(salvarIA, undefined);
  // Campos controlados: o que foi escolhido continua na tela depois de salvar.
  const [provedor, setProvedor] = useState<Provedor>(p.provedor);
  const [modeloAnthropic, setModeloAnthropic] = useState(p.modeloAnthropic);
  const [modeloOpenai, setModeloOpenai] = useState(p.modeloOpenai);
  const salva = provedor === 'anthropic' ? p.chaveAnthropic : p.chaveOpenai;

  return (
    <form action={acao} className="space-y-5 rounded-xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-extrabold text-stone-900">Assistente de IA</h2>
        <p className="text-sm text-stone-600">Conexão usada para organizar as visitas em roteiros.</p>
      </div>
      <fieldset>
        <legend className="mb-2 text-sm font-semibold text-stone-800">Qual IA usar</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PROVEDORES.map((x) => (
            <label
              key={x.id}
              className={`flex cursor-pointer items-center gap-3 rounded-lg border-2 px-4 py-3 text-base font-semibold ${
                provedor === x.id ? 'border-emerald-700 bg-emerald-50 text-emerald-900' : 'border-stone-300 text-stone-800'
              }`}
            >
              <input type="radio" name="provedor" value={x.id} checked={provedor === x.id} onChange={() => setProvedor(x.id)} className="h-4 w-4 accent-emerald-700" />
              {x.nome}
            </label>
          ))}
        </div>
      </fieldset>

      {/* Os dois blocos ficam no formulário; só o do provedor escolhido aparece. */}
      <div className={provedor === 'anthropic' ? 'space-y-4' : 'hidden'}>
        <label className="block text-sm font-semibold text-stone-800">
          Chave de API da Anthropic
          <input name="chave_anthropic" type="password" autoComplete="off" placeholder={p.chaveAnthropic ? 'Deixe em branco para manter a chave salva' : 'sk-ant-...'} className="adm-campo mt-1" />
        </label>
        <label className="block text-sm font-semibold text-stone-800">
          Modelo
          <select name="modelo_anthropic" value={modeloAnthropic} onChange={(e) => setModeloAnthropic(e.target.value)} className="adm-campo mt-1">
            {MODELOS_ANTHROPIC.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome}
              </option>
            ))}
          </select>
        </label>
        {p.chaveAnthropic && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="remover_anthropic" className="h-4 w-4 accent-red-700" /> Apagar a chave salva da Anthropic
          </label>
        )}
      </div>

      <div className={provedor === 'openai' ? 'space-y-4' : 'hidden'}>
        <label className="block text-sm font-semibold text-stone-800">
          Chave de API da OpenAI
          <input name="chave_openai" type="password" autoComplete="off" placeholder={p.chaveOpenai ? 'Deixe em branco para manter a chave salva' : 'sk-...'} className="adm-campo mt-1" />
        </label>
        <label className="block text-sm font-semibold text-stone-800">
          Modelo
          <input
            name="modelo_openai"
            list="modelos-openai"
            value={modeloOpenai}
            onChange={(e) => setModeloOpenai(e.target.value)}
            autoComplete="off"
            placeholder='Use "Salvar e testar" para ver os modelos da sua conta'
            className="adm-campo mt-1"
          />
          <datalist id="modelos-openai">
            {estado?.modelos?.map((m) => <option key={m} value={m} />)}
          </datalist>
        </label>
        {estado?.modelos && estado.modelos.length > 0 && (
          <div className="flex flex-wrap gap-1.5" aria-label="Modelos disponíveis na conta">
            {estado.modelos.slice(0, 24).map((m) => (
              <button key={m} type="button" onClick={() => setModeloOpenai(m)} className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${m === modeloOpenai ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 text-stone-700 hover:bg-stone-50'}`}>
                {m}
              </button>
            ))}
          </div>
        )}
        {p.chaveOpenai && (
          <label className="flex items-center gap-2 text-sm text-stone-700">
            <input type="checkbox" name="remover_openai" className="h-4 w-4 accent-red-700" /> Apagar a chave salva da OpenAI
          </label>
        )}
      </div>

      <p className="text-sm text-stone-600">{salva ? `Chave salva (${salva}).` : 'Nenhuma chave salva para esta IA.'}</p>

      {estado?.erro && (
        <p className="rounded-lg bg-red-50 p-3 text-sm font-semibold text-red-800" role="alert">
          {estado.erro}
        </p>
      )}
      {estado?.ok && (
        <p className="rounded-lg bg-emerald-50 p-3 text-sm font-semibold text-emerald-900" role="status">
          {estado.ok}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        <button type="submit" name="acao" value="testar" disabled={pendente} className="adm-botao">
          {pendente ? 'Salvando…' : 'Salvar e testar conexão'}
        </button>
        <button type="submit" name="acao" value="salvar" disabled={pendente} className="adm-botao-sec">
          Só salvar
        </button>
      </div>
    </form>
  );
}
