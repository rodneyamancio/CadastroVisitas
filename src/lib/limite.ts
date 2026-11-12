// Limitador simples em memória (por processo): protege o formulário público e o login.
const janelas = new Map<string, number[]>();

export function dentroDoLimite(chave: string, maximo: number, janelaMs: number): boolean {
  const agora = Date.now();
  const recentes = (janelas.get(chave) ?? []).filter((t) => agora - t < janelaMs);
  if (recentes.length >= maximo) {
    janelas.set(chave, recentes);
    return false;
  }
  recentes.push(agora);
  janelas.set(chave, recentes);
  if (janelas.size > 5000) {
    for (const [k, v] of janelas) if (v.every((t) => agora - t >= janelaMs)) janelas.delete(k);
  }
  return true;
}
