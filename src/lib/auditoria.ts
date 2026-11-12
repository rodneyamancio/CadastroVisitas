import { headers } from 'next/headers';
import { sql } from './db';

// Nome de cada ação registrada, como aparece na tela de auditoria.
export const ACOES: Record<string, string> = {
  'login.ok': 'Entrou no painel',
  'login.falha': 'Tentativa de login recusada',
  'login.saiu': 'Saiu do painel',
  'senha.alterada': 'Alterou a própria senha',
  'senha.definida': 'Definiu a senha pelo link do e-mail',
  'senha.esqueci': 'Pediu redefinição de senha',
  'usuario.pedido': 'Pediu acesso pelo autocadastro',
  'usuario.aprovado': 'Aprovou pedido de acesso',
  'usuario.recusado': 'Recusou pedido de acesso',
  'usuario.criado': 'Cadastrou usuário',
  'usuario.convite': 'Enviou convite por e-mail',
  'usuario.perfil': 'Mudou perfil de usuário',
  'usuario.ativado': 'Reativou usuário',
  'usuario.desativado': 'Desativou usuário',
  'usuario.senha': 'Redefiniu senha de usuário',
  'usuario.link': 'Enviou link de redefinição de senha',
  'usuario.excluido': 'Excluiu usuário',
  'visita.criada': 'Cadastro recebido pelo formulário',
  'visita.excluida': 'Excluiu visita',
  'visita.exportada': 'Exportou visitas para Excel',
  'visita.localizar': 'Mandou localizar endereços no mapa',
  'roteiro.gerado': 'Montou roteiros com IA',
  'roteiro.falha': 'Falha ao montar roteiros',
  'roteiro.exportado': 'Exportou roteiros para Excel',
  'config.ia': 'Alterou a conexão da IA',
  'config.email': 'Alterou o envio de e-mail',
  'email.teste': 'Enviou e-mail de teste',
  'email.falha': 'Falha ao enviar e-mail',
};

export const CATEGORIAS = [
  { valor: 'login', nome: 'Acesso' },
  { valor: 'senha', nome: 'Senhas' },
  { valor: 'usuario', nome: 'Usuários' },
  { valor: 'visita', nome: 'Visitas' },
  { valor: 'roteiro', nome: 'Roteiros' },
  { valor: 'config', nome: 'Configurações' },
  { valor: 'email', nome: 'E-mails' },
] as const;

type Autor = { id: number; nome: string; email: string } | { nome: string } | null;

// Grava uma linha de auditoria. Nunca interrompe a ação principal se falhar.
export async function registrar(
  acao: keyof typeof ACOES | (string & {}),
  autor: Autor,
  alvo?: string | null,
  detalhes?: Record<string, unknown>,
): Promise<void> {
  try {
    const h = await headers();
    const ip = h.get('x-forwarded-for')?.split(',')[0]?.trim() || h.get('x-real-ip') || null;
    await sql('INSERT INTO auditoria (usuario_id, usuario, acao, alvo, detalhes, ip, agente) VALUES ($1, $2, $3, $4, $5, $6, $7)', [
      autor && 'id' in autor ? autor.id : null,
      autor ? ('email' in autor ? `${autor.nome} <${autor.email}>` : autor.nome) : null,
      acao,
      alvo ?? null,
      detalhes ? JSON.stringify(detalhes) : null,
      ip,
      (h.get('user-agent') ?? '').slice(0, 400) || null,
    ]);
  } catch (e) {
    console.error('Falha ao gravar auditoria', acao, e);
  }
}

export type LinhaAuditoria = {
  id: number;
  criado_em: Date;
  usuario: string | null;
  acao: string;
  alvo: string | null;
  detalhes: Record<string, unknown> | null;
  ip: string | null;
  agente: string | null;
};

export const POR_PAGINA = 50;

export async function listarAuditoria(f: { categoria?: string; q?: string; pagina: number }): Promise<{ linhas: LinhaAuditoria[]; total: number }> {
  const onde: string[] = [];
  const params: unknown[] = [];
  if (f.categoria) {
    params.push(`${f.categoria}.%`);
    onde.push(`acao LIKE $${params.length}`);
  }
  if (f.q) {
    params.push(`%${f.q.replace(/[%_\\]/g, '\\$&')}%`);
    const n = params.length;
    onde.push(`(usuario ILIKE $${n} OR alvo ILIKE $${n} OR ip ILIKE $${n} OR detalhes::text ILIKE $${n})`);
  }
  const filtro = onde.length ? `WHERE ${onde.join(' AND ')}` : '';
  const [{ total }] = await sql<{ total: number }>(`SELECT count(*)::int AS total FROM auditoria ${filtro}`, params);
  const linhas = await sql<LinhaAuditoria>(
    `SELECT id, criado_em, usuario, acao, alvo, detalhes, ip, agente FROM auditoria ${filtro}
     ORDER BY id DESC LIMIT ${POR_PAGINA} OFFSET ${Math.max(0, f.pagina - 1) * POR_PAGINA}`,
    params,
  );
  return { linhas, total };
}
