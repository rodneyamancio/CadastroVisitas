// Resumo legível do aparelho a partir do "user agent" do navegador.
export function tipoDeAparelho(agente: string): 'celular' | 'tablet' | 'computador' {
  if (/iPad|Tablet|PlayBook|Silk/i.test(agente) || (/Android/i.test(agente) && !/Mobile/i.test(agente))) return 'tablet';
  if (/Mobi|Android|iPhone|iPod|Windows Phone/i.test(agente)) return 'celular';
  return 'computador';
}

export function resumoDoAparelho(agente: string): string {
  if (!agente) return 'Não informado';
  const tipo = { celular: 'Celular', tablet: 'Tablet', computador: 'Computador' }[tipoDeAparelho(agente)];
  const sistema = /Android/i.test(agente)
    ? 'Android'
    : /iPhone|iPad|iPod/i.test(agente)
      ? 'iOS'
      : /Windows/i.test(agente)
        ? 'Windows'
        : /Mac OS X|Macintosh/i.test(agente)
          ? 'macOS'
          : /Linux/i.test(agente)
            ? 'Linux'
            : '';
  const navegador = /SamsungBrowser/i.test(agente)
    ? 'Samsung Internet'
    : /Edg\//i.test(agente)
      ? 'Edge'
      : /OPR\/|Opera/i.test(agente)
        ? 'Opera'
        : /Firefox|FxiOS/i.test(agente)
          ? 'Firefox'
          : /Chrome|CriOS/i.test(agente)
            ? 'Chrome'
            : /Safari/i.test(agente)
              ? 'Safari'
              : '';
  return [tipo, sistema, navegador].filter(Boolean).join(' · ');
}

export const ehRobo = (agente: string) => /bot|crawl|spider|slurp|preview|headless|monitor|curl|wget|python-requests/i.test(agente);
