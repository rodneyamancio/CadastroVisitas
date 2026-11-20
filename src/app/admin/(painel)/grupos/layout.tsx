import { exigirUsuario } from '@/lib/auth';
import { resumoDosGrupos } from '@/lib/grupos';
import Abas from './Abas';

export const metadata = { title: 'Grupos de visita' };

export default async function GruposLayout({ children }: { children: React.ReactNode }) {
  await exigirUsuario();
  const resumo = await resumoDosGrupos();
  return (
    <div className="space-y-5">
      <Abas semGrupo={resumo.semGrupo} />
      {children}
    </div>
  );
}
