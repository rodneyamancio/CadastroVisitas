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
