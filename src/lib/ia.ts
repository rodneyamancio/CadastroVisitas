import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import type { Provedor } from './configuracoes';

// Erro com mensagem pronta para mostrar na tela do painel.
export class ErroIA extends Error {}

const OPENAI = (process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1').replace(/\/$/, '');

function erroAnthropic(e: unknown): ErroIA {
  if (e instanceof ErroIA) return e;
  if (e instanceof Anthropic.AuthenticationError) return new ErroIA('A Anthropic recusou a chave de API. Confira a chave nas Configurações.');
  if (e instanceof Anthropic.PermissionDeniedError) return new ErroIA('Esta chave da Anthropic não tem permissão para usar o modelo escolhido.');
  if (e instanceof Anthropic.NotFoundError) return new ErroIA('A Anthropic não encontrou o modelo escolhido. Escolha outro nas Configurações.');
  if (e instanceof Anthropic.RateLimitError) return new ErroIA('Limite de uso da Anthropic atingido. Aguarde um pouco e tente de novo.');
  if (e instanceof Anthropic.APIConnectionError) return new ErroIA('Não foi possível conectar à Anthropic. Confira a internet do servidor.');
  if (e instanceof Anthropic.APIError) return new ErroIA(`A Anthropic respondeu com erro ${e.status ?? ''}: ${e.message}`);
  return new ErroIA('Falha inesperada ao falar com a Anthropic.');
}

async function erroOpenAI(r: Response): Promise<ErroIA> {
  const corpo = (await r.json().catch(() => null)) as { error?: { message?: string } } | null;
  if (r.status === 401) return new ErroIA('A OpenAI recusou a chave de API. Confira a chave nas Configurações.');
  if (r.status === 404) return new ErroIA('A OpenAI não encontrou o modelo escolhido. Escolha outro nas Configurações.');
  if (r.status === 429) return new ErroIA('Limite de uso ou de créditos da OpenAI atingido. Confira a conta e tente de novo.');
  return new ErroIA(`A OpenAI respondeu com erro ${r.status}: ${corpo?.error?.message ?? 'sem detalhes'}`);
}

// Confere a chave pedindo a lista de modelos (não gasta créditos).
export async function testarConexao(provedor: Provedor, chave: string): Promise<string[]> {
  if (provedor === 'anthropic') {
    try {
      const pagina = await new Anthropic({ apiKey: chave }).models.list({ limit: 100 });
      return pagina.data.map((m) => m.id);
    } catch (e) {
      throw erroAnthropic(e);
    }
  }
  let r: Response;
  try {
    r = await fetch(`${OPENAI}/models`, { headers: { Authorization: `Bearer ${chave}` }, signal: AbortSignal.timeout(20_000), cache: 'no-store' });
  } catch {
    throw new ErroIA('Não foi possível conectar à OpenAI. Confira a internet do servidor.');
  }
  if (!r.ok) throw await erroOpenAI(r);
  const corpo = (await r.json()) as { data?: { id: string }[] };
  return (corpo.data ?? [])
    .map((m) => m.id)
    .filter((id) => /^(gpt|o\d|chatgpt)/.test(id) && !/audio|realtime|image|tts|transcribe|search|embedding|moderation/.test(id))
    .sort();
}

// Pede ao modelo uma resposta em JSON que obedece ao esquema dado.
export async function gerarJson<T>(
  cfg: { provedor: Provedor; modelo: string; chave: string },
  pedido: { sistema: string; usuario: string; esquema: z.ZodType<T>; nome: string },
): Promise<T> {
  let texto: string;

  if (cfg.provedor === 'anthropic') {
    try {
      const resposta = await new Anthropic({ apiKey: cfg.chave }).beta.messages
        .stream({
          model: cfg.modelo,
          max_tokens: 32000,
          // Se o modelo recusar o pedido por política, a própria API tenta de novo no modelo reserva.
          betas: ['server-side-fallback-2026-07-01'],
          fallbacks: 'default',
          output_config: { effort: 'medium', format: betaZodOutputFormat(pedido.esquema) },
          system: pedido.sistema,
          messages: [{ role: 'user', content: pedido.usuario }],
        })
        .finalMessage();
      if (resposta.stop_reason === 'refusal') throw new ErroIA('O modelo recusou este pedido. Tente de novo ou troque de modelo.');
      if (resposta.stop_reason === 'max_tokens') throw new ErroIA('A resposta ficou grande demais e foi cortada. Tente com menos visitas por vez.');
      texto = resposta.content.map((b) => (b.type === 'text' ? b.text : '')).join('');
    } catch (e) {
      throw erroAnthropic(e);
    }
  } else {
    const esquema = z.toJSONSchema(pedido.esquema) as Record<string, unknown>;
    delete esquema.$schema;
    let r: Response;
    try {
      r = await fetch(`${OPENAI}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cfg.chave}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: cfg.modelo,
          messages: [
            { role: 'system', content: pedido.sistema },
            { role: 'user', content: pedido.usuario },
          ],
          response_format: { type: 'json_schema', json_schema: { name: pedido.nome, strict: true, schema: esquema } },
        }),
        signal: AbortSignal.timeout(280_000),
        cache: 'no-store',
      });
    } catch {
      throw new ErroIA('A OpenAI demorou demais ou não respondeu. Tente de novo.');
    }
    if (!r.ok) throw await erroOpenAI(r);
    const corpo = (await r.json()) as { choices?: { finish_reason?: string; message?: { content?: string | null; refusal?: string | null } }[] };
    const escolha = corpo.choices?.[0];
    if (escolha?.message?.refusal) throw new ErroIA('O modelo recusou este pedido. Tente de novo ou troque de modelo.');
    if (escolha?.finish_reason === 'length') throw new ErroIA('A resposta ficou grande demais e foi cortada. Tente com menos visitas por vez.');
    texto = escolha?.message?.content ?? '';
  }

  try {
    return pedido.esquema.parse(JSON.parse(texto));
  } catch {
    throw new ErroIA('A resposta da IA veio em um formato inesperado. Tente de novo.');
  }
}
