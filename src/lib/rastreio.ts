'use client';

// Registro anônimo da navegação do formulário (sem nome, telefone ou endereço):
// acessos, onde as pessoas tocam, até que campo chegam e se enviam o cadastro.
type Evento = { tipo: string; chave?: string; fx?: number; fy?: number; dados?: Record<string, unknown> };

let fila: Evento[] = [];
let temporizador: ReturnType<typeof setTimeout> | null = null;
let ligado = false;

function identificador(armazem: 'localStorage' | 'sessionStorage', nome: string): string {
  try {
    const guardado = window[armazem].getItem(nome);
    if (guardado) return guardado;
    const novo = crypto.randomUUID();
    window[armazem].setItem(nome, novo);
    return novo;
  } catch {
    return 'sem-armazenamento';
  }
}

export const idVisitante = () => identificador('localStorage', 'cadastro-visitante');
const idSessao = () => identificador('sessionStorage', 'cadastro-sessao');

function enviar() {
  temporizador = null;
  if (!fila.length) return;
  const corpo = JSON.stringify({ visitante: idVisitante(), sessao: idSessao(), eventos: fila });
  fila = [];
  try {
    if (!navigator.sendBeacon?.('/api/eventos', new Blob([corpo], { type: 'application/json' }))) {
      void fetch('/api/eventos', { method: 'POST', body: corpo, headers: { 'Content-Type': 'application/json' }, keepalive: true });
    }
  } catch {}
}

export function rastrear(evento: Evento) {
  if (!ligado) return;
  fila.push(evento);
  if (fila.length >= 20) enviar();
  else temporizador ??= setTimeout(enviar, 3000);
}

// Liga o registro e passa a anotar os toques na página. Devolve a função que desliga.
export function iniciarRastreio(): () => void {
  ligado = true;
  rastrear({ tipo: 'acesso', dados: { tela: `${window.innerWidth}x${window.innerHeight}`, origem: document.referrer ? new URL(document.referrer).hostname : '' } });

  const aoClicar = (ev: MouseEvent) => {
    const alvo = ev.target instanceof Element ? ev.target.closest('[data-mapa]') : null;
    if (alvo) {
      const r = alvo.getBoundingClientRect();
      if (!r.width || !r.height) return;
      rastrear({
        tipo: 'clique',
        chave: alvo.getAttribute('data-mapa') ?? '',
        fx: Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)),
        fy: Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height)),
      });
    } else {
      const d = document.documentElement;
      rastrear({ tipo: 'clique', chave: 'pagina', fx: ev.pageX / d.scrollWidth, fy: ev.pageY / d.scrollHeight });
    }
  };
  const aoSair = () => {
    if (document.visibilityState === 'hidden') enviar();
  };
  document.addEventListener('click', aoClicar, true);
  document.addEventListener('visibilitychange', aoSair);
  window.addEventListener('pagehide', enviar);
  return () => {
    enviar();
    ligado = false;
    document.removeEventListener('click', aoClicar, true);
    document.removeEventListener('visibilitychange', aoSair);
    window.removeEventListener('pagehide', enviar);
  };
}
