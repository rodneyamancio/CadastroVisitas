import { exigirUsuario } from '@/lib/auth';
import FormularioSenha from './FormularioSenha';

export default async function Conta() {
  const eu = await exigirUsuario();
  return (
    <div className="max-w-md space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Minha conta</h1>
        <p className="text-sm text-stone-600">
          {eu.nome} · {eu.email} · {eu.perfil === 'super_admin' ? 'Super admin' : 'Admin'}
        </p>
      </div>
      <FormularioSenha />
    </div>
  );
}
