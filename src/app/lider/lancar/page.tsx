import Link from 'next/link';
import { redirect } from 'next/navigation';
import { exigirPessoa } from '@/lib/auth';
import { DIAS } from '@/lib/config';
import { gruposDoLider } from '@/lib/grupos';
import FormularioLancar from './FormularioLancar';

export const metadata = { title: 'Lançar visita fora da lista' };

export default async function LancarVisita({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eu = await exigirPessoa();
  const grupos = await gruposDoLider(eu.id);
  if (!grupos.length) redirect('/lider');
  const sp = await searchParams;
  const agora = new Date();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(agora);
  const horas = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(agora));
  // Já vem com o dia de hoje (ou o dia que estava aberto na lista) e o horário de agora
  const dia = DIAS.find((d) => d.valor === hoje)?.valor ?? DIAS.find((d) => d.valor === sp.dia)?.valor ?? '';

  return (
    <div className="space-y-4">
      <Link href={dia ? `/lider?dia=${dia}` : '/lider'} className="text-base font-semibold text-emerald-800 underline">
        ← Voltar para a lista
      </Link>
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900">Lançar visita fora da lista</h1>
        <p className="text-base text-stone-700">
          Para uma visita que o seu grupo fez e que não estava na lista. Ela entra já como feita e fica marcada como lançada por você.
        </p>
      </div>
      <FormularioLancar
        grupos={grupos.map((g) => ({ valor: String(g.id), nome: g.nome }))}
        inicio={{
          grupo: grupos.length === 1 ? String(grupos[0].id) : '',
          responsavel: '',
          telefone: '',
          endereco: '',
          numero: '',
          complemento: '',
          bairro: '',
          observacoes: '',
          data_visita: dia,
          periodo: dia === hoje ? (horas < 13 ? 'manha' : 'tarde') : '',
          comentario: '',
        }}
      />
    </div>
  );
}
