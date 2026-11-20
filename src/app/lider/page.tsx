import Link from 'next/link';
import { exigirPessoa } from '@/lib/auth';
import { DIAS, PERIODOS } from '@/lib/config';
import { gruposDoLider, linkMapa, linkTrajeto, telefoneFormatado, visitasDoLider } from '@/lib/grupos';
import type { Visita } from '@/lib/visitas';
import CartaoVisita, { type VisitaDoLider } from './CartaoVisita';

const hojeEmSaoPaulo = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
const hora = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' });

export default async function MinhasVisitas({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const eu = await exigirPessoa();
  const sp = await searchParams;
  const [grupos, visitas] = await Promise.all([gruposDoLider(eu.id), visitasDoLider(eu.id)]);

  if (!grupos.length) {
    return (
      <div className="cartao space-y-2">
        <h1 className="text-xl font-extrabold text-stone-900">Olá, {eu.nome.split(' ')[0]}!</h1>
        <p className="text-lg text-stone-700">Você ainda não está em nenhum grupo. Assim que a coordenação colocar você em um grupo, as visitas aparecem aqui.</p>
      </div>
    );
  }

  const nomeDoGrupo = new Map(grupos.map((g) => [g.id, g.nome]));
  const hoje = hojeEmSaoPaulo();
  const pedido = typeof sp.dia === 'string' ? sp.dia : '';
  // Abre no dia de hoje; fora dos dias da missão, no primeiro dia que ainda tem visita a fazer
  const dia =
    DIAS.find((d) => d.valor === pedido)?.valor ??
    DIAS.find((d) => d.valor === hoje)?.valor ??
    DIAS.find((d) => visitas.some((v) => v.data_visita === d.valor && !v.feita_em))?.valor ??
    DIAS[0].valor;
  const doDia = visitas.filter((v) => v.data_visita === dia);
  const feitasNoDia = doDia.filter((v) => v.feita_em).length;
  const lancada = typeof sp.lancada === 'string' ? visitas.find((v) => String(v.id) === sp.lancada) : undefined;

  const paraOCartao = (v: Visita, numero: number): VisitaDoLider => ({
    id: v.id,
    numero,
    responsavel: v.responsavel,
    telefone: v.telefone,
    telefoneTexto: telefoneFormatado(v.telefone),
    endereco: [`${v.endereco}, ${v.numero}`, v.complemento].filter(Boolean).join(' - '),
    bairro: v.bairro ?? '',
    observacoes: v.observacoes ?? '',
    linkMapa: linkMapa(v),
    pediuContato: v.confirmar_contato === true,
    confirmada: v.confirmada_em != null,
    feita: v.feita_em != null,
    feitaTexto: v.feita_em ? [hora.format(v.feita_em), v.feita_por?.split(' ')[0]].filter(Boolean).join(' · ') : '',
    comentario: v.comentario ?? '',
    lancada: v.lancada_por != null,
    grupo: grupos.length > 1 && v.grupo_id ? (nomeDoGrupo.get(v.grupo_id) ?? '') : '',
  });

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-extrabold text-stone-900">Olá, {eu.nome.split(' ')[0]}!</h1>
        <ul className="mt-1 space-y-0.5 text-base text-stone-700">
          {grupos.map((g) => (
            <li key={g.id}>
              <strong>{g.nome}</strong>
              {g.observacao ? ` · ${g.observacao}` : ''}
            </li>
          ))}
        </ul>
      </div>

      {lancada && (
        <p className="rounded-xl bg-emerald-50 p-4 text-base font-semibold text-emerald-950" role="status">
          Visita lançada: {lancada.responsavel}. Ela já está na lista como feita.
        </p>
      )}

      <nav aria-label="Dia da visita" className="grid grid-cols-2 gap-2">
        {DIAS.map((d) => {
          const total = visitas.filter((v) => v.data_visita === d.valor).length;
          const feitas = visitas.filter((v) => v.data_visita === d.valor && v.feita_em).length;
          const ativo = d.valor === dia;
          return (
            <Link
              key={d.valor}
              href={`/lider?dia=${d.valor}`}
              aria-current={ativo ? 'page' : undefined}
              className={`rounded-xl border-2 px-3 py-2.5 text-center ${ativo ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white text-stone-800'}`}
            >
              <span className="block text-lg font-extrabold">
                {d.semana} {d.numero}
                {d.valor === hoje ? ' (hoje)' : ''}
              </span>
              <span className={`block text-sm ${ativo ? 'text-emerald-50' : 'text-stone-600'}`}>
                {total === 0 ? 'sem visitas' : `${feitas} de ${total} ${total === 1 ? 'feita' : 'feitas'}`}
              </span>
            </Link>
          );
        })}
      </nav>

      {doDia.length > 0 && (
        <div>
          <div className="h-3 overflow-hidden rounded-full bg-stone-200" role="progressbar" aria-valuemin={0} aria-valuemax={doDia.length} aria-valuenow={feitasNoDia} aria-label="Visitas feitas neste dia">
            <div className="h-full rounded-full bg-emerald-600" style={{ width: `${(feitasNoDia / doDia.length) * 100}%` }} />
          </div>
          <p className="mt-1 text-base text-stone-700">
            {feitasNoDia === doDia.length ? 'Todas as visitas deste dia foram feitas.' : `Faltam ${doDia.length - feitasNoDia} de ${doDia.length} neste dia.`}
          </p>
        </div>
      )}

      {doDia.length === 0 && <p className="cartao text-lg text-stone-700">Seu grupo não tem visitas neste dia.</p>}

      {PERIODOS.map((p) => {
        const lista = doDia.filter((v) => v.periodo === p.valor);
        if (!lista.length) return null;
        const trajeto = linkTrajeto(lista.filter((v) => !v.feita_em));
        return (
          <section key={p.valor} aria-label={p.nome} className="space-y-3">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3">
              <h2 className="text-xl font-extrabold text-stone-900">
                {p.nome} <span className="text-base font-semibold text-stone-600">· {lista.length} {lista.length === 1 ? 'visita' : 'visitas'}</span>
              </h2>
              {trajeto && (
                <a href={trajeto} target="_blank" rel="noopener noreferrer" className="text-base font-semibold text-emerald-800 underline">
                  Trajeto das que faltam
                </a>
              )}
            </div>
            <ul className="space-y-3">
              {lista.map((v, i) => (
                <li key={v.id}>
                  <CartaoVisita v={paraOCartao(v, i + 1)} />
                </li>
              ))}
            </ul>
          </section>
        );
      })}

      <div className="rounded-2xl border-2 border-dashed border-stone-300 p-4">
        <p className="text-base text-stone-700">Fez uma visita que não estava na lista?</p>
        <Link href={`/lider/lancar?dia=${dia}`} className="adm-botao mt-2 w-full py-3 text-lg">
          Lançar visita fora da lista
        </Link>
      </div>
    </div>
  );
}
