import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import FormularioNovaVisita from './FormularioNovaVisita';

export const metadata = { title: 'Nova visita' };

export default async function NovaVisita() {
  await exigirUsuario();
  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/admin" className="text-sm font-semibold text-emerald-800 underline">
        ← Voltar para as visitas
      </Link>
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Nova visita</h1>
        <p className="text-sm text-stone-600">
          Para pedidos recebidos por telefone, no papel ou pessoalmente. Antes de gravar, o sistema confere se a família já foi cadastrada.
        </p>
      </div>
      <FormularioNovaVisita />
      <p className="text-sm text-stone-500">O cadastro fica na auditoria com o seu nome.</p>
    </div>
  );
}
