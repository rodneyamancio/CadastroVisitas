import Link from 'next/link';
import { exigirPessoa } from '@/lib/auth';
import FormularioSenha from '../../admin/(painel)/conta/FormularioSenha';

export const metadata = { title: 'Minha senha' };

export default async function ContaDoLider() {
  const eu = await exigirPessoa();
  return (
    <div className="space-y-4">
      <Link href="/lider" className="text-base font-semibold text-emerald-800 underline">
        ← Voltar para a lista
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900">Minha conta</h1>
        <p className="text-base text-stone-700">
          {eu.nome} · {eu.email}
        </p>
      </div>
      <FormularioSenha />
    </div>
  );
}
