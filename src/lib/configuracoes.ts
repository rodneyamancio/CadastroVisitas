import { cifrar, decifrar } from './cripto';
import { sql } from './db';
import { MODELOS_ANTHROPIC, MODELO_ANTHROPIC_PADRAO, PROVEDORES, type Provedor } from './ia-opcoes';

export { MODELOS_ANTHROPIC, MODELO_ANTHROPIC_PADRAO, PROVEDORES, type Provedor };

async function ler(): Promise<Record<string, string>> {
  const linhas = await sql<{ chave: string; valor: string }>('SELECT chave, valor FROM configuracoes');
  return Object.fromEntries(linhas.map((l) => [l.chave, l.valor]));
}

export async function gravar(chave: string, valor: string | null): Promise<void> {
  if (valor === null) await sql('DELETE FROM configuracoes WHERE chave = $1', [chave]);
  else {
    await sql(
      'INSERT INTO configuracoes (chave, valor) VALUES ($1, $2) ON CONFLICT (chave) DO UPDATE SET valor = EXCLUDED.valor',
      [chave, valor],
    );
  }
}

export const gravarChaveApi = (provedor: Provedor, chave: string | null) =>
  gravar(`ia_chave_${provedor}`, chave === null ? null : cifrar(chave));

export type ConfigIA = {
  provedor: Provedor;
  modelos: Record<Provedor, string>;
  chaves: Record<Provedor, string | null>;
};

export async function configuracaoIA(): Promise<ConfigIA> {
  const c = await ler();
  const chave = (p: Provedor) => (c[`ia_chave_${p}`] ? decifrar(c[`ia_chave_${p}`]) : null);
  return {
    provedor: c.ia_provedor === 'openai' ? 'openai' : 'anthropic',
    modelos: {
      anthropic: MODELOS_ANTHROPIC.some((m) => m.id === c.ia_modelo_anthropic) ? c.ia_modelo_anthropic : MODELO_ANTHROPIC_PADRAO,
      openai: c.ia_modelo_openai ?? '',
    },
    chaves: { anthropic: chave('anthropic'), openai: chave('openai') },
  };
}

// O que o assistente precisa para funcionar: provedor escolhido, com chave e modelo.
export async function iaPronta(): Promise<{ provedor: Provedor; modelo: string; chave: string } | null> {
  const c = await configuracaoIA();
  const chave = c.chaves[c.provedor];
  const modelo = c.modelos[c.provedor];
  return chave && modelo ? { provedor: c.provedor, modelo, chave } : null;
}
