import Link from 'next/link';
import { exigirUsuario } from '@/lib/auth';
import { PERIODOS_SITE, estatisticasDoSite, type PeriodoSite } from '@/lib/estatisticas';
import MapaNavegacao from './MapaNavegacao';

const ROTULOS: Record<string, string> = {
  topo: 'Topo da página (título)',
  'passo-1': 'Bloco "Quem mora na casa" (fora dos campos)',
  'passo-2': 'Bloco "Endereço da família" (fora dos campos)',
  'passo-3': 'Bloco "Quando visitar" (fora dos botões)',
  nome: 'Campo Nome',
  telefone: 'Campo Telefone',
  gps: 'Botão "Usar minha localização"',
  rua: 'Campo Rua e lista de ruas',
  numero: 'Campo Número',
  'sem-numero': 'Opção "A casa não tem número"',
  complemento: 'Campo Complemento',
  bairro: 'Campo Bairro',
  obs: 'Campo "Como achar a casa"',
  'dia-2026-11-28': 'Botão Sábado',
  'dia-2026-11-29': 'Botão Domingo',
  'periodo-manha': 'Botão Manhã',
  'periodo-tarde': 'Botão Tarde',
  'contato-sim': 'Botão Sim (confirmar antes)',
  'contato-nao': 'Botão Não (confirmar antes)',
  dia: 'Dia da visita',
  periodo: 'Horário da visita',
  contato: 'Confirmar a visita antes',
  enviar: 'Botão "Enviar cadastro"',
  'outra-familia': 'Botão "Cadastrar outra família"',
  pagina: 'Fora do formulário',
};
const rotulo = (chave: string) => ROTULOS[chave] ?? chave;

const pct = (parte: number, todo: number) => (todo > 0 ? `${Math.round((parte / todo) * 100)}%` : '0%');
const diaCurto = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;

function Numero({ titulo, valor, detalhe }: { titulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-4">
      <p className="text-sm text-stone-600">{titulo}</p>
      <p className="text-3xl font-extrabold text-stone-900">{valor}</p>
      {detalhe && <p className="mt-0.5 text-xs text-stone-500">{detalhe}</p>}
    </div>
  );
}

// Barras horizontais de uma cor só: o comprimento mostra a quantidade, o número fica ao lado.
function Barras({ itens, base, total }: { itens: { nome: string; n: number }[]; base: number; total?: number }) {
  return (
    <ul className="space-y-2.5">
      {itens.map((i) => (
        <li key={i.nome}>
          <div className="flex items-baseline justify-between gap-3 text-sm">
            <span className="text-stone-800">{i.nome}</span>
            <span className="shrink-0 text-stone-600">
              <strong className="text-stone-900">{i.n}</strong>
              {total !== undefined && ` · ${pct(i.n, total)}`}
            </span>
          </div>
          <div className="mt-1 h-2.5 rounded-r bg-stone-100">
            <div className="h-2.5 rounded-r bg-[#2a78d6]" style={{ width: base > 0 ? `${Math.max(i.n > 0 ? 1 : 0, (i.n / base) * 100)}%` : 0 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function GraficoDiario({ dias }: { dias: { dia: string; visitantes: number; cadastros: number }[] }) {
  const topo = Math.max(1, ...dias.map((d) => Math.max(d.visitantes, d.cadastros)));
  const passo = Math.ceil(dias.length / 10);
  return (
    <figure>
      <div className="mb-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-stone-700">
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#2a78d6]" aria-hidden="true" /> Pessoas que entraram
        </span>
        <span className="flex items-center gap-2">
          <span className="h-3 w-3 rounded-sm bg-[#eb6834]" aria-hidden="true" /> Cadastros enviados
        </span>
      </div>
      <div className="relative">
        <span className="absolute -top-2 left-0 text-xs text-stone-500">{topo}</span>
        <div className="flex h-44 items-end gap-1 border-b border-stone-300 pt-4 pl-7">
          {dias.map((d) => (
            <div key={d.dia} className="group relative flex h-full min-w-0 flex-1 items-end justify-center gap-0.5">
              <div className="w-full max-w-3 rounded-t bg-[#2a78d6]" style={{ height: `${(d.visitantes / topo) * 100}%` }} />
              <div className="w-full max-w-3 rounded-t bg-[#eb6834]" style={{ height: `${(d.cadastros / topo) * 100}%` }} />
              <div className="pointer-events-none absolute bottom-full left-1/2 z-10 mb-1 hidden -translate-x-1/2 rounded-lg bg-stone-900 px-2.5 py-1.5 text-xs whitespace-nowrap text-white shadow-lg group-hover:block">
                <strong>{diaCurto(d.dia)}</strong>: {d.visitantes} {d.visitantes === 1 ? 'pessoa' : 'pessoas'} · {d.cadastros}{' '}
                {d.cadastros === 1 ? 'cadastro' : 'cadastros'}
              </div>
            </div>
          ))}
        </div>
        <div className="flex gap-1 pl-7 text-center text-xs text-stone-500">
          {dias.map((d, i) => (
            <span key={d.dia} className="min-w-0 flex-1 overflow-visible pt-1 whitespace-nowrap">
              {i % passo === 0 ? diaCurto(d.dia) : ''}
            </span>
          ))}
        </div>
      </div>
      <details className="mt-3 text-sm">
        <summary className="cursor-pointer font-semibold text-emerald-800">Ver os números em tabela</summary>
        <table className="mt-2 w-full max-w-sm border-collapse text-left">
          <thead className="text-xs text-stone-500">
            <tr>
              <th className="py-1 font-semibold">Dia</th>
              <th className="py-1 font-semibold">Pessoas</th>
              <th className="py-1 font-semibold">Cadastros</th>
            </tr>
          </thead>
          <tbody>
            {dias.map((d) => (
              <tr key={d.dia} className="border-t border-stone-100">
                <td className="py-1">{diaCurto(d.dia)}</td>
                <td className="py-1">{d.visitantes}</td>
                <td className="py-1">{d.cadastros}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </figure>
  );
}

export default async function Site({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  await exigirUsuario();
  const pedido = (await searchParams).p;
  const periodo: PeriodoSite = PERIODOS_SITE.some((x) => x.valor === pedido) ? (pedido as PeriodoSite) : 'tudo';
  const e = await estatisticasDoSite(periodo);
  const r = e.resumo;
  const endereco = Math.max(e.campos.rua ?? 0, e.campos.gps ?? 0);
  const funil = [
    { nome: 'Entraram no site', n: r.visitantes },
    { nome: 'Começaram a preencher', n: r.comecaram },
    { nome: 'Chegaram no telefone', n: e.campos.telefone ?? 0 },
    { nome: 'Chegaram no endereço', n: endereco },
    { nome: 'Chegaram no número da casa', n: e.campos.numero ?? 0 },
    { nome: 'Escolheram o dia', n: e.campos.dia ?? 0 },
    { nome: 'Escolheram o horário', n: e.campos.periodo ?? 0 },
    { nome: 'Tocaram em "Enviar cadastro"', n: r.tentaram },
    { nome: 'Concluíram o cadastro', n: r.cadastraram },
  ];
  const totalToques = e.toques.reduce((s, t) => s + t.n, 0);
  const totalAparelhos = e.aparelhos.reduce((s, a) => s + a.n, 0);
  const nomeAparelho: Record<string, string> = { celular: 'Celular', tablet: 'Tablet', computador: 'Computador' };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold text-stone-900">Estatísticas do site</h1>
          <p className="text-sm text-stone-600">Quem entra no formulário, até onde chega e onde toca. Os dados são anônimos.</p>
        </div>
        <nav className="inline-flex overflow-hidden rounded-lg border border-stone-300" aria-label="Período">
          {PERIODOS_SITE.map((p) => (
            <Link
              key={p.valor}
              href={`/admin/site?p=${p.valor}`}
              aria-current={p.valor === periodo ? 'page' : undefined}
              className={`px-3 py-2 text-sm font-semibold ${p.valor === periodo ? 'bg-emerald-700 text-white' : 'bg-white text-stone-700 hover:bg-stone-50'}`}
            >
              {p.nome}
            </Link>
          ))}
        </nav>
      </div>

      <section aria-label="Resumo" className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Numero titulo="Acessos" valor={r.acessos} detalhe="vezes que a página abriu" />
        <Numero titulo="Pessoas" valor={r.visitantes} detalhe="aparelhos diferentes" />
        <Numero titulo="Começaram a preencher" valor={r.comecaram} detalhe={`${pct(r.comecaram, r.visitantes)} das pessoas`} />
        <Numero titulo="Pessoas que cadastraram" valor={r.cadastraram} detalhe={`${pct(r.cadastraram, r.visitantes)} das pessoas`} />
        <Numero titulo="Cadastros enviados" valor={r.cadastros} detalhe="uma pessoa pode enviar vários" />
      </section>

      {r.acessos === 0 ? (
        <p className="rounded-xl border border-dashed border-stone-300 bg-white p-8 text-center text-stone-600">
          Ainda não há acessos registrados neste período.
        </p>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-3 text-base font-extrabold text-stone-900">Pessoas e cadastros por dia</h2>
              <GraficoDiario dias={e.dias} />
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-base font-extrabold text-stone-900">Até onde as pessoas chegam</h2>
              <p className="mb-3 text-sm text-stone-600">Cada linha mostra quantas pessoas chegaram naquela etapa do formulário.</p>
              <Barras itens={funil} base={r.visitantes} total={r.visitantes} />
            </section>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="text-base font-extrabold text-stone-900">Onde o envio trava</h2>
              <p className="mb-3 text-sm text-stone-600">Campos que estavam faltando quando a pessoa tocou em "Enviar cadastro".</p>
              {e.erros.length === 0 ? (
                <p className="text-sm text-stone-500">Nenhum envio travou por falta de campo.</p>
              ) : (
                <Barras itens={e.erros.map((x) => ({ nome: rotulo(x.campo), n: x.n }))} base={e.erros[0].n} />
              )}
            </section>

            <section className="rounded-xl border border-stone-200 bg-white p-4">
              <h2 className="mb-3 text-base font-extrabold text-stone-900">Aparelho usado</h2>
              <Barras itens={e.aparelhos.map((a) => ({ nome: nomeAparelho[a.dispositivo] ?? a.dispositivo, n: a.n }))} base={totalAparelhos} total={totalAparelhos} />
            </section>
          </div>

          <section className="rounded-xl border border-stone-200 bg-white p-4">
            <h2 className="text-base font-extrabold text-stone-900">Mapa de calor do site</h2>
            <p className="mb-4 text-sm text-stone-600">
              Onde as pessoas tocam no formulário. Quanto mais vermelho, mais toques naquele ponto ({totalToques}{' '}
              {totalToques === 1 ? 'toque registrado' : 'toques registrados'}).
            </p>
            <div className="grid gap-6 lg:grid-cols-[auto_1fr]">
              <MapaNavegacao cliques={e.cliques} />
              <div>
                <h3 className="mb-3 text-sm font-extrabold text-stone-900">Toques por parte da página</h3>
                {e.toques.length === 0 ? (
                  <p className="text-sm text-stone-500">Nenhum toque registrado neste período.</p>
                ) : (
                  <Barras itens={e.toques.map((t) => ({ nome: rotulo(t.chave), n: t.n }))} base={e.toques[0].n} total={totalToques} />
                )}
              </div>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
