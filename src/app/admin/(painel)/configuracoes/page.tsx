import { exigirSuperAdmin } from '@/lib/auth';
import { configuracaoIA } from '@/lib/configuracoes';
import FormularioIA from './FormularioIA';

const final = (chave: string | null) => (chave ? `termina em ${chave.slice(-4)}` : null);

export default async function Configuracoes() {
  await exigirSuperAdmin();
  const c = await configuracaoIA();
  return (
    <div className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Configurações</h1>
        <p className="text-sm text-stone-600">
          Conexão do Assistente de IA, que organiza as visitas em roteiros. A chave de API fica guardada cifrada no banco e nunca é mostrada de novo.
        </p>
      </div>
      <FormularioIA
        provedor={c.provedor}
        modeloAnthropic={c.modelos.anthropic}
        modeloOpenai={c.modelos.openai}
        chaveAnthropic={final(c.chaves.anthropic)}
        chaveOpenai={final(c.chaves.openai)}
      />
    </div>
  );
}
