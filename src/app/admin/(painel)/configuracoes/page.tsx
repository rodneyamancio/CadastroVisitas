import { exigirSuperAdmin } from '@/lib/auth';
import { configuracaoIA } from '@/lib/configuracoes';
import { configuracaoEmail } from '@/lib/email';
import FormularioEmail from './FormularioEmail';
import FormularioIA from './FormularioIA';

const final = (chave: string | null) => (chave ? `termina em ${chave.slice(-4)}` : null);

export default async function Configuracoes() {
  const eu = await exigirSuperAdmin();
  const [c, e] = await Promise.all([configuracaoIA(), configuracaoEmail()]);
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Configurações</h1>
        <p className="text-sm text-stone-600">As chaves de API ficam guardadas cifradas no banco e nunca são mostradas de novo.</p>
      </div>
      <FormularioIA
        provedor={c.provedor}
        modeloAnthropic={c.modelos.anthropic}
        modeloOpenai={c.modelos.openai}
        chaveAnthropic={final(c.chaves.anthropic)}
        chaveOpenai={final(c.chaves.openai)}
      />
      <FormularioEmail nome={e.nome} endereco={e.endereco} chave={final(e.chave)} meuEmail={eu.email} />
    </div>
  );
}
