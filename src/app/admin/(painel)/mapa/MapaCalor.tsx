'use client';

import 'leaflet/dist/leaflet.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type * as Leaflet from 'leaflet';
import { DIAS, PERIODOS, PRECISOES, nomeDia, nomePeriodo } from '@/lib/config';

export type Ponto = {
  id: number;
  lat: number | null;
  lng: number | null;
  nome: string;
  endereco: string;
  bairro: string;
  dia: string;
  periodo: string;
  precisao: string | null;
};

type Camada = { setLatLngs(p: [number, number, number][]): unknown; setOptions(o: Record<string, unknown>): unknown };
type Estado = { L: typeof Leaflet; mapa: Leaflet.Map; calor: Camada; marcadores: Leaflet.LayerGroup };

// Cada família "aquece" um círculo ao redor da casa: 160 m de perto e, na visão geral,
// um raio maior para os bairros aparecerem como manchas.
const RAIO_METROS = 160;
const RAIO_MIN_PX = 18;
const RAIO_MAX_PX = 80;

function distanciaM(a: Ponto, b: Ponto): number {
  const rad = Math.PI / 180;
  const x = (b.lng! - a.lng!) * rad * Math.cos(((a.lat! + b.lat!) / 2) * rad);
  const y = (b.lat! - a.lat!) * rad;
  return Math.sqrt(x * x + y * y) * 6_371_000;
}

export default function MapaCalor({ pontos, centro }: { pontos: Ponto[]; centro: { lat: number; lng: number } }) {
  const caixa = useRef<HTMLDivElement>(null);
  const estado = useRef<Estado | null>(null);
  const [pronto, setPronto] = useState(false);
  const [dia, setDia] = useState('');
  const [periodo, setPeriodo] = useState('');
  const [verPontos, setVerPontos] = useState(true);
  const [escala, setEscala] = useState({ pico: 1, metros: RAIO_METROS });

  const filtrados = useMemo(() => pontos.filter((p) => (!dia || p.dia === dia) && (!periodo || p.periodo === periodo)), [pontos, dia, periodo]);
  const noMapa = useMemo(() => filtrados.filter((p) => p.lat != null && p.lng != null), [filtrados]);

  const bairros = useMemo(() => {
    const total = new Map<string, number>();
    for (const p of filtrados) total.set(p.bairro, (total.get(p.bairro) ?? 0) + 1);
    return [...total.entries()].sort((a, b) => b[1] - a[1]);
  }, [filtrados]);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const L = await import('leaflet');
      const { HeatLayer } = await import('leaflet.heat');
      if (cancelado || !caixa.current) return;
      const mapa = L.map(caixa.current, { zoomControl: true }).setView([centro.lat, centro.lng], 14);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      }).addTo(mapa);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const calor = new (HeatLayer as any)([], { minOpacity: 0.4, maxZoom: 1 }).addTo(mapa) as Camada;
      const marcadores = L.layerGroup().addTo(mapa);
      estado.current = { L, mapa, calor, marcadores };
      setPronto(true);
    })();
    return () => {
      cancelado = true;
      estado.current?.mapa.remove();
      estado.current = null;
    };
  }, [centro.lat, centro.lng]);

  // Redesenha o calor e os pontos quando os filtros mudam
  useEffect(() => {
    const e = estado.current;
    if (!pronto || !e) return;
    const { L, mapa, calor, marcadores } = e;

    // A cada zoom: raio em pixels e a maior concentração (quantas famílias cabem no raio
    // ao redor da casa mais "cercada"). É essa concentração que vira vermelho.
    const ajustarRaio = () => {
      const metrosPorPixel = (156543.03392 * Math.cos((mapa.getCenter().lat * Math.PI) / 180)) / 2 ** mapa.getZoom();
      const raio = Math.max(RAIO_MIN_PX, Math.min(RAIO_MAX_PX, RAIO_METROS / metrosPorPixel));
      const metros = raio * metrosPorPixel;
      let pico = 1;
      for (const a of noMapa) {
        let n = 0;
        for (const b of noMapa) if (distanciaM(a, b) <= metros) n++;
        if (n > pico) pico = n;
      }
      calor.setOptions({ radius: raio, blur: raio * 0.8, max: Math.max(1.5, pico * 0.6) });
      setEscala({ pico, metros: Math.round(metros / 10) * 10 });
    };
    ajustarRaio();
    calor.setLatLngs(noMapa.map((p) => [p.lat!, p.lng!, 1]));
    mapa.on('zoomend', ajustarRaio);

    marcadores.clearLayers();
    if (verPontos) {
      for (const p of noMapa) {
        const balao = document.createElement('div');
        const nome = document.createElement('strong');
        nome.textContent = p.nome;
        const endereco = document.createElement('div');
        endereco.textContent = p.endereco;
        const visita = document.createElement('div');
        visita.textContent = `${nomeDia(p.dia)} · ${nomePeriodo(p.periodo)}`;
        const precisao = document.createElement('div');
        precisao.style.color = '#78716c';
        precisao.textContent = `Posição: ${p.precisao ? PRECISOES[p.precisao] : 'aproximada'}`;
        balao.append(nome, endereco, visita, precisao);
        L.circleMarker([p.lat!, p.lng!], { radius: 6, color: '#ffffff', weight: 2, fillColor: '#065f46', fillOpacity: 0.95 })
          .bindPopup(balao)
          .addTo(marcadores);
      }
    }
    return () => {
      mapa.off('zoomend', ajustarRaio);
    };
  }, [pronto, noMapa, verPontos]);

  // Enquadra todas as casas ao abrir e ao trocar os filtros
  useEffect(() => {
    const e = estado.current;
    if (!pronto || !e || noMapa.length === 0) return;
    e.mapa.fitBounds(e.L.latLngBounds(noMapa.map((p) => [p.lat!, p.lng!] as [number, number])).pad(0.15), { maxZoom: 16 });
  }, [pronto, noMapa]);

  const botao = (ativo: boolean) =>
    `rounded-lg border px-3 py-2 text-sm font-semibold ${ativo ? 'border-emerald-700 bg-emerald-700 text-white' : 'border-stone-300 bg-white text-stone-800 hover:bg-stone-50'}`;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_18rem]">
      <div className="space-y-3">
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Dia">
            <button type="button" className={botao(dia === '')} aria-pressed={dia === ''} onClick={() => setDia('')}>
              Os dois dias
            </button>
            {DIAS.map((d) => (
              <button key={d.valor} type="button" className={botao(dia === d.valor)} aria-pressed={dia === d.valor} onClick={() => setDia(d.valor)}>
                {d.semana}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Horário">
            <button type="button" className={botao(periodo === '')} aria-pressed={periodo === ''} onClick={() => setPeriodo('')}>
              Manhã e tarde
            </button>
            {PERIODOS.map((p) => (
              <button key={p.valor} type="button" className={botao(periodo === p.valor)} aria-pressed={periodo === p.valor} onClick={() => setPeriodo(p.valor)}>
                {p.nome}
              </button>
            ))}
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-stone-800">
            <input type="checkbox" className="h-5 w-5 accent-emerald-700" checked={verPontos} onChange={(e) => setVerPontos(e.target.checked)} />
            Mostrar cada casa
          </label>
        </div>

        <div ref={caixa} className="isolate h-[60vh] min-h-96 w-full overflow-hidden rounded-xl border border-stone-300 bg-stone-200" aria-label="Mapa de calor das visitas" />

        <div className="flex flex-wrap items-center gap-3 text-sm text-stone-700">
          <span>Menos famílias</span>
          <span className="h-3 w-40 rounded-full" style={{ background: 'linear-gradient(to right, blue, cyan, lime, yellow, red)' }} aria-hidden="true" />
          <span>Mais famílias</span>
          <span className="text-stone-500">
            · vermelho = cerca de {escala.pico} {escala.pico === 1 ? 'família' : 'famílias'} em um raio de {escala.metros} m
          </span>
        </div>
      </div>

      <aside className="rounded-xl border border-stone-200 bg-white p-4">
        <h2 className="text-base font-extrabold text-stone-900">Famílias por bairro</h2>
        <p className="mb-3 text-sm text-stone-600">
          {filtrados.length} {filtrados.length === 1 ? 'família' : 'famílias'} · {noMapa.length} no mapa
        </p>
        {bairros.length === 0 ? (
          <p className="text-sm text-stone-500">Nenhum cadastro com estes filtros.</p>
        ) : (
          <ol className="space-y-2">
            {bairros.map(([nome, n]) => (
              <li key={nome}>
                <div className="flex justify-between gap-2 text-sm">
                  <span className="text-stone-800">{nome}</span>
                  <span className="font-bold text-stone-900">{n}</span>
                </div>
                <div className="mt-1 h-2 rounded-full bg-stone-100">
                  <div className="h-2 rounded-full bg-emerald-600" style={{ width: `${(n / bairros[0][1]) * 100}%` }} />
                </div>
              </li>
            ))}
          </ol>
        )}
      </aside>
    </div>
  );
}
