'use client';

import { useActionState, useState } from 'react';
import { salvarEmail } from '../../acoes-conta';

type Props = { nome: string; endereco: string; chave: string | null; meuEmail: string };

export default function FormularioEmail(p: Props) {
  const [estado, acao, pendente] = useActionState(salvarEmail, undefined);
  // Campos controlados: o que foi digitado continua na tela depois de salvar.
  const [nome, setNome] = useState(p.nome);
  const [endereco, setEndereco] = useState(p.endereco);
  const [para, setPara] = useState(p.meuEmail);

  return (
    <form action={acao} className="space-y-4 rounded-xl border border-stone-200 bg-white p-5">
      <div>
        <h2 className="text-lg font-extrabold text-stone-900">Envio de e-mail (Resend)</h2>
        <p className="text-sm text-stone-600">
          Usado para convidar usuários e para os links de criar senha. A chave é criada em resend.com, e o e-mail do remetente precisa ser de um domínio verificado
          na sua conta do Resend.
        </p>
      </div>
      <label className="block text-sm font-semibold text-stone-800">
        Chave de API do Resend
        <input name="chave" type="password" autoComplete="off" placeholder={p.chave ? 'Deixe em branco para manter a chave salva' : 're_...'} className="adm-campo mt-1" />
      </label>
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm font-semibold text-stone-800">
          Nome do remetente
          <input name="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} className="adm-campo mt-1" />
        </label>
        <label className="block text-sm font-semibold text-stone-800">
          E-mail do remetente
          <input name="endereco" type="email" value={endereco} onChange={(e) => setEndereco(e.target.value)} placeholder="nao-responda@seudominio.com.br" required className="adm-campo mt-1" />
        </label>
      </div>
      <label className="block text-sm font-semibold text-stone-800">
        Enviar o e-mail de teste para
        <input name="para" type="email" value={para} onChange={(e) => setPara(e.target.value)} className="adm-campo mt-1" />
      </label>
      {p.chave && (
        <label className="flex items-center gap-2 text-sm text-stone-700">
          <input type="checkbox" name="remover" className="h-4 w-4 accent-red-700" /> Apagar a chave salva do Resend
        </label>
      )}
      <p className="text-sm text-stone-600">{p.chave ? `Chave salva (${p.chave}).` : 'Nenhuma chave do Resend salva.'}</p>

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

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" name="acao" value="testar" disabled={pendente} className="adm-botao">
          {pendente ? 'Enviando…' : 'Salvar e enviar e-mail de teste'}
        </button>
        <button type="submit" name="acao" value="salvar" disabled={pendente} className="adm-botao-sec">
          Só salvar
        </button>
      </div>
      <p className="text-sm text-stone-600">
        Ver como ficam os e-mails:{' '}
        {[
          ['convite', 'convite'],
          ['redefinicao', 'nova senha'],
          ['alterada', 'senha alterada'],
          ['pedido', 'pedido de acesso'],
          ['aprovado', 'acesso aprovado'],
          ['recusado', 'acesso recusado'],
          ['teste', 'teste'],
        ].map(([tipo, rotulo], i) => (
          <span key={tipo}>
            {i > 0 && ' · '}
            <a href={`/api/admin/email-previa?tipo=${tipo}`} target="_blank" rel="noopener noreferrer" className="font-semibold text-emerald-800 underline">
              {rotulo}
            </a>
          </span>
        ))}
      </p>
    </form>
  );
}
