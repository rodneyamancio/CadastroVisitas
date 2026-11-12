import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

export function hashSenha(senha: string): string {
  const sal = randomBytes(16);
  const hash = scryptSync(senha, sal, 64);
  return `scrypt$${sal.toString('hex')}$${hash.toString('hex')}`;
}

export function conferirSenha(senha: string, guardado: string): boolean {
  const [tipo, salHex, hashHex] = guardado.split('$');
  if (tipo !== 'scrypt' || !salHex || !hashHex) return false;
  const esperado = Buffer.from(hashHex, 'hex');
  const obtido = scryptSync(senha, Buffer.from(salHex, 'hex'), esperado.length);
  return timingSafeEqual(esperado, obtido);
}
