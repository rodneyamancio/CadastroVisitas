import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { DIAS, PERIODOS } from '@/lib/config';
import { PROVEDORES, iaPronta } from '@/lib/configuracoes';
import { ultimoRoteiro, type Grupo } from '@/lib/roteiro';
import { enderecoCompleto, listarVisitas, type Visita } from '@/lib/visitas';
import BotaoImprimir from './BotaoImprimir';
import FormularioRoteiro from './FormularioRoteiro';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

function telefone(t: string) {
  if (t.length === 11) return `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}`;
  if (t.length === 10) return `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}`;
  return t;
}

const distancia = (m: number | null) => (m == null ? null : m < 1000 ? `${Math.max(m, 0)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

// Trajeto no Google Maps passando pelas casas na ordem sugerida (o Maps aceita até 10 paradas).
function linkTrajeto(visitas: Visita[]): string | null {
  const pontos = visitas.slice(0, 10).map((v) => (v.lat != null && v.lng != null && v.precisao !== 'rua' ? `${v.lat},${v.lng}` : enderecoCompleto(v)));
  if (pontos.length < 2) return null;
  const p = new URLSearchParams({ api: '1', origin: pontos[0], destination: pontos[pontos.length - 1], travelmode: 'driving' });
  if (pontos.length > 2) p.set('waypoints', pontos.slice(1, -1).join('|'));
  return `https://www.google.com/maps/dir/?${p}`;
}

function CartaoGrupo({ grupo, numero, porId }: { grupo: Grupo; numero: number; porId: Map<number, Visita> }) {
  const visitas = grupo.visitas.map((id) => porId.get(id)).filter((v): v is Visita => Boolean(v));
  if (!visitas.length) return null;
  const trajeto = linkTrajeto(visitas);
  const percurso = distancia(grupo.distanciaM);
  return (
    <li className="break-inside-avoid rounded-xl border border-stone-200 bg-white p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h4 className="text-base font-extrabold text-stone-900">
          Grupo {numero}: {grupo.nome}
        </h4>
        <span className="text-sm text-stone-600">
          {visitas.length} {visitas.length === 1 ? 'visita' : 'visitas'}
          {percurso && visitas.length > 1 ? ` · cerca de ${percurso} entre as casas` : ''}
        </span>
      </div>
      {grupo.observacao && <p className="mt-1 text-sm text-stone-600">{grupo.observacao}</p>}
      <ol className="mt-3 space-y-2">
        {visitas.map((v, i) => (
          <li key={v.id} className="flex gap-3 text-sm">
            <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-100 text-xs font-bold text-emerald-900">{i + 1}</span>
            <span>
              <strong className="text-stone-900">{v.responsavel}</strong> · {telefone(v.telefone)}
              <br />
              <span className="text-stone-700">{enderecoCompleto(v)}</span>
              {v.observacoes && <span className="text-stone-500"> ({v.observacoes})</span>}
            </span>
          </li>
        ))}
      </ol>
      {trajeto && (
        <a href={trajeto} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block text-sm font-semibold text-emerald-800 underline print:hidden">
          Abrir trajeto no Google Maps
        </a>
      )}
    </li>
  );
}

export default async function Assistente() {
  const usuario = await exigirUsuario();
  const [ia, roteiro, visitas] = await Promise.all([iaPronta(), ultimoRoteiro(), listarVisitas()]);
  const porId = new Map(visitas.map((v) => [v.id, v]));
  const noPlano = new Set(roteiro?.plano.grupos.flatMap((g) => g.visitas) ?? []);
  const novas = roteiro ? visitas.filter((v) => !noPlano.has(v.id)).length : 0;
  let numero = 0;

  return (
    <div className="space-y-5">
      <div className="print:hidden">
        <h1 className="text-xl font-extrabold text-stone-900">Assistente de IA: roteiros de visita</h1>
        <p className="text-sm text-stone-600">
          A IA separa as visitas por dia e horário e junta as casas próximas em grupos, para cada equipe se deslocar o mínimo possível.
        </p>
      </div>

      {!ia ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">
          A IA ainda não está conectada.{' '}
          {usuario.perfil === 'super_admin' ? (
            <>
              Informe a chave da OpenAI ou da Anthropic em{' '}
              <Link href="/admin/configuracoes" className="font-semibold underline">
                Configurações
              </Link>
              .
            </>
          ) : (
            'Peça ao super admin para conectar a OpenAI ou a Anthropic em Configurações.'
          )}
        </p>
      ) : (
        <FormularioRoteiro maxAnterior={roteiro?.parametros.maxPorGrupo ?? 6} orientacoesAnteriores={roteiro?.parametros.orientacoes ?? ''} jaTem={Boolean(roteiro)} />
      )}

      {roteiro && (
        <section className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-stone-600">
              Roteiro montado em {quando.format(roteiro.criado_em)}
              {roteiro.criado_por ? ` por ${roteiro.criado_por}` : ''} · {PROVEDORES.find((p) => p.id === roteiro.provedor)?.nome ?? roteiro.provedor} ({roteiro.modelo})
            </p>
            <div className="flex gap-2 print:hidden">
              <BotaoImprimir />
              <a href="/api/admin/roteiro" className="adm-botao" download>
                Exportar roteiros para Excel
              </a>
            </div>
          </div>

          {novas > 0 && (
            <p className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 print:hidden">
              {novas} {novas === 1 ? 'visita foi cadastrada' : 'visitas foram cadastradas'} depois deste roteiro e ainda não {novas === 1 ? 'está' : 'estão'} em nenhum grupo. Monte os roteiros de novo para incluir.
            </p>
          )}

          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4">
            <h2 className="text-sm font-extrabold text-emerald-900">Resumo para a coordenação</h2>
            <p className="mt-1 text-sm whitespace-pre-line text-emerald-950">{roteiro.plano.resumo}</p>
          </div>

          {DIAS.map((d) =>
            PERIODOS.map((p) => {
              const grupos = roteiro.plano.grupos.filter((g) => g.dia === d.valor && g.periodo === p.valor);
              const total = grupos.reduce((s, g) => s + g.visitas.filter((id) => porId.has(id)).length, 0);
              if (!total) return null;
              return (
                <div key={`${d.valor}${p.valor}`}>
                  <h3 className="mb-2 text-lg font-extrabold text-stone-900">
                    {d.semana}, {d.numero} · {p.nome}{' '}
                    <span className="text-sm font-normal text-stone-500">
                      {grupos.length} {grupos.length === 1 ? 'grupo' : 'grupos'} · {total} {total === 1 ? 'visita' : 'visitas'}
                    </span>
                  </h3>
                  <ul className="grid gap-3 lg:grid-cols-2 print:block print:space-y-3">
                    {grupos.map((g) => (
                      <CartaoGrupo key={`${g.nome}${g.visitas[0]}`} grupo={g} numero={++numero} porId={porId} />
                    ))}
                  </ul>
                </div>
              );
            }),
          )}
        </section>
      )}
    </div>
  );
}
