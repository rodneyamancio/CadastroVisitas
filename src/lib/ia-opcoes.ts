// Opções de IA que também são usadas nas telas (sem acesso a banco ou a segredos).
export type Provedor = 'anthropic' | 'openai';

export const PROVEDORES: { id: Provedor; nome: string }[] = [
  { id: 'anthropic', nome: 'Anthropic (Claude)' },
  { id: 'openai', nome: 'OpenAI (GPT)' },
];

export const MODELOS_ANTHROPIC = [
  { id: 'claude-opus-5-5', nome: 'Claude Opus 5.5 (recomendado)' },
  { id: 'claude-fable-5-2', nome: 'Claude Fable 5.2 (mais capaz e mais caro)' },
  { id: 'claude-sonnet-5-5', nome: 'Claude Sonnet 5.5 (mais rápido)' },
  { id: 'claude-haiku-5-5', nome: 'Claude Haiku 5.5 (mais barato)' },
];
export const MODELO_ANTHROPIC_PADRAO = MODELOS_ANTHROPIC[0].id;
