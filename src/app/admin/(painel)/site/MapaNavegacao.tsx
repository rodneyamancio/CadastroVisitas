'use client';

import SimpleHeat from 'simpleheat';
import { useCallback, useEffect, useRef, useState } from 'react';

type Clique = { chave: string; fx: number; fy: number };

// O formulário é desenhado na largura de um celular comum e os toques são colocados
// em cima do elemento em que aconteceram (campo, botão, bloco), em qualquer tamanho de tela.
const LARGURA = 390;

export default function MapaNavegacao({ cliques }: { cliques: Clique[] }) {
  const quadro = useRef<HTMLIFrameElement>(null);
  const tela = useRef<HTMLCanvasElement>(null);
  const [altura, setAltura] = useState(1600);
  const [pronto, setPronto] = useState(false);

  const desenhar = useCallback(() => {
    const doc = quadro.current?.contentDocument;
    const canvas = tela.current;
    if (!doc?.body || !canvas) return;
    const total = Math.ceil(doc.body.scrollHeight);
    setAltura(total);
    canvas.width = LARGURA;
    canvas.height = total;

    const caixas = new Map<string, DOMRect | null>();
    const pontos: [number, number, number][] = [];
    for (const c of cliques) {
      if (c.chave === 'pagina') {
        pontos.push([c.fx * LARGURA, c.fy * total, 1]);
        continue;
      }
      if (!caixas.has(c.chave)) {
        caixas.set(c.chave, doc.querySelector(`[data-mapa="${CSS.escape(c.chave)}"]`)?.getBoundingClientRect() ?? null);
      }
      const r = caixas.get(c.chave);
      if (r) pontos.push([r.left + c.fx * r.width, r.top + c.fy * r.height, 1]);
    }

    // O vermelho corresponde ao ponto mais tocado da página
    const celulas = new Map<string, number>();
    let pico = 1;
    for (const [x, y] of pontos) {
      const k = `${Math.round(x / 24)}|${Math.round(y / 24)}`;
      const n = (celulas.get(k) ?? 0) + 1;
      celulas.set(k, n);
      if (n > pico) pico = n;
    }
    new SimpleHeat(canvas).data(pontos).radius(16, 14).max(Math.max(2, pico * 0.7)).draw(0.1);
    setPronto(true);
  }, [cliques]);

  useEffect(() => {
    if (pronto) desenhar();
  }, [desenhar, pronto]);

  return (
    <div className="overflow-x-auto">
      <div className="relative mx-auto overflow-hidden rounded-xl border border-stone-300 bg-stone-100" style={{ width: LARGURA, height: altura }}>
        <iframe
          ref={quadro}
          src="/?mapa"
          title="Formulário de cadastro (fundo do mapa de toques)"
          width={LARGURA}
          height={altura}
          scrolling="no"
          tabIndex={-1}
          aria-hidden="true"
          className="pointer-events-none block border-0"
          onLoad={() => setTimeout(desenhar, 400)}
        />
        <canvas ref={tela} className="pointer-events-none absolute top-0 left-0" style={{ width: LARGURA, height: altura }} aria-hidden="true" />
      </div>
    </div>
  );
}
