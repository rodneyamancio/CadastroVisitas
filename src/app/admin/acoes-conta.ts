'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registrar } from '@/lib/auditoria';
import { criarSessao, exigirSuperAdmin, exigirUsuario, ipDoCliente, urlBase } from '@/lib/auth';
import { sql } from '@/lib/db';
import { ErroEmail, configuracaoEmail, emailPronto, emails, enviarEmail, gravarConfigEmail } from '@/lib/email';
import { dentroDoLimite } from '@/lib/limite';
import { avisarNovoPedido, encerrarSessoesDoToken } from '@/lib/mcp/sessoes';
import { MAX_TOKENS, criarTokenMcp, listarTokensMcp, revogarTokenMcp } from '@/lib/mcp/tokens';
import { conferirSenha, hashSenha } from '@/lib/senha';
import { criarToken, lerToken, usarToken, validadeEmTexto } from '@/lib/tokens';

export type RetornoConta = { erro?: string; ok?: string } | undefined;

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function novaSenhaValida(fd: FormData): { senha: string } | { erro: string } {
  const senha = String(fd.get('nova') ?? '');
  if (senha.length < 8) return { erro: 'A nova senha precisa ter pelo menos 8 caracteres.' };
  if (senha !== String(fd.get('confirmar') ?? '')) return { erro: 'As duas senhas digitadas não são iguais. Digite de novo.' };
  return { senha };
}

// ---------- Minha conta: trocar a própria senha ----------

export async function alterarMinhaSenha(_anterior: RetornoConta, fd: FormData): Promise<RetornoConta> {
  const eu = await exigirUsuario();
  if (!dentroDoLimite(`trocar-senha:${eu.id}`, 8, 10 * 60_000)) return { erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' };
  const [u] = await sql<{ senha_hash: string }>('SELECT senha_hash FROM usuarios WHERE id = $1', [eu.id]);
  if (!u || !conferirSenha(String(fd.get('atual') ?? ''), u.senha_hash)) return { erro: 'A senha atual não confere.' };
  const nova = novaSenhaValida(fd);
  if ('erro' in nova) return nova;
  if (conferirSenha(nova.senha, u.senha_hash)) return { erro: 'A nova senha precisa ser diferente da atual.' };

  const [{ versao }] = await sql<{ versao: number }>(
    'UPDATE usuarios SET senha_hash = $2, senha_pendente = FALSE, versao = versao + 1 WHERE id = $1 RETURNING versao',
    [eu.id, hashSenha(nova.senha)],
  );
  await sql('DELETE FROM tokens_senha WHERE usuario_id = $1', [eu.id]);
  // A sessão deste aparelho continua; as abertas em outros aparelhos são encerradas.
  await criarSessao(eu.id, versao);
  await registrar('senha.alterada', eu);
  if (await emailPronto()) {
    await enviarEmail({ para: eu.email, ...emails.senhaAlterada(eu.nome) }).catch((e) => console.error('Falha ao avisar troca de senha', e));
  }
  return { ok: 'Senha alterada. Nos outros aparelhos será preciso entrar de novo.' };
}

// ---------- Esqueci minha senha (página pública) ----------

export async function pedirRedefinicao(_anterior: RetornoConta, fd: FormData): Promise<RetornoConta> {
  const email = campo(fd, 'email').toLowerCase();
  if (!EMAIL.test(email)) return { erro: 'Digite o e-mail que você usa para entrar no painel.' };
  if (!dentroDoLimite(`esqueci:${await ipDoCliente()}`, 5, 15 * 60_000) || !dentroDoLimite(`esqueci:${email}`, 3, 15 * 60_000)) {
    return { erro: 'Muitos pedidos em pouco tempo. Aguarde 15 minutos e tente de novo.' };
  }
  if (!(await emailPronto())) return { erro: 'O envio de e-mail não está configurado neste sistema. Peça ao super admin para redefinir a sua senha.' };

  // A resposta é a mesma, exista ou não o e-mail, para não revelar quem tem cadastro.
  const [u] = await sql<{ id: number; nome: string; email: string; senha_pendente: boolean }>(
    'SELECT id, nome, email, senha_pendente FROM usuarios WHERE email = $1 AND ativo',
    [email],
  );
  if (u) {
    const tipo = u.senha_pendente ? 'convite' : 'redefinicao';
    try {
      const link = `${await urlBase()}/admin/definir-senha?codigo=${await criarToken(u.id, tipo)}`;
      await enviarEmail({ para: u.email, ...emails.redefinicao(u.nome, link, validadeEmTexto(tipo)) });
      await registrar('senha.esqueci', u);
    } catch (e) {
      await registrar('email.falha', u, null, { email: 'redefinição de senha', motivo: e instanceof ErroEmail ? e.message : 'erro inesperado' });
    }
  } else {
    await registrar('senha.esqueci', { nome: email }, null, { resultado: 'e-mail não cadastrado ou desativado, nada foi enviado' });
  }
  return { ok: 'Se este e-mail tiver acesso ao painel, enviamos agora um link para criar uma nova senha. Confira também a caixa de spam.' };
}

// ---------- Criar a senha pelo link do e-mail (página pública) ----------

export async function definirSenha(_anterior: RetornoConta, fd: FormData): Promise<RetornoConta> {
  if (!dentroDoLimite(`definir-senha:${await ipDoCliente()}`, 15, 10 * 60_000)) return { erro: 'Muitas tentativas. Aguarde 10 minutos e tente de novo.' };
  const token = await lerToken(campo(fd, 'codigo'));
  if (!token) return { erro: 'Este link já foi usado ou venceu. Peça um novo em "Esqueci minha senha".' };
  const nova = novaSenhaValida(fd);
  if ('erro' in nova) return nova;

  const [{ versao }] = await sql<{ versao: number }>(
    'UPDATE usuarios SET senha_hash = $2, senha_pendente = FALSE, versao = versao + 1 WHERE id = $1 RETURNING versao',
    [token.usuario_id, hashSenha(nova.senha)],
  );
  await usarToken(token.id);
  await registrar('senha.definida', { id: token.usuario_id, nome: token.nome, email: token.email }, null, {
    origem: token.tipo === 'convite' ? 'convite de novo usuário' : 'redefinição de senha',
  });
  await criarSessao(token.usuario_id, versao);
  redirect('/admin');
}

// ---------- Autocadastro de admin (página pública): fica aguardando a aprovação do super admin ----------

export type RetornoPedido = { erro?: string; ok?: string; valores?: { nome: string; email: string } } | undefined;

export async function pedirAcesso(_anterior: RetornoPedido, fd: FormData): Promise<RetornoPedido> {
  // Campo invisível: pessoas não preenchem, robôs sim.
  if (campo(fd, 'site')) return { ok: 'Pedido enviado.' };
  const nome = campo(fd, 'nome').replace(/\s+/g, ' ').slice(0, 120);
  const email = campo(fd, 'email').toLowerCase().slice(0, 160);
  const falhou = (erro: string): RetornoPedido => ({ erro, valores: { nome, email } });
  if (nome.length < 5 || !nome.includes(' ')) return falhou('Escreva o seu nome completo.');
  if (!EMAIL.test(email)) return falhou('Informe um e-mail válido.');
  const nova = novaSenhaValida(fd);
  if ('erro' in nova) return falhou(nova.erro.replace('A nova senha', 'A senha'));
  if (!dentroDoLimite(`pedir-acesso:${await ipDoCliente()}`, 3, 60 * 60_000)) return falhou('Muitos pedidos em pouco tempo. Aguarde uma hora e tente de novo.');
  const [{ n }] = await sql<{ n: number }>('SELECT count(*)::int AS n FROM usuarios WHERE aguardando_aprovacao');
  if (n >= 30) return falhou('Há muitos pedidos aguardando análise no momento. Tente de novo mais tarde.');
  const [existe] = await sql('SELECT 1 FROM usuarios WHERE email = $1', [email]);
  if (existe) return falhou('Já existe um cadastro ou um pedido com este e-mail. Se for seu, use "Esqueci minha senha" na tela de entrada.');

  const [novo] = await sql<{ id: number }>(
    `INSERT INTO usuarios (nome, email, senha_hash, perfil, ativo, aguardando_aprovacao) VALUES ($1, $2, $3, 'admin', FALSE, TRUE) RETURNING id`,
    [nome, email, hashSenha(nova.senha)],
  );
  await avisarNovoPedido({ id: novo.id, nome, email }).catch((e) => console.error('Falha ao avisar pelo MCP', e));
  await registrar('usuario.pedido', { nome: `${nome} <${email}>` }, null, { perfil: 'Admin', situação: 'aguardando aprovação do super admin' });

  // Avisa todos os super admins por e-mail (se o envio estiver configurado).
  if (await emailPronto()) {
    const link = `${await urlBase()}/admin/usuarios`;
    const superAdmins = await sql<{ nome: string; email: string }>("SELECT nome, email FROM usuarios WHERE perfil = 'super_admin' AND ativo");
    await Promise.all(
      superAdmins.map((s) =>
        enviarEmail({ para: s.email, ...emails.pedidoDeAcesso(s.nome, { nome, email }, link) }).catch((e) =>
          registrar('email.falha', { nome: 'Sistema' }, `${s.nome} <${s.email}>`, { email: 'aviso de pedido de acesso', motivo: e instanceof ErroEmail ? e.message : 'erro inesperado' }),
        ),
      ),
    );
  }
  revalidatePath('/admin', 'layout');
  return { ok: 'Pedido enviado! A coordenação vai analisar o seu cadastro. Assim que for aprovado, você recebe um e-mail e já pode entrar com a senha que acabou de criar.' };
}

// ---------- Envio de e-mail pelo Resend (só super admin) ----------

export async function salvarEmail(_anterior: RetornoConta, fd: FormData): Promise<RetornoConta> {
  const eu = await exigirSuperAdmin();
  const nome = campo(fd, 'nome').slice(0, 80) || 'Missão Fraternal';
  const endereco = campo(fd, 'endereco').toLowerCase().slice(0, 160);
  const digitada = campo(fd, 'chave').slice(0, 400);
  const testar = campo(fd, 'acao') === 'testar';
  const para = campo(fd, 'para').toLowerCase();
  if (!EMAIL.test(endereco)) return { erro: 'Informe o e-mail do remetente, por exemplo: nao-responda@seudominio.com.br.' };
  if (testar && !EMAIL.test(para)) return { erro: 'Informe para qual e-mail enviar o teste.' };

  const atual = await configuracaoEmail();
  const chave = digitada || (fd.get('remover') ? null : atual.chave);
  const mudancas = {
    remetente: `${nome} <${endereco}>`,
    chave: digitada ? 'substituída' : fd.get('remover') && atual.chave ? 'apagada' : 'mantida',
  };

  if (testar) {
    if (!chave) return { erro: 'Informe a chave de API do Resend para enviar o teste.' };
    try {
      // O teste usa o que está na tela: a chave nova só é salva se o envio der certo.
      await enviarEmail({ para, ...emails.teste(eu.nome) }, { chave, nome, endereco });
    } catch (e) {
      const motivo = e instanceof ErroEmail ? e.message : 'Não foi possível enviar o e-mail de teste.';
      await registrar('email.falha', eu, para, { email: 'teste', motivo });
      return { erro: `${motivo} Nada foi salvo.` };
    }
    await registrar('email.teste', eu, para);
  }
  await gravarConfigEmail({ chave: digitada || (fd.get('remover') ? null : undefined), nome, endereco });
  await registrar('config.email', eu, null, mudancas);
  revalidatePath('/admin', 'layout');
  if (!chave) return { erro: 'Remetente salvo, mas falta a chave de API do Resend.' };
  return { ok: testar ? `E-mail de teste enviado para ${para}. Configuração salva.` : 'Configuração de e-mail salva.' };
}

// ---------- Tokens de acesso ao servidor MCP ----------

export type RetornoToken = { erro?: string; token?: string; nome?: string } | undefined;

export async function criarMeuTokenMcp(_anterior: RetornoToken, fd: FormData): Promise<RetornoToken> {
  const eu = await exigirUsuario();
  const nome = campo(fd, 'nome').replace(/\s+/g, ' ').slice(0, 60);
  if (nome.length < 2) return { erro: 'Dê um nome para lembrar onde o token será usado. Exemplo: Claude no meu computador.' };
  if ((await listarTokensMcp(eu.id)).length >= MAX_TOKENS) return { erro: `Você já tem ${MAX_TOKENS} tokens. Revogue um que não usa mais para criar outro.` };
  const token = await criarTokenMcp(eu.id, nome);
  await registrar('mcp.token.criado', eu, nome, { final: `…${token.slice(-4)}` });
  revalidatePath('/admin/mcp');
  return { token, nome };
}

export async function revogarMeuTokenMcp(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const t = await revogarTokenMcp(id, eu.id);
  if (t) {
    await encerrarSessoesDoToken(t.id);
    await registrar('mcp.token.revogado', eu, t.nome, { final: `…${t.final}` });
  }
  revalidatePath('/admin/mcp');
}
