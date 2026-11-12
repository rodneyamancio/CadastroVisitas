import { exigirUsuario, urlBase } from '@/lib/auth';
import { listarTokensMcp } from '@/lib/mcp/tokens';
import { sessoes } from '@/lib/mcp/sessoes';
import { revogarMeuTokenMcp } from '../../acoes-conta';
import FormularioToken from './FormularioToken';

export const metadata = { title: 'MCP' };

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

const FERRAMENTAS = [
  { nome: 'novidades', para: 'famílias cadastradas desde a última consulta (e pedidos de acesso, para o super admin)' },
  { nome: 'listar_visitas', para: 'visitas com filtros por dia, período, bairro, texto e data do cadastro' },
  { nome: 'ver_visita', para: 'todos os dados de um cadastro' },
  { nome: 'resumo_visitas', para: 'totais por dia, período e bairro' },
  { nome: 'estatisticas_site', para: 'quantos entraram no formulário e quantos concluíram' },
  { nome: 'ultimo_roteiro', para: 'último roteiro montado pelo assistente de IA' },
  { nome: 'conferir_bairros', para: 'confere de novo os bairros pela rua (Correios)' },
];
const SO_SUPER_ADMIN = [
  { nome: 'pedidos_de_acesso', para: 'quem pediu acesso ao painel e aguarda aprovação' },
  { nome: 'aprovar_pedido / recusar_pedido', para: 'decide um pedido de acesso' },
  { nome: 'listar_usuarios', para: 'usuários do painel e situação de cada um' },
  { nome: 'auditoria', para: 'registro de quem fez o quê' },
];

export default async function Mcp() {
  const eu = await exigirUsuario();
  const superAdmin = eu.perfil === 'super_admin';
  const [tokens, base] = await Promise.all([listarTokensMcp(eu.id), urlBase()]);
  const endereco = `${base}/api/mcp`;
  const conectados = new Set([...sessoes.values()].map((s) => s.dono.tokenId));

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Servidor MCP</h1>
        <p className="mt-1 text-sm text-stone-600">
          O MCP liga este sistema a um assistente de IA, como o Claude. Depois de conectado, você pode perguntar “chegou cadastro novo?”, “quantas visitas no sábado
          de manhã?” ou “resuma as visitas por bairro”, e o assistente consulta os dados daqui.
        </p>
      </div>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-extrabold text-stone-900">Endereço do servidor</h2>
        <p className="mt-2 rounded-lg bg-stone-100 p-3 font-mono text-sm break-all text-stone-900">{endereco}</p>
        <p className="mt-2 text-sm text-stone-600">
          Transporte “Streamable HTTP”. O acesso é só com token, enviado no cabeçalho <code className="rounded bg-stone-100 px-1">Authorization: Bearer &lt;token&gt;</code>. Cada
          token enxerga o mesmo que você enxerga no painel ({superAdmin ? 'Super admin' : 'Admin'}).
        </p>
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-extrabold text-stone-900">Meus tokens</h2>
        <FormularioToken endereco={endereco} />
        {tokens.length === 0 ? (
          <p className="rounded-xl border border-dashed border-stone-300 bg-white p-5 text-center text-sm text-stone-600">Você ainda não criou nenhum token.</p>
        ) : (
          <ul className="divide-y divide-stone-200 rounded-xl border border-stone-200 bg-white">
            {tokens.map((t) => (
              <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
                <div>
                  <p className="font-bold text-stone-900">
                    {t.nome}{' '}
                    {conectados.has(t.id) && <span className="ml-1 rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">conectado agora</span>}
                  </p>
                  <p className="text-sm text-stone-600">
                    <span className="font-mono">mfo_…{t.final}</span> · criado em {quando.format(new Date(t.criado_em))} ·{' '}
                    {t.ultimo_uso ? `último uso em ${quando.format(new Date(t.ultimo_uso))}` : 'ainda não foi usado'}
                  </p>
                </div>
                <form action={revogarMeuTokenMcp.bind(null, t.id)}>
                  <button type="submit" className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50">
                    Revogar
                  </button>
                </form>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-extrabold text-stone-900">Avisos de novos cadastros</h2>
        <ul className="mt-2 list-disc space-y-1.5 pl-5 text-sm text-stone-700">
          <li>
            A cada família cadastrada{superAdmin ? ' (e a cada pedido de acesso ao painel)' : ''}, o servidor envia na hora um aviso para todos os clientes conectados, com o resumo do
            cadastro.
          </li>
          <li>
            Os recursos <code className="rounded bg-stone-100 px-1">missao://visitas/recentes</code> e <code className="rounded bg-stone-100 px-1">missao://visitas/resumo</code>
            {superAdmin && (
              <>
                {' '}
                e <code className="rounded bg-stone-100 px-1">missao://usuarios/pedidos</code>
              </>
            )}{' '}
            aceitam assinatura: quem assina recebe “resources/updated” quando eles mudam.
          </li>
          <li>
            A ferramenta <strong>novidades</strong> devolve só o que chegou desde a última consulta feita com o mesmo token. Ela funciona em qualquer cliente, mesmo nos que não mostram
            avisos na tela.
          </li>
        </ul>
      </section>

      <section className="rounded-xl border border-stone-200 bg-white p-5">
        <h2 className="text-lg font-extrabold text-stone-900">O que o assistente consegue fazer</h2>
        <dl className="mt-2 grid gap-x-4 gap-y-1.5 text-sm sm:grid-cols-[auto_1fr]">
          {[...FERRAMENTAS, ...(superAdmin ? SO_SUPER_ADMIN : [])].map((f) => (
            <div key={f.nome} className="contents">
              <dt className="font-mono font-semibold text-stone-900">{f.nome}</dt>
              <dd className="text-stone-700">{f.para}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-3 text-sm text-stone-600">Tudo o que é consultado ou alterado pelo MCP fica registrado na auditoria, com o nome do token usado.</p>
      </section>
    </div>
  );
}
