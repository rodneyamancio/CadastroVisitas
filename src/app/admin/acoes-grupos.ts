'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registrar } from '@/lib/auditoria';
import { exigirUsuario, urlBase } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { sql } from '@/lib/db';
import { ErroEmail, emailPronto, emails, enviarEmail } from '@/lib/email';
import { colocarNoGrupo, comentar, criarGruposDoRoteiro, desmarcarFeita, marcarFeita, ordenarPeloTrajeto, type Grupo } from '@/lib/grupos';
import { ultimoRoteiro } from '@/lib/roteiro';
import { hashSenha } from '@/lib/senha';
import { criarToken, validadeEmTexto } from '@/lib/tokens';

// Grupos de visitas, distribuição e líderes: qualquer admin do painel.

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function atualizar() {
  revalidatePath('/admin', 'layout');
  revalidatePath('/lider', 'layout');
}

// ---------- Grupos ----------

export type ValoresDoGrupo = { nome: string; lider: string; observacao: string };
export type RetornoGrupo = { erro?: string; ok?: string; valores?: ValoresDoGrupo; criado?: number } | undefined;

async function lerGrupo(fd: FormData): Promise<{ valores: ValoresDoGrupo; lider: { id: number; nome: string } | null; erro?: string }> {
  const valores = { nome: campo(fd, 'nome').replace(/\s+/g, ' ').slice(0, 100), lider: campo(fd, 'lider'), observacao: campo(fd, 'observacao').slice(0, 400) };
  if (valores.nome.length < 2) return { valores, lider: null, erro: 'Dê um nome para o grupo. Exemplo: Grupo 1 ou Vila Bancária.' };
  if (!valores.lider) return { valores, lider: null };
  const [lider] = await sql<{ id: number; nome: string }>('SELECT id, nome FROM usuarios WHERE id = $1 AND ativo AND NOT aguardando_aprovacao', [Number(valores.lider) || 0]);
  if (!lider) return { valores, lider: null, erro: 'Este líder não está mais disponível. Escolha outro.' };
  return { valores, lider };
}

export async function criarGrupo(_anterior: RetornoGrupo, fd: FormData): Promise<RetornoGrupo> {
  const eu = await exigirUsuario();
  const { valores, lider, erro } = await lerGrupo(fd);
  if (erro) return { erro, valores };
  const [novo] = await sql<Grupo>('INSERT INTO grupos (nome, lider_id, observacao, criado_por) VALUES ($1, $2, $3, $4) RETURNING *', [
    valores.nome,
    lider?.id ?? null,
    valores.observacao || null,
    eu.nome,
  ]);
  await registrar('grupo.criado', eu, novo.nome, { líder: lider?.nome ?? 'sem líder' });
  atualizar();
  return { ok: `${novo.nome} criado.`, criado: novo.id };
}

export async function salvarGrupo(id: number, _anterior: RetornoGrupo, fd: FormData): Promise<RetornoGrupo> {
  const eu = await exigirUsuario();
  const { valores, lider, erro } = await lerGrupo(fd);
  if (erro) return { erro, valores };
  const [antes] = await sql<Grupo & { lider_nome: string | null }>('SELECT g.*, u.nome AS lider_nome FROM grupos g LEFT JOIN usuarios u ON u.id = g.lider_id WHERE g.id = $1', [id]);
  if (!antes) return { erro: 'Este grupo não existe mais.', valores };
  await sql('UPDATE grupos SET nome = $2, lider_id = $3, observacao = $4 WHERE id = $1', [id, valores.nome, lider?.id ?? null, valores.observacao || null]);
  const mudancas: Record<string, string> = {};
  if (antes.nome !== valores.nome) mudancas.nome = `${antes.nome} → ${valores.nome}`;
  if (antes.lider_id !== (lider?.id ?? null)) mudancas.líder = `${antes.lider_nome ?? 'sem líder'} → ${lider?.nome ?? 'sem líder'}`;
  if ((antes.observacao ?? '') !== valores.observacao) mudancas.observação = `${antes.observacao || '(vazio)'} → ${valores.observacao || '(vazio)'}`;
  if (!Object.keys(mudancas).length) return { ok: 'Nada foi alterado: os dados já estavam assim.' };
  await registrar('grupo.editado', eu, valores.nome, mudancas);
  atualizar();
  return { ok: 'Grupo salvo.' };
}

// As visitas do grupo excluído voltam para "sem grupo".
export async function excluirGrupo(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const [{ n }] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM visitas WHERE grupo_id = $1', [id]);
  await sql('UPDATE visitas SET ordem = NULL WHERE grupo_id = $1', [id]);
  const [g] = await sql<Grupo>('DELETE FROM grupos WHERE id = $1 RETURNING *', [id]);
  if (g) await registrar('grupo.excluido', eu, g.nome, { 'visitas que voltaram para sem grupo': n });
  atualizar();
  redirect('/admin/grupos?aviso=excluido');
}

export type RetornoDistribuicao = { erro?: string; ok?: string } | undefined;

// Coloca várias visitas nos grupos escolhidos (tela "Distribuir visitas").
export async function distribuir(pares: { id: number; grupo: number }[]): Promise<RetornoDistribuicao> {
  const eu = await exigirUsuario();
  const validos = Array.isArray(pares) ? pares.filter((p) => Number.isInteger(p?.id) && Number.isInteger(p?.grupo) && p.id > 0 && p.grupo > 0).slice(0, 1000) : [];
  if (!validos.length) return { erro: 'Escolha o grupo de pelo menos uma visita.' };
  const grupos = new Map((await sql<{ id: number; nome: string }>('SELECT id, nome FROM grupos')).map((g) => [g.id, g.nome]));
  if (validos.some((p) => !grupos.has(p.grupo))) return { erro: 'Um dos grupos escolhidos não existe mais. Atualize a página e tente de novo.' };
  const movidas = await colocarNoGrupo(validos);
  if (!movidas.length) return { ok: 'Nada mudou: as visitas já estavam nesses grupos.' };
  const porGrupo = new Map<string, string[]>();
  for (const m of movidas) {
    const nome = grupos.get(m.para!)!;
    porGrupo.set(nome, [...(porGrupo.get(nome) ?? []), `Nº ${m.id}`]);
  }
  await registrar('grupo.distribuicao', eu, null, { visitas: movidas.length, ...Object.fromEntries([...porGrupo].map(([g, ids]) => [g, ids.join(', ')])) });
  atualizar();
  return { ok: `${movidas.length} ${movidas.length === 1 ? 'visita colocada' : 'visitas colocadas'} em ${porGrupo.size} ${porGrupo.size === 1 ? 'grupo' : 'grupos'}.` };
}

// Muda o grupo de uma visita (0 = tira do grupo). Usado na tela do grupo.
export async function mudarGrupoDaVisita(id: number, grupo: number): Promise<void> {
  const eu = await exigirUsuario();
  const [destino] = grupo ? await sql<{ id: number; nome: string }>('SELECT id, nome FROM grupos WHERE id = $1', [grupo]) : [];
  if (grupo && !destino) return;
  const [m] = await colocarNoGrupo([{ id, grupo: destino?.id ?? null }]);
  if (m) {
    const [origem] = m.de ? await sql<{ nome: string }>('SELECT nome FROM grupos WHERE id = $1', [m.de]) : [];
    await registrar('visita.grupo', eu, `Nº ${m.id} · ${m.responsavel}`, { de: origem?.nome ?? 'Sem grupo', para: destino?.nome ?? 'Sem grupo' });
  }
  atualizar();
}

const distancia = (m: number | null) => (m == null ? null : m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`);

export async function ordenarGrupo(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const [g] = await sql<Grupo>('SELECT * FROM grupos WHERE id = $1', [id]);
  if (!g) return;
  const r = await ordenarPeloTrajeto(id);
  await registrar('grupo.ordenado', eu, g.nome, { visitas: r.visitas, percurso: distancia(r.distanciaM) ?? 'sem posição no mapa' });
  atualizar();
}

// Cria os grupos a partir do último roteiro montado pela IA (só com as visitas ainda sem grupo).
export async function gruposDoRoteiro(): Promise<void> {
  const eu = await exigirUsuario();
  const roteiro = await ultimoRoteiro();
  if (!roteiro) redirect('/admin/grupos?aviso=sem-roteiro');
  const r = await criarGruposDoRoteiro(roteiro, eu.nome);
  if (r.grupos) await registrar('grupo.roteiro', eu, null, { 'grupos criados': r.grupos, 'visitas colocadas': r.visitas });
  atualizar();
  redirect(`/admin/grupos?aviso=${r.grupos ? 'roteiro' : 'roteiro-vazio'}`);
}

// A coordenação marca ou desmarca a visita feita (o líder só marca, na área dele).
export async function marcarFeitaPeloPainel(id: number, feita: boolean): Promise<void> {
  const eu = await exigirUsuario();
  const v = feita ? await marcarFeita(id, eu.nome) : await desmarcarFeita(id);
  if (v) {
    await registrar(feita ? 'visita.feita' : 'visita.feita.desfeito', eu, `Nº ${v.id} · ${v.responsavel}`, {
      origem: 'painel',
      visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
    });
  }
  atualizar();
}

export type RetornoComentario = { erro?: string; ok?: string } | undefined;

export async function comentarPeloPainel(id: number, _anterior: RetornoComentario, fd: FormData): Promise<RetornoComentario> {
  const eu = await exigirUsuario();
  const texto = campo(fd, 'comentario').slice(0, 500);
  const v = await comentar(id, texto || null, eu.nome);
  if (!v) return { ok: 'Nada foi alterado.' };
  await registrar('visita.comentario', eu, `Nº ${v.id} · ${v.responsavel}`, { origem: 'painel', comentário: texto || '(apagado)' });
  atualizar();
  return { ok: 'Comentário salvo.' };
}

// ---------- Líderes de grupo ----------

type Lider = { id: number; nome: string; email: string; perfil: string; ativo: boolean; senha_pendente: boolean };

const buscarLider = async (id: number) => (await sql<Lider>("SELECT id, nome, email, perfil, ativo, senha_pendente FROM usuarios WHERE id = $1 AND perfil = 'lider'", [id]))[0];

function voltar(aviso: string): never {
  atualizar();
  redirect(`/admin/grupos/lideres?aviso=${aviso}`);
}

async function enviarLinkAoLider(u: Lider, quemPediu: string): Promise<void> {
  const tipo = u.senha_pendente ? 'convite' : 'redefinicao';
  const link = `${await urlBase()}/admin/definir-senha?codigo=${await criarToken(u.id, tipo)}`;
  const validade = validadeEmTexto(tipo);
  await enviarEmail({ para: u.email, ...(tipo === 'convite' ? emails.conviteLider(u.nome, link, validade, quemPediu) : emails.redefinicao(u.nome, link, validade)) });
}

export type ValoresDoLider = { nome: string; email: string; telefone: string; modo: string; grupo: string };
export type RetornoLider = { erro?: string; ok?: string; valores?: ValoresDoLider } | undefined;

export async function criarLider(_anterior: RetornoLider, fd: FormData): Promise<RetornoLider> {
  const eu = await exigirUsuario();
  const valores: ValoresDoLider = {
    nome: campo(fd, 'nome').replace(/\s+/g, ' ').slice(0, 120),
    email: campo(fd, 'email').toLowerCase().slice(0, 160),
    telefone: campo(fd, 'telefone').replace(/\D/g, '').slice(0, 11),
    modo: campo(fd, 'modo') === 'email' ? 'email' : 'senha',
    grupo: campo(fd, 'grupo'),
  };
  const senha = String(fd.get('senha') ?? '');
  const falhou = (erro: string): RetornoLider => ({ erro, valores });
  if (valores.nome.length < 2) return falhou('Informe o nome do líder.');
  if (!EMAIL.test(valores.email)) return falhou('Informe um e-mail válido. É com ele que o líder entra.');
  if (valores.telefone && valores.telefone.length < 10) return falhou('Escreva o telefone com DDD ou deixe em branco.');
  if (valores.modo === 'senha' && senha.length < 8) return falhou('A senha precisa ter pelo menos 8 caracteres.');
  if (valores.modo === 'email' && !(await emailPronto())) return falhou('O envio de e-mail não está configurado. Escolha "Definir a senha agora".');
  const [grupo] = valores.grupo ? await sql<{ id: number; nome: string }>('SELECT id, nome FROM grupos WHERE id = $1', [Number(valores.grupo) || 0]) : [];
  if (valores.grupo && !grupo) return falhou('Este grupo não existe mais. Escolha outro.');
  const [existe] = await sql('SELECT 1 FROM usuarios WHERE email = $1', [valores.email]);
  if (existe) return falhou('Já existe uma pessoa cadastrada com este e-mail (no painel ou como líder).');

  const [novo] = await sql<{ id: number }>(
    "INSERT INTO usuarios (nome, email, telefone, senha_hash, perfil, senha_pendente) VALUES ($1, $2, $3, $4, 'lider', $5) RETURNING id",
    [valores.nome, valores.email, valores.telefone || null, hashSenha(valores.modo === 'senha' ? senha : randomBytes(32).toString('hex')), valores.modo === 'email'],
  );
  if (valores.modo === 'email') {
    try {
      await enviarLinkAoLider({ id: novo.id, nome: valores.nome, email: valores.email, perfil: 'lider', ativo: true, senha_pendente: true }, eu.nome);
    } catch (e) {
      await sql('DELETE FROM usuarios WHERE id = $1', [novo.id]);
      const motivo = e instanceof ErroEmail ? e.message : 'Não foi possível enviar o e-mail.';
      await registrar('email.falha', eu, `${valores.nome} <${valores.email}>`, { email: 'convite de líder', motivo });
      return falhou(`${motivo} O líder não foi cadastrado.`);
    }
  }
  if (grupo) await sql('UPDATE grupos SET lider_id = $2 WHERE id = $1', [grupo.id, novo.id]);
  await registrar('lider.criado', eu, `${valores.nome} <${valores.email}>`, {
    senha: valores.modo === 'email' ? 'convite enviado por e-mail' : 'definida pela coordenação',
    grupo: grupo?.nome ?? 'nenhum por enquanto',
  });
  atualizar();
  return {
    ok:
      valores.modo === 'email'
        ? `Convite enviado para ${valores.email}. ${valores.nome} vai criar a própria senha.`
        : `${valores.nome} cadastrado. Passe para o líder o e-mail e a senha que você definiu.`,
  };
}

export async function definirSenhaDoLider(id: number, fd: FormData): Promise<void> {
  const eu = await exigirUsuario();
  const senha = String(fd.get('senha') ?? '');
  if (senha.length < 8) voltar('senha-curta');
  const u = await buscarLider(id);
  if (!u) voltar('invalido');
  // Trocar a senha encerra as sessões que o líder tinha abertas
  await sql('UPDATE usuarios SET senha_hash = $2, senha_pendente = FALSE, versao = versao + 1 WHERE id = $1', [id, hashSenha(senha)]);
  await sql('DELETE FROM tokens_senha WHERE usuario_id = $1', [id]);
  await registrar('lider.senha', eu, `${u.nome} <${u.email}>`);
  voltar('senha');
}

export async function enviarLinkDoLider(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const u = await buscarLider(id);
  if (!u || !u.ativo) voltar('invalido');
  try {
    await enviarLinkAoLider(u, eu.nome);
  } catch (e) {
    await registrar('email.falha', eu, `${u.nome} <${u.email}>`, { email: 'link de senha do líder', motivo: e instanceof ErroEmail ? e.message : 'erro inesperado' });
    voltar('email-falhou');
  }
  await registrar('lider.convite', eu, `${u.nome} <${u.email}>`);
  voltar('link');
}

export async function alternarLider(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const [u] = await sql<Lider>("UPDATE usuarios SET ativo = NOT ativo WHERE id = $1 AND perfil = 'lider' RETURNING id, nome, email, perfil, ativo, senha_pendente", [id]);
  if (u) await registrar(u.ativo ? 'lider.ativado' : 'lider.desativado', eu, `${u.nome} <${u.email}>`);
  voltar('salvo');
}

// Os grupos do líder excluído ficam sem líder (as visitas continuam nos grupos).
export async function excluirLider(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const grupos = await sql<{ nome: string }>('SELECT nome FROM grupos WHERE lider_id = $1', [id]);
  const [u] = await sql<Lider>("DELETE FROM usuarios WHERE id = $1 AND perfil = 'lider' RETURNING id, nome, email, perfil, ativo, senha_pendente", [id]);
  if (u) await registrar('lider.excluido', eu, `${u.nome} <${u.email}>`, { 'grupos que ficaram sem líder': grupos.map((g) => g.nome).join(', ') || 'nenhum' });
  voltar('excluido');
}
