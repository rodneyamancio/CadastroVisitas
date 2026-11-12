import { Pool, types } from 'pg';
import { hashSenha } from './senha';

// DATE volta como texto 'AAAA-MM-DD' (evita deslocamento de fuso horário)
types.setTypeParser(1082, (v) => v);

const g = globalThis as unknown as { _pool?: Pool; _pronto?: Promise<void> };

function pool(): Pool {
  // Conexão configurada pelas variáveis PGHOST, PGUSER, PGPASSWORD, PGDATABASE
  if (!g._pool) g._pool = new Pool({ max: 10 });
  return g._pool;
}

const ESQUEMA = `
CREATE TABLE IF NOT EXISTS usuarios (
  id SERIAL PRIMARY KEY,
  nome TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE,
  senha_hash TEXT NOT NULL,
  perfil TEXT NOT NULL CHECK (perfil IN ('super_admin', 'admin')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS visitas (
  id SERIAL PRIMARY KEY,
  responsavel TEXT NOT NULL,
  telefone TEXT NOT NULL,
  endereco TEXT NOT NULL,
  numero TEXT NOT NULL,
  complemento TEXT,
  bairro TEXT,
  cidade TEXT,
  uf TEXT,
  cep TEXT,
  observacoes TEXT,
  data_visita DATE NOT NULL,
  periodo TEXT NOT NULL CHECK (periodo IN ('manha', 'tarde')),
  lat DOUBLE PRECISION,
  lng DOUBLE PRECISION,
  precisao TEXT,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS visitas_data_periodo ON visitas (data_visita, periodo);

-- Dados de quem preencheu o cadastro (visíveis só para o super admin)
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS ip TEXT;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS agente TEXT;
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS extra JSONB;

-- Navegação do site público (acessos, toques, campos preenchidos, envios)
CREATE TABLE IF NOT EXISTS eventos (
  id BIGSERIAL PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  visitante TEXT NOT NULL,
  sessao TEXT NOT NULL,
  tipo TEXT NOT NULL,
  chave TEXT,
  fx REAL,
  fy REAL,
  dispositivo TEXT,
  dados JSONB
);
CREATE INDEX IF NOT EXISTS eventos_tipo_data ON eventos (tipo, criado_em);

CREATE TABLE IF NOT EXISTS configuracoes (
  chave TEXT PRIMARY KEY,
  valor TEXT NOT NULL
);

-- Senhas: convite pendente e versão (muda a cada troca de senha e encerra as sessões antigas)
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS senha_pendente BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS versao INT NOT NULL DEFAULT 1;
-- Autocadastro: fica sem acesso até um super admin aprovar
ALTER TABLE usuarios ADD COLUMN IF NOT EXISTS aguardando_aprovacao BOOLEAN NOT NULL DEFAULT FALSE;

-- Links de definição de senha enviados por e-mail (guardamos só o resumo do código)
CREATE TABLE IF NOT EXISTS tokens_senha (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  hash TEXT NOT NULL UNIQUE,
  tipo TEXT NOT NULL CHECK (tipo IN ('convite', 'redefinicao')),
  expira_em TIMESTAMPTZ NOT NULL,
  usado_em TIMESTAMPTZ,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Auditoria: quem fez o quê, quando e de onde
CREATE TABLE IF NOT EXISTS auditoria (
  id BIGSERIAL PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id INT,
  usuario TEXT,
  acao TEXT NOT NULL,
  alvo TEXT,
  detalhes JSONB,
  ip TEXT,
  agente TEXT
);
CREATE INDEX IF NOT EXISTS auditoria_data ON auditoria (criado_em DESC);
CREATE INDEX IF NOT EXISTS auditoria_acao ON auditoria (acao);

-- Bairro: valor original quando o sistema troca pelo bairro dos Correios
ALTER TABLE visitas ADD COLUMN IF NOT EXISTS bairro_informado TEXT;

-- Tokens de acesso ao servidor MCP (guardamos só o resumo). "visto_*" marca até onde
-- o dono do token já viu as novidades.
CREATE TABLE IF NOT EXISTS tokens_mcp (
  id SERIAL PRIMARY KEY,
  usuario_id INT NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  hash TEXT NOT NULL UNIQUE,
  final TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso TIMESTAMPTZ,
  visto_visita INT NOT NULL DEFAULT 0,
  visto_usuario INT NOT NULL DEFAULT 0
);

-- Roteiros montados pelo assistente de IA
CREATE TABLE IF NOT EXISTS roteiros (
  id SERIAL PRIMARY KEY,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  criado_por TEXT,
  provedor TEXT NOT NULL,
  modelo TEXT NOT NULL,
  parametros JSONB NOT NULL,
  plano JSONB NOT NULL
);
`;

const espera = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function preparar(): Promise<void> {
  const p = pool();
  for (let tentativa = 0; ; tentativa++) {
    try {
      await p.query('SELECT 1');
      break;
    } catch (e) {
      if (tentativa >= 15) throw e;
      await espera(2000);
    }
  }
  await p.query(ESQUEMA);

  const { rows } = await p.query("SELECT count(*)::int AS n FROM usuarios WHERE perfil = 'super_admin'");
  const email = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const senha = process.env.SUPERADMIN_PASSWORD;
  if (rows[0].n === 0 && email && senha) {
    await p.query(
      `INSERT INTO usuarios (nome, email, senha_hash, perfil) VALUES ($1, $2, $3, 'super_admin')
       ON CONFLICT (email) DO UPDATE SET perfil = 'super_admin', ativo = TRUE, senha_hash = EXCLUDED.senha_hash`,
      [process.env.SUPERADMIN_NAME?.trim() || 'Administrador', email, hashSenha(senha)],
    );
  }
}

export async function sql<T = Record<string, unknown>>(texto: string, params: unknown[] = []): Promise<T[]> {
  if (!g._pronto) {
    g._pronto = preparar().catch((e) => {
      g._pronto = undefined;
      throw e;
    });
  }
  await g._pronto;
  const r = await pool().query(texto, params);
  return r.rows as T[];
}
