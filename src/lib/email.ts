import { SUBTITULO, TITULO } from './config';
import { cifrar, decifrar } from './cripto';
import { sql } from './db';

// Erro com mensagem pronta para mostrar na tela.
export class ErroEmail extends Error {}

const RESEND = (process.env.RESEND_BASE_URL || 'https://api.resend.com').replace(/\/$/, '');

export type ConfigEmail = { chave: string | null; nome: string; endereco: string };

export async function configuracaoEmail(): Promise<ConfigEmail> {
  const linhas = await sql<{ chave: string; valor: string }>("SELECT chave, valor FROM configuracoes WHERE chave LIKE 'email_%'");
  const c = Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
  return {
    chave: c.email_chave_resend ? decifrar(c.email_chave_resend) : null,
    nome: c.email_remetente_nome ?? 'Missão Fraternal',
    endereco: c.email_remetente_endereco ?? '',
  };
}

export async function gravarConfigEmail(dados: { chave?: string | null; nome: string; endereco: string }): Promise<void> {
  const gravar = (chave: string, valor: string) =>
    sql('INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor', [chave, valor]);
  await gravar('email_remetente_nome', dados.nome);
  await gravar('email_remetente_endereco', dados.endereco);
  if (dados.chave === null) await sql("DELETE FROM configuracoes WHERE chave = 'email_chave_resend'");
  else if (dados.chave) await gravar('email_chave_resend', cifrar(dados.chave));
}

export async function emailPronto(): Promise<boolean> {
  const c = await configuracaoEmail();
  return Boolean(c.chave && c.endereco);
}

export async function enviarEmail(mensagem: { para: string; assunto: string; html: string; texto: string }, cfg?: ConfigEmail): Promise<void> {
  const c = cfg ?? (await configuracaoEmail());
  if (!c.chave || !c.endereco) throw new ErroEmail('O envio de e-mail ainda não está configurado. Informe a chave do Resend e o remetente em Configurações.');
  let r: Response;
  try {
    r = await fetch(`${RESEND}/emails`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${c.chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: `${c.nome.replace(/[<>"]/g, '')} <${c.endereco}>`,
        to: [mensagem.para],
        subject: mensagem.assunto,
        html: mensagem.html,
        text: mensagem.texto,
      }),
      signal: AbortSignal.timeout(20_000),
      cache: 'no-store',
    });
  } catch {
    throw new ErroEmail('Não foi possível conectar ao Resend. Confira a internet do servidor e tente de novo.');
  }
  if (r.ok) return;
  const corpo = (await r.json().catch(() => null)) as { message?: string } | null;
  if (r.status === 401) throw new ErroEmail('O Resend recusou a chave de API. Confira a chave em Configurações.');
  if (r.status === 403 || r.status === 422) {
    throw new ErroEmail(`O Resend recusou o envio: ${corpo?.message ?? 'confira se o domínio do remetente está verificado na sua conta do Resend'}.`);
  }
  if (r.status === 429) throw new ErroEmail('Limite de envios do Resend atingido. Aguarde um pouco e tente de novo.');
  throw new ErroEmail(`O Resend respondeu com erro ${r.status}${corpo?.message ? `: ${corpo.message}` : ''}.`);
}

// ---------- Modelo visual dos e-mails ----------

const esc = (t: string) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

type Conteudo = {
  previa: string;
  titulo: string;
  paragrafos: string[];
  botao?: { texto: string; url: string };
  nota?: string;
  despedida?: string;
};

export function montarEmail(c: Conteudo): { html: string; texto: string } {
  const fonte = "font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;";
  const paragrafos = c.paragrafos
    .map((p) => `<p style="margin:0 0 16px;${fonte}font-size:17px;line-height:1.6;color:#44403c;">${esc(p)}</p>`)
    .join('');
  const botao = c.botao
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0 24px;">
         <tr><td align="center" bgcolor="#047857" style="border-radius:14px;">
           <a href="${esc(c.botao.url)}" target="_blank" style="display:inline-block;padding:16px 34px;${fonte}font-size:18px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:14px;">${esc(c.botao.texto)}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 6px;${fonte}font-size:14px;line-height:1.5;color:#78716c;">Se o botão não abrir, copie e cole este endereço no navegador:</p>
       <p style="margin:0 0 20px;${fonte}font-size:14px;line-height:1.5;word-break:break-all;"><a href="${esc(c.botao.url)}" style="color:#047857;">${esc(c.botao.url)}</a></p>`
    : '';
  const nota = c.nota
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 20px;">
         <tr><td style="background:#ecfdf5;border-radius:12px;padding:14px 16px;${fonte}font-size:15px;line-height:1.5;color:#065f46;">${esc(c.nota)}</td></tr>
       </table>`
    : '';
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="color-scheme" content="light">
<title>${esc(c.titulo)}</title>
</head>
<body style="margin:0;padding:0;background:#f5f5f4;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(c.previa)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f5f5f4;">
  <tr><td align="center" style="padding:32px 16px;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;">
      <tr><td align="center" style="padding:0 0 20px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>
          <td align="center" valign="middle" width="52" height="52" bgcolor="#047857" style="border-radius:14px;font-size:26px;line-height:52px;">&#127968;</td>
        </tr></table>
        <p style="margin:12px 0 0;${fonte}font-size:13px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#047857;">${esc(SUBTITULO)}</p>
      </td></tr>
      <tr><td style="background:#ffffff;border-radius:20px;padding:36px 32px 28px;border:1px solid #e7e5e4;">
        <h1 style="margin:0 0 18px;${fonte}font-size:26px;line-height:1.25;font-weight:800;color:#1c1917;">${esc(c.titulo)}</h1>
        ${paragrafos}
        ${botao}
        ${nota}
        <p style="margin:20px 0 0;${fonte}font-size:17px;line-height:1.6;color:#44403c;">${esc(c.despedida ?? 'Um abraço fraterno,')}<br><strong style="color:#1c1917;">Equipe da Missão Fraternal</strong></p>
      </td></tr>
      <tr><td align="center" style="padding:20px 16px 0;${fonte}font-size:13px;line-height:1.5;color:#a8a29e;">
        ${esc(TITULO)} · ${esc(SUBTITULO)}<br>Este é um e-mail automático. Não é preciso responder.
      </td></tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
  const texto = [
    c.titulo,
    '',
    ...c.paragrafos,
    ...(c.botao ? ['', `${c.botao.texto}: ${c.botao.url}`] : []),
    ...(c.nota ? ['', c.nota] : []),
    '',
    c.despedida ?? 'Um abraço fraterno,',
    'Equipe da Missão Fraternal',
  ].join('\n');
  return { html, texto };
}

const primeiroNome = (nome: string) => nome.trim().split(/\s+/)[0] || 'olá';

export const emails = {
  convite(nome: string, link: string, validade: string, quemConvidou: string) {
    return {
      assunto: 'Seu acesso ao painel da Missão Fraternal',
      ...montarEmail({
        previa: 'Falta só um passo: crie a sua senha para entrar no painel de visitas.',
        titulo: `Que bom ter você com a gente, ${primeiroNome(nome)}!`,
        paragrafos: [
          `${quemConvidou} cadastrou você no painel de visitas da Missão Fraternal. É por lá que acompanhamos as famílias que serão visitadas nos dias 28 e 29 de novembro.`,
          'Para começar, falta só um passo: criar a sua senha. Leva menos de um minuto.',
        ],
        botao: { texto: 'Criar minha senha', url: link },
        nota: `Por segurança, este link vale por ${validade} e só pode ser usado uma vez. Se ele vencer, é só pedir um novo para quem cadastrou você.`,
      }),
    };
  },
  redefinicao(nome: string, link: string, validade: string) {
    return {
      assunto: 'Crie uma nova senha para o painel da Missão Fraternal',
      ...montarEmail({
        previa: 'Recebemos um pedido para criar uma nova senha. Toque no botão para continuar.',
        titulo: `Vamos criar uma nova senha, ${primeiroNome(nome)}?`,
        paragrafos: [
          'Recebemos um pedido para criar uma nova senha de acesso ao painel de visitas. Acontece com todo mundo, é rapidinho de resolver.',
          'Toque no botão abaixo e escolha a sua nova senha.',
        ],
        botao: { texto: 'Criar nova senha', url: link },
        nota: `Este link vale por ${validade} e só pode ser usado uma vez. Se não foi você quem pediu, pode ignorar este e-mail com tranquilidade: a sua senha atual continua valendo.`,
      }),
    };
  },
  senhaAlterada(nome: string) {
    return {
      assunto: 'Sua senha do painel foi alterada',
      ...montarEmail({
        previa: 'Confirmação: a senha do seu acesso ao painel de visitas foi alterada.',
        titulo: `Tudo certo, ${primeiroNome(nome)}!`,
        paragrafos: [
          'A senha do seu acesso ao painel de visitas da Missão Fraternal acabou de ser alterada. Da próxima vez, é só entrar com a senha nova.',
        ],
        nota: 'Se não foi você quem fez essa alteração, avise a coordenação o quanto antes para protegermos o seu acesso.',
      }),
    };
  },
  pedidoDeAcesso(superAdmin: string, pedido: { nome: string; email: string }, link: string) {
    return {
      assunto: `Novo pedido de acesso: ${pedido.nome}`,
      ...montarEmail({
        previa: `${pedido.nome} pediu acesso ao painel de visitas e aguarda a sua aprovação.`,
        titulo: `${primeiroNome(superAdmin)}, tem um pedido de acesso esperando por você`,
        paragrafos: [
          `${pedido.nome} (${pedido.email}) preencheu o cadastro para usar o painel de visitas da Missão Fraternal como admin.`,
          'O acesso só é liberado depois da sua aprovação. Toque no botão abaixo para aprovar ou recusar o pedido.',
        ],
        botao: { texto: 'Ver pedido de acesso', url: link },
        nota: 'Se você não conhece essa pessoa, é só recusar o pedido: nenhum acesso é criado.',
      }),
    };
  },
  acessoAprovado(nome: string, link: string) {
    return {
      assunto: 'Seu acesso ao painel da Missão Fraternal foi aprovado',
      ...montarEmail({
        previa: 'Boa notícia: seu acesso foi aprovado. Já pode entrar no painel.',
        titulo: `Boa notícia, ${primeiroNome(nome)}: seu acesso foi aprovado!`,
        paragrafos: [
          'A coordenação aprovou o seu cadastro no painel de visitas da Missão Fraternal. Que bom ter você com a gente!',
          'Para entrar, use o seu e-mail e a senha que você criou no cadastro.',
        ],
        botao: { texto: 'Entrar no painel', url: link },
        nota: 'Esqueceu a senha? Na tela de entrada, toque em "Esqueci minha senha" e enviamos um link para criar outra.',
      }),
    };
  },
  acessoRecusado(nome: string) {
    return {
      assunto: 'Sobre o seu pedido de acesso ao painel da Missão Fraternal',
      ...montarEmail({
        previa: 'Seu pedido de acesso não foi aprovado desta vez.',
        titulo: `Olá, ${primeiroNome(nome)}`,
        paragrafos: [
          'Agradecemos o seu interesse em ajudar. Desta vez, o seu pedido de acesso ao painel de visitas não foi aprovado.',
          'Se você acha que houve algum engano, fale com a coordenação da Missão Fraternal: será um prazer ajudar.',
        ],
      }),
    };
  },
  teste(nome: string) {
    return {
      assunto: 'Teste de envio de e-mail da Missão Fraternal',
      ...montarEmail({
        previa: 'Se você está lendo isto, o envio de e-mails está funcionando.',
        titulo: `Funcionou, ${primeiroNome(nome)}!`,
        paragrafos: [
          'Este é um e-mail de teste do painel de visitas. Se ele chegou até você, o envio de e-mails está configurado direitinho.',
          'A partir de agora, os convites e os links para criar senha chegam por aqui.',
        ],
      }),
    };
  },
};
