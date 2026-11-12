'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registrar } from '@/lib/auditoria';
import { criarSessao, encerrarSessao, exigirSuperAdmin, exigirUsuario, ipDoCliente, urlBase, usuarioAtual } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { MODELOS_ANTHROPIC, configuracaoIA, gravar, gravarChaveApi, iaPronta, type Provedor } from '@/lib/configuracoes';
import { sql } from '@/lib/db';
import { ErroEmail, emailPronto, emails, enviarEmail } from '@/lib/email';
import { ErroIA, testarConexao } from '@/lib/ia';
import { dentroDoLimite } from '@/lib/limite';
import { aprovarPedidoDeAcesso, recusarPedidoDeAcesso } from '@/lib/pedidos';
import { montarRoteiro, ultimoRoteiro } from '@/lib/roteiro';
import { conferirSenha, hashSenha } from '@/lib/senha';
import { criarToken, validadeEmTexto } from '@/lib/tokens';
import { enderecoCompleto, listarVisitas, localizarVisita, reconferirBairros, type BairroCorrigido, type Visita } from '@/lib/visitas';

export type Retorno = { erro?: string; ok?: string; valores?: { nome?: string; email: string; perfil?: string; modo?: string } } | undefined;

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const nomePerfil = (p: string) => (p === 'super_admin' ? 'Super admin' : 'Admin');

type UsuarioBanco = { id: number; nome: string; email: string; perfil: string; ativo: boolean; senha_hash: string; senha_pendente: boolean; aguardando_aprovacao: boolean; versao: number };

// ---------- Acesso ----------

export async function entrar(_anterior: Retorno, fd: FormData): Promise<Retorno> {
  const email = campo(fd, 'email').toLowerCase();
  const senha = String(fd.get('senha') ?? '');
  if (!email || !senha) return { erro: 'Preencha o e-mail e a senha.' };
  if (!dentroDoLimite(`login:${await ipDoCliente()}:${email}`, 8, 10 * 60_000)) {
    await registrar('login.falha', { nome: email }, null, { motivo: 'muitas tentativas seguidas' });
    return { erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' };
  }
  const [u] = await sql<UsuarioBanco>('SELECT * FROM usuarios WHERE email = $1', [email]);
  if (!u || !u.ativo || !conferirSenha(senha, u.senha_hash)) {
    const aguardando = Boolean(u?.aguardando_aprovacao);
    const motivo = !u ? 'e-mail não cadastrado' : aguardando ? 'cadastro aguardando aprovação' : !u.ativo ? 'usuário desativado' : u.senha_pendente ? 'senha ainda não criada (convite pendente)' : 'senha incorreta';
    await registrar('login.falha', { nome: email }, null, { motivo });
    // Só quem acertou a própria senha fica sabendo que o cadastro está em análise.
    if (u && aguardando && conferirSenha(senha, u.senha_hash)) {
      return { erro: 'Seu cadastro ainda está aguardando a aprovação da coordenação. Você recebe um e-mail assim que for liberado.', valores: { email } };
    }
    return { erro: 'E-mail ou senha incorretos.', valores: { email } };
  }
  await criarSessao(u.id, u.versao);
  await registrar('login.ok', u);
  redirect('/admin');
}

export async function sair(): Promise<void> {
  const u = await usuarioAtual();
  if (u) await registrar('login.saiu', u);
  await encerrarSessao();
  redirect('/admin/login');
}

// ---------- Visitas ----------

export async function excluirVisita(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const [v] = await sql<Visita>('DELETE FROM visitas WHERE id = $1 RETURNING *', [id]);
  if (v) {
    await registrar('visita.excluida', eu, `Nº ${v.id} · ${v.responsavel}`, {
      endereço: enderecoCompleto(v),
      telefone: v.telefone,
      visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
    });
  }
  revalidatePath('/admin', 'layout');
}

// Tenta achar no mapa os endereços que ainda não têm posição (até 15 por vez).
export async function localizarPendentes(): Promise<void> {
  const eu = await exigirUsuario();
  const pendentes = await sql<{ id: number }>('SELECT id FROM visitas WHERE lat IS NULL ORDER BY id LIMIT 15');
  let localizados = 0;
  for (const p of pendentes) {
    try {
      if (await localizarVisita(p.id)) localizados++;
    } catch (e) {
      console.error('Falha ao localizar endereço', p.id, e);
    }
  }
  await registrar('visita.localizar', eu, null, { tentados: pendentes.length, localizados });
  revalidatePath('/admin', 'layout');
}

export type RetornoBairros = { erro?: string; conferidas?: number; iguais?: number; naoAchadas?: number; corrigidas?: BairroCorrigido[] } | undefined;

// Olha de novo o bairro de todas as visitas pela rua (Correios) e corrige os que estiverem diferentes.
export async function conferirBairros(): Promise<RetornoBairros> {
  const eu = await exigirUsuario();
  if (!dentroDoLimite(`bairros:${eu.id}`, 6, 10 * 60_000)) return { erro: 'Você já conferiu os bairros várias vezes agora há pouco. Aguarde alguns minutos.' };
  try {
    const r = await reconferirBairros();
    await registrar('visita.bairros', eu, null, {
      conferidas: r.conferidas,
      corrigidas: r.corrigidas.length,
      'sem mudança': r.iguais,
      'rua não encontrada': r.naoAchadas,
      mudanças: r.corrigidas.slice(0, 40).map((c) => `Nº ${c.id}: ${c.antes || '(sem bairro)'} → ${c.depois}`).join(' · ') || undefined,
    });
    revalidatePath('/admin', 'layout');
    return r;
  } catch (e) {
    console.error('Falha ao conferir bairros', e);
    return { erro: 'Não foi possível conferir os bairros agora. Tente de novo em instantes.' };
  }
}

// ---------- Usuários (só super admin) ----------

// Manda o link para a pessoa criar a senha: convite (usuário novo) ou redefinição.
async function enviarLinkDeSenha(u: { id: number; nome: string; email: string; senha_pendente: boolean }, quemPediu: string): Promise<void> {
  const tipo = u.senha_pendente ? 'convite' : 'redefinicao';
  const link = `${await urlBase()}/admin/definir-senha?codigo=${await criarToken(u.id, tipo)}`;
  const validade = validadeEmTexto(tipo);
  await enviarEmail({ para: u.email, ...(tipo === 'convite' ? emails.convite(u.nome, link, validade, quemPediu) : emails.redefinicao(u.nome, link, validade)) });
}

export async function criarUsuario(_anterior: Retorno, fd: FormData): Promise<Retorno> {
  const eu = await exigirSuperAdmin();
  const nome = campo(fd, 'nome').slice(0, 120);
  const email = campo(fd, 'email').toLowerCase().slice(0, 160);
  const senha = String(fd.get('senha') ?? '');
  const perfil = campo(fd, 'perfil');
  const modo = campo(fd, 'modo') === 'email' ? 'email' : 'senha';
  const falhou = (erro: string): Retorno => ({ erro, valores: { nome, email, perfil, modo } });
  if (nome.length < 2) return falhou('Informe o nome do usuário.');
  if (!EMAIL.test(email)) return falhou('Informe um e-mail válido.');
  if (perfil !== 'admin' && perfil !== 'super_admin') return falhou('Escolha o perfil.');
  if (modo === 'senha' && senha.length < 8) return falhou('A senha precisa ter pelo menos 8 caracteres.');
  if (modo === 'email' && !(await emailPronto())) {
    return falhou('O envio de e-mail ainda não está configurado. Configure o Resend em Configurações ou escolha "Definir a senha agora".');
  }
  const [existe] = await sql('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  if (existe) return falhou('Já existe um usuário com este e-mail.');

  // No convite a pessoa cria a própria senha: até lá fica uma senha aleatória que ninguém conhece.
  const [novo] = await sql<{ id: number }>(
    'INSERT INTO usuarios (nome, email, senha_hash, perfil, senha_pendente) VALUES ($1, $2, $3, $4, $5) RETURNING id',
    [nome, email, hashSenha(modo === 'senha' ? senha : randomBytes(32).toString('hex')), perfil, modo === 'email'],
  );
  if (modo === 'email') {
    try {
      await enviarLinkDeSenha({ id: novo.id, nome, email, senha_pendente: true }, eu.nome);
    } catch (e) {
      await sql('DELETE FROM usuarios WHERE id = $1', [novo.id]);
      const motivo = e instanceof ErroEmail ? e.message : 'Não foi possível enviar o e-mail.';
      await registrar('email.falha', eu, `${nome} <${email}>`, { email: 'convite', motivo });
      return falhou(`${motivo} O usuário não foi cadastrado.`);
    }
  }
  await registrar('usuario.criado', eu, `${nome} <${email}>`, {
    perfil: nomePerfil(perfil),
    senha: modo === 'email' ? 'convite enviado por e-mail' : 'definida pelo super admin',
  });
  revalidatePath('/admin/usuarios');
  return { ok: modo === 'email' ? `Convite enviado para ${email}. ${nome} vai criar a própria senha.` : `Usuário ${nome} cadastrado.` };
}

function voltar(aviso: string): never {
  revalidatePath('/admin/usuarios');
  redirect(`/admin/usuarios?aviso=${aviso}`);
}

const buscarUsuario = async (id: number) => (await sql<UsuarioBanco>('SELECT * FROM usuarios WHERE id = $1', [id]))[0];

export async function enviarLink(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  const u = await buscarUsuario(id);
  if (!u || !u.ativo) voltar('invalido');
  try {
    await enviarLinkDeSenha(u, eu.nome);
  } catch (e) {
    await registrar('email.falha', eu, `${u.nome} <${u.email}>`, { email: u.senha_pendente ? 'convite' : 'redefinição de senha', motivo: e instanceof ErroEmail ? e.message : 'erro inesperado' });
    voltar('email-falhou');
  }
  await registrar(u.senha_pendente ? 'usuario.convite' : 'usuario.link', eu, `${u.nome} <${u.email}>`);
  voltar('link');
}

export async function alternarAtivo(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  if (id === eu.id) voltar('proprio');
  const [u] = await sql<UsuarioBanco>('UPDATE usuarios SET ativo = NOT ativo WHERE id = $1 AND NOT aguardando_aprovacao RETURNING *', [id]);
  if (u) await registrar(u.ativo ? 'usuario.ativado' : 'usuario.desativado', eu, `${u.nome} <${u.email}>`);
  voltar('salvo');
}

export async function mudarPerfil(id: number, fd: FormData): Promise<void> {
  const eu = await exigirSuperAdmin();
  const perfil = campo(fd, 'perfil');
  if (id === eu.id) voltar('proprio');
  if (perfil !== 'admin' && perfil !== 'super_admin') voltar('invalido');
  const antes = await buscarUsuario(id);
  if (antes && antes.perfil !== perfil) {
    await sql('UPDATE usuarios SET perfil = $2 WHERE id = $1', [id, perfil]);
    await registrar('usuario.perfil', eu, `${antes.nome} <${antes.email}>`, { de: nomePerfil(antes.perfil), para: nomePerfil(perfil) });
  }
  voltar('salvo');
}

export async function redefinirSenha(id: number, fd: FormData): Promise<void> {
  const eu = await exigirSuperAdmin();
  const senha = String(fd.get('senha') ?? '');
  if (senha.length < 8) voltar('senha-curta');
  const [u] = await sql<UsuarioBanco>(
    'UPDATE usuarios SET senha_hash = $2, senha_pendente = FALSE, versao = versao + 1 WHERE id = $1 RETURNING *',
    [id, hashSenha(senha)],
  );
  if (u) {
    await sql('DELETE FROM tokens_senha WHERE usuario_id = $1', [id]);
    await registrar('usuario.senha', eu, `${u.nome} <${u.email}>`, { como: 'senha definida pelo super admin' });
    if (u.id === eu.id) await criarSessao(u.id, u.versao);
  }
  voltar('senha');
}

export async function excluirUsuario(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  if (id === eu.id) voltar('proprio');
  const [u] = await sql<UsuarioBanco>('DELETE FROM usuarios WHERE id = $1 RETURNING *', [id]);
  if (u) await registrar('usuario.excluido', eu, `${u.nome} <${u.email}>`, { perfil: nomePerfil(u.perfil) });
  voltar('excluido');
}

// Pedidos de acesso feitos pelo autocadastro: o super admin aprova ou recusa.
export async function aprovarPedido(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  voltar((await aprovarPedidoDeAcesso(id, eu)) ? 'aprovado' : 'invalido');
}

export async function recusarPedido(id: number): Promise<void> {
  const eu = await exigirSuperAdmin();
  voltar((await recusarPedidoDeAcesso(id, eu)) ? 'recusado' : 'invalido');
}

// ---------- Conexão com a IA (só super admin) ----------

export type RetornoIA = { erro?: string; ok?: string; modelos?: string[] } | undefined;

export async function salvarIA(_anterior: RetornoIA, fd: FormData): Promise<RetornoIA> {
  const eu = await exigirSuperAdmin();
  const provedor: Provedor = campo(fd, 'provedor') === 'openai' ? 'openai' : 'anthropic';
  const modeloAnthropic = campo(fd, 'modelo_anthropic');
  const modeloOpenai = campo(fd, 'modelo_openai').slice(0, 80);
  if (!MODELOS_ANTHROPIC.some((m) => m.id === modeloAnthropic)) return { erro: 'Escolha um modelo da Anthropic.' };

  await gravar('ia_provedor', provedor);
  await gravar('ia_modelo_anthropic', modeloAnthropic);
  await gravar('ia_modelo_openai', modeloOpenai || null);
  revalidatePath('/admin', 'layout');

  const nome = provedor === 'openai' ? 'OpenAI' : 'Anthropic';
  const testar = campo(fd, 'acao') === 'testar';
  const resumo: Record<string, unknown> = { provedor: nome, modelo: provedor === 'openai' ? modeloOpenai || 'não escolhido' : modeloAnthropic };
  const terminar = async (r: RetornoIA): Promise<RetornoIA> => {
    await registrar('config.ia', eu, null, { ...resumo, resultado: r?.erro ?? r?.ok });
    return r;
  };
  let modelos: string[] | undefined;
  for (const p of ['anthropic', 'openai'] as const) {
    const digitada = campo(fd, `chave_${p}`).slice(0, 400);
    if (digitada) {
      // Chave nova do provedor escolhido: só substitui a salva se o teste passar.
      if (testar && p === provedor) {
        try {
          modelos = await testarConexao(p, digitada);
        } catch (e) {
          return terminar({ erro: `${e instanceof ErroIA ? e.message : 'Não foi possível testar a conexão.'} A chave digitada não foi salva.` });
        }
      }
      await gravarChaveApi(p, digitada);
      resumo[`chave ${p}`] = 'substituída';
    } else if (fd.get(`remover_${p}`)) {
      await gravarChaveApi(p, null);
      resumo[`chave ${p}`] = 'apagada';
    }
  }

  const chave = (await configuracaoIA()).chaves[provedor];
  if (!chave) return terminar({ erro: `Configuração salva, mas falta a chave de API da ${nome}.` });
  if (testar && !modelos) {
    try {
      modelos = await testarConexao(provedor, chave);
    } catch (e) {
      return terminar({ erro: e instanceof ErroIA ? e.message : 'Não foi possível testar a conexão.' });
    }
  }
  if (provedor === 'openai' && !modeloOpenai) {
    return terminar({
      erro: testar ? 'A chave funciona. Agora escolha o modelo da OpenAI na lista abaixo e salve de novo.' : 'Configuração salva, mas falta escolher o modelo da OpenAI. Use "Salvar e testar conexão" para ver a lista.',
      modelos,
    });
  }
  return terminar({ ok: testar ? `Conexão com a ${nome} funcionando.` : 'Configuração salva.', modelos });
}

// ---------- Assistente de roteiros ----------

export async function gerarRoteiro(_anterior: Retorno, fd: FormData): Promise<Retorno> {
  const usuario = await exigirUsuario();
  const ia = await iaPronta();
  if (!ia) return { erro: 'A IA ainda não está conectada. Peça ao super admin para configurar em Configurações.' };
  if (!dentroDoLimite(`roteiro:${usuario.id}`, 10, 60 * 60_000)) return { erro: 'Muitos roteiros gerados na última hora. Aguarde um pouco.' };
  const maxPorGrupo = Math.min(30, Math.max(2, Math.round(Number(fd.get('max')) || 6)));
  const orientacoes = campo(fd, 'orientacoes').slice(0, 600);
  const visitas = await listarVisitas();
  if (visitas.length < 2) return { erro: 'É preciso ter pelo menos duas visitas cadastradas para montar roteiros.' };
  const contexto = { visitas: visitas.length, 'máximo por grupo': maxPorGrupo, orientações: orientacoes || 'nenhuma', IA: `${ia.provedor} (${ia.modelo})` };
  try {
    await montarRoteiro(visitas, { maxPorGrupo, orientacoes }, ia, usuario.nome);
  } catch (e) {
    console.error('Falha ao montar roteiro', e);
    const erro = e instanceof ErroIA ? e.message : 'Não foi possível montar os roteiros agora. Tente de novo.';
    await registrar('roteiro.falha', usuario, null, { ...contexto, erro });
    return { erro };
  }
  await registrar('roteiro.gerado', usuario, null, { ...contexto, grupos: (await ultimoRoteiro())?.plano.grupos.length });
  revalidatePath('/admin/assistente');
  return { ok: 'Roteiros prontos.' };
}
