import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import FormularioSemVisita from './FormularioSemVisita';

export const metadata = { title: 'Cadastro sem visita' };

export default async function NovoCadastroSemVisita() {
  await exigirUsuario();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin/lista-geral" className="text-sm font-semibold text-emerald-800 underline">
        ← Voltar para a lista geral
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Cadastro sem visita</h1>
        <p className="text-sm text-stone-600">
          Para a família que não vai receber visita neste evento, mas deve ficar guardada para os próximos. Este cadastro aparece só na lista geral: não
          entra nas visitas, nos contadores, no mapa, nos roteiros, no portal oficial nem no MCP.
        </p>
        <p className="mt-1 text-sm text-stone-600">
          A família vai receber visita?{' '}
          <Link href="/admin/visitas/nova" className="font-semibold text-emerald-800 underline">
            Use a tela Nova visita
          </Link>
          .
        </p>
      </div>
      <FormularioSemVisita />
      <p className="text-sm text-stone-500">O cadastro fica na auditoria com o seu nome.</p>
    </div>
  );
}
