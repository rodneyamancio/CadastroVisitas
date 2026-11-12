import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { nomeDia, nomePeriodo } from '../config';
import { sql } from '../db';
import { enderecoCompleto, type Visita } from '../visitas';
import { tokensValidos, type DonoDoToken } from './tokens';

// Sessões abertas no servidor MCP. Ficam na memória do processo (o sistema roda em um
// processo só); se o servidor reiniciar, o cliente recebe 404 e abre outra sessão sozinho.
export type Sessao = {
  id: string;
  servidor: McpServer;
  transporte: WebStandardStreamableHTTPServerTransport;
  dono: DonoDoToken;
  assinaturas: Set<string>;
  ultimoUso: number;
};

const g = globalThis as unknown as { _mcpSessoes?: Map<string, Sessao>; _mcpFaxina?: ReturnType<typeof setInterval> };
export const sessoes = (g._mcpSessoes ??= new Map<string, Sessao>());

const MAX_SESSOES = 200;
const OCIOSA_MS = 24 * 60 * 60_000;

export const RECURSOS = {
  recentes: 'missao://visitas/recentes',
  resumo: 'missao://visitas/resumo',
  pedidos: 'missao://usuarios/pedidos',
} as const;

export async function encerrarSessao(id: string): Promise<void> {
  const s = sessoes.get(id);
  if (!s) return;
  sessoes.delete(id);
  await s.servidor.close().catch(() => {});
}

export async function encerrarSessoesDoToken(tokenId: number): Promise<void> {
  await Promise.all([...sessoes.values()].filter((s) => s.dono.tokenId === tokenId).map((s) => encerrarSessao(s.id)));
}

export function guardarSessao(s: Sessao): void {
  sessoes.set(s.id, s);
  if (sessoes.size > MAX_SESSOES) {
    const maisAntiga = [...sessoes.values()].sort((a, b) => a.ultimoUso - b.ultimoUso)[0];
    void encerrarSessao(maisAntiga.id);
  }
  // Faxina: fecha as sessões paradas há muito tempo e as de tokens revogados.
  g._mcpFaxina ??= setInterval(() => void faxina().catch(() => {}), 5 * 60_000);
  g._mcpFaxina.unref?.();
}

async function sessoesValidas(): Promise<Sessao[]> {
  const todas = [...sessoes.values()];
  const validos = await tokensValidos([...new Set(todas.map((s) => s.dono.tokenId))]);
  const boas: Sessao[] = [];
  for (const s of todas) {
    // O perfil faz parte da sessão (define as ferramentas): se mudou, a sessão é refeita.
    if (validos.get(s.dono.tokenId) === s.dono.perfil && Date.now() - s.ultimoUso < OCIOSA_MS) boas.push(s);
    else await encerrarSessao(s.id);
  }
  return boas;
}

const faxina = () => sessoesValidas();

// ---------- Avisos em tempo real ----------

type Aviso = { tipo: 'nova_visita' | 'novo_pedido_de_acesso'; texto: string; dados: Record<string, unknown>; recursos: string[]; soSuperAdmin?: boolean };

async function avisar(aviso: Aviso): Promise<void> {
  if (!sessoes.size) return;
  for (const s of await sessoesValidas()) {
    if (aviso.soSuperAdmin && s.dono.perfil !== 'super_admin') continue;
    try {
      // 1) Quem assinou o recurso recebe "resources/updated" (padrão do MCP)
      for (const uri of aviso.recursos) {
        if (s.assinaturas.has(uri)) await s.servidor.server.sendResourceUpdated({ uri });
      }
      // 2) Mensagem com o resumo do cadastro, para os clientes que mostram os avisos do servidor
      await s.servidor.sendLoggingMessage({ level: 'notice', logger: 'cadastros', data: { tipo: aviso.tipo, texto: aviso.texto, ...aviso.dados } });
    } catch (e) {
      console.error('Falha ao avisar sessão MCP', s.id, e);
    }
  }
}

const hora = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export async function avisarNovaVisita(id: number): Promise<void> {
  if (!sessoes.size) return;
  const [v] = await sql<Visita>('SELECT * FROM visitas WHERE id = $1', [id]);
  if (!v) return;
  const visita = `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`;
  await avisar({
    tipo: 'nova_visita',
    texto: `Nova família cadastrada (nº ${v.id}): ${v.responsavel}, ${enderecoCompleto(v)}. Visita: ${visita}.`,
    dados: { id: v.id, responsavel: v.responsavel, endereco: enderecoCompleto(v), bairro: v.bairro, visita, cadastrado_em: hora.format(new Date(v.criado_em)) },
    recursos: [RECURSOS.recentes, RECURSOS.resumo],
  });
}

export async function avisarNovoPedido(p: { id: number; nome: string; email: string }): Promise<void> {
  await avisar({
    tipo: 'novo_pedido_de_acesso',
    texto: `Novo pedido de acesso ao painel (nº ${p.id}): ${p.nome} <${p.email}>. Aguardando aprovação do super admin.`,
    dados: { id: p.id, nome: p.nome, email: p.email },
    recursos: [RECURSOS.pedidos],
    soSuperAdmin: true,
  });
}
