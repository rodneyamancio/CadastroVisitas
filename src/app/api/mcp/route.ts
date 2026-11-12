import { randomUUID } from 'node:crypto';
import { WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js';
import { registrar } from '@/lib/auditoria';
import { ipDoCliente } from '@/lib/auth';
import { dentroDoLimite } from '@/lib/limite';
import { criarServidor } from '@/lib/mcp/servidor';
import { encerrarSessao, guardarSessao, sessoes, type Sessao } from '@/lib/mcp/sessoes';
import { lerTokenMcp } from '@/lib/mcp/tokens';

// Servidor MCP (transporte "Streamable HTTP"): POST para as chamadas, GET para o canal de
// avisos (SSE) e DELETE para encerrar a sessão. Acesso só com token: Authorization: Bearer mfo_…
export const dynamic = 'force-dynamic';

const erro = (status: number, codigo: number, mensagem: string, cabecalhos?: Record<string, string>) =>
  Response.json({ jsonrpc: '2.0', error: { code: codigo, message: mensagem }, id: null }, { status, headers: cabecalhos });

async function tratar(req: Request): Promise<Response> {
  const ip = await ipDoCliente();
  const token = (req.headers.get('authorization') ?? '').match(/^Bearer\s+(\S+)$/i)?.[1] ?? '';
  const dono = token ? await lerTokenMcp(token) : null;
  if (!dono) {
    // Limita as tentativas com token errado vindas do mesmo endereço
    if (!dentroDoLimite(`mcp-recusado:${ip}`, 30, 10 * 60_000)) return erro(429, -32000, 'Muitas tentativas sem um token válido. Aguarde alguns minutos.');
    if (token) await registrar('mcp.recusado', { nome: 'Servidor MCP' }, null, { motivo: 'token inválido ou revogado' });
    return erro(401, -32001, 'Informe um token de acesso válido no cabeçalho Authorization: Bearer <token>. O token é criado no painel, em "MCP".', {
      'WWW-Authenticate': 'Bearer realm="mcp"',
    });
  }
  if (!dentroDoLimite(`mcp:${dono.tokenId}`, 600, 60_000)) return erro(429, -32000, 'Muitas chamadas em pouco tempo. Aguarde um minuto.');

  const idSessao = req.headers.get('mcp-session-id');
  if (idSessao) {
    const sessao = sessoes.get(idSessao);
    // Sessão desconhecida (servidor reiniciou) ou de outro token: o cliente deve abrir outra.
    // O mesmo vale se o perfil do dono mudou, porque as ferramentas dependem do perfil.
    if (!sessao || sessao.dono.tokenId !== dono.tokenId || sessao.dono.perfil !== dono.perfil) {
      if (sessao?.dono.tokenId === dono.tokenId) await encerrarSessao(idSessao);
      return erro(404, -32001, 'Sessão não encontrada. Inicie uma nova sessão.');
    }
    sessao.ultimoUso = Date.now();
    const resposta = await sessao.transporte.handleRequest(req);
    if (req.method === 'DELETE') await encerrarSessao(idSessao);
    return resposta;
  }

  if (req.method !== 'POST') return erro(400, -32000, 'Sessão não informada. Comece com a chamada "initialize" por POST.');

  // Sem sessão: só pode ser o "initialize", que abre uma sessão nova.
  const assinaturas = new Set<string>();
  const servidor = criarServidor(dono, assinaturas);
  const transporte: WebStandardStreamableHTTPServerTransport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: () => randomUUID(),
    onsessioninitialized: (id) => {
      const sessao: Sessao = { id, servidor, transporte, dono, assinaturas, ultimoUso: Date.now() };
      guardarSessao(sessao);
    },
  });
  await servidor.connect(transporte);
  const resposta = await transporte.handleRequest(req);
  if (!transporte.sessionId || !sessoes.has(transporte.sessionId)) {
    await servidor.close().catch(() => {});
  } else {
    const cliente = servidor.server.getClientVersion();
    await registrar('mcp.conectou', dono, null, { token: dono.nomeDoToken, cliente: cliente ? `${cliente.name} ${cliente.version}` : 'não informado' });
  }
  return resposta;
}

export { tratar as GET, tratar as POST, tratar as DELETE };
