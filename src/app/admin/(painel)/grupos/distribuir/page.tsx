import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS, nomeDia, nomePeriodo } from '@/lib/config';
import { sql } from '@/lib/db';
import { nomeDaOpcao, opcoesDeGrupo, sugerirGrupos, visitasSemGrupo } from '@/lib/grupos';
import type { Visita } from '@/lib/visitas';
import Distribuicao, { type LinhaSemGrupo } from './Distribuicao';

export const metadata = { title: 'Distribuir visitas' };

export default async function Distribuir({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const sp = await searchParams;
  const dia = DIAS.find((d) => d.valor === sp.dia)?.valor ?? '';
  const periodo = PERIODOS.find((p) => p.valor === sp.periodo)?.valor ?? '';
  const [todas, grupos, comGrupo] = await Promise.all([visitasSemGrupo(), opcoesDeGrupo(), sql<Visita>('SELECT * FROM visitas WHERE grupo_id IS NOT NULL')]);
  const semGrupo = todas.filter((v) => (!dia || v.data_visita === dia) && (!periodo || v.periodo === periodo));
  const sugestoes = sugerirGrupos(semGrupo, comGrupo);
  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.nome]));

  const linhas: LinhaSemGrupo[] = semGrupo.map((v) => {
    const s = sugestoes.get(v.id);
    return {
      id: v.id,
      responsavel: v.responsavel,
      endereco: [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - '),
      bairro: v.bairro ?? '',
      quando: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
      semPosicao: v.lat == null,
      sugestao: s ? { grupo: s.grupo, nome: nomeDoGrupo.get(s.grupo) ?? '', motivo: s.motivo } : undefined,
    };
  });

  // Quantas visitas cada grupo já tem em cada dia e horário (ajuda a não sobrecarregar um grupo)
  const carga = new Map<number, number>();
  for (const v of comGrupo) {
    if ((!dia || v.data_visita === dia) && (!periodo || v.periodo === periodo)) carga.set(v.grupo_id!, (carga.get(v.grupo_id!) ?? 0) + 1);
  }
  const recorte = [dia && nomeDia(dia), periodo && nomePeriodo(periodo)].filter(Boolean).join(' · ');

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Distribuir visitas</h1>
        <p className="text-sm text-stone-600">
          Visitas que ainda não estão em nenhum grupo. Escolha o grupo de cada uma e salve. A sugestão aponta o grupo que tem a casa mais perto no mesmo dia e horário.
        </p>
      </div>

      <form method="get" className="flex flex-wrap items-end gap-3 rounded-xl border border-stone-200 bg-white p-3">
        <label className="text-sm font-semibold text-stone-700">
          Dia
          <select name="dia" defaultValue={dia} className="adm-campo mt-1 py-1.5">
            <option value="">Todos</option>
            {DIAS.map((d) => (
              <option key={d.valor} value={d.valor}>
                {d.curto}
              </option>
            ))}
          </select>
        </label>
        <label className="text-sm font-semibold text-stone-700">
          Horário
          <select name="periodo" defaultValue={periodo} className="adm-campo mt-1 py-1.5">
            <option value="">Todos</option>
            {PERIODOS.map((p) => (
              <option key={p.valor} value={p.valor}>
                {p.nome}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="adm-botao-sec">
          Filtrar
        </button>
        <span className="ml-auto text-sm text-stone-600">
          {semGrupo.length} sem grupo{recorte ? ` em ${recorte}` : ''}
          {todas.length !== semGrupo.length ? ` (${todas.length} no total)` : ''}
        </span>
      </form>

      {grupos.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          Ainda não há grupos para receber as visitas.{' '}
          <Link href="/admin/grupos" className="font-semibold text-emerald-800 underline">
            Criar o primeiro grupo
          </Link>
        </p>
      ) : semGrupo.length === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          {todas.length ? 'Nenhuma visita sem grupo com este filtro.' : 'Todas as visitas já estão em algum grupo.'}
        </p>
      ) : (
        <Distribuicao
          linhas={linhas}
          grupos={grupos.map((g) => ({ id: g.id, nome: nomeDaOpcao(g), carga: carga.get(g.id) ?? 0 }))}
          recorte={recorte}
        />
      )}
    </div>
  );
}
