import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

// As chaves de API ficam cifradas no banco (AES-256-GCM) com um segredo derivado do SESSION_SECRET.
function segredo(): Buffer {
  const s = process.env.SESSION_SECRET;
  if (!s) throw new Error('SESSION_SECRET ausente');
  return createHash('sha256').update(`configuracoes:${s}`).digest();
}

export function cifrar(texto: string): string {
  const iv = randomBytes(12);
  const c = createCipheriv('aes-256-gcm', segredo(), iv);
  const dados = Buffer.concat([c.update(texto, 'utf8'), c.final()]);
  return [iv, c.getAuthTag(), dados].map((b) => b.toString('base64')).join('.');
}

export function decifrar(valor: string): string | null {
  try {
    const [iv, selo, dados] = valor.split('.').map((p) => Buffer.from(p, 'base64'));
    const d = createDecipheriv('aes-256-gcm', segredo(), iv);
    d.setAuthTag(selo);
    return Buffer.concat([d.update(dados), d.final()]).toString('utf8');
  } catch {
    return null;
  }
}
