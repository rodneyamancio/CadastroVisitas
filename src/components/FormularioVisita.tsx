'use client';

import { useEffect, useRef, useState } from 'react';
import { DIAS, PERIODOS } from '@/lib/config';
import { idVisitante, iniciarRastreio, rastrear } from '@/lib/rastreio';

type Sugestao = { rua: string; bairro: string; cidade: string; uf: string; cep: string; detalhe: string; lat: number; lng: number };
type Local = { lat: number; lng: number; fonte: 'gps' | 'sugestao'; precisaoM?: number; cidade: string; uf: string; cep: string };

type Campos = {
  nome: string;
  telefone: string;
  rua: string;
  numero: string;
  semNumero: boolean;
  complemento: string;
  bairro: string;
  obs: string;
  dia: string;
  periodo: string;
};

const VAZIO: Campos = {
  nome: '',
  telefone: '',
  rua: '',
  numero: '',
  semNumero: false,
  complemento: '',
  bairro: '',
  obs: '',
  dia: '',
  periodo: '',
};

type Chave = 'nome' | 'telefone' | 'rua' | 'numero' | 'dia' | 'periodo';
type Erros = Partial<Record<Chave, string>>;
const ORDEM: Chave[] = ['nome', 'telefone', 'rua', 'numero', 'dia', 'periodo'];
const RASCUNHO = 'cadastro-familia-rascunho';

function mascaraTelefone(valor: string): string {
  const d = valor.replace(/\D/g, '').slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : '';
  if (d.length <= 6) return `(${d.slice(0, 2)}) ${d.slice(2)}`;
  if (d.length <= 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
}

function validar(f: Campos): Erros {
  const e: Erros = {};
  if (f.nome.trim().length < 3) e.nome = 'Escreva o nome completo do responsável pela casa.';
  const digitos = f.telefone.replace(/\D/g, '');
  if (digitos.length < 10) e.telefone = 'Escreva o telefone com DDD. Exemplo: (11) 91234-5678.';
  if (f.rua.trim().length < 3) e.rua = 'Escreva o nome da rua ou avenida.';
  if (!f.semNumero && !f.numero.trim()) e.numero = 'Escreva o número da casa ou marque "A casa não tem número".';
  if (!f.dia) e.dia = 'Toque em um dos dias: sábado ou domingo.';
  if (!f.periodo) e.periodo = 'Toque em um dos horários: manhã ou tarde.';
  return e;
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: React.ReactNode }) {
  return (
    <section className="cartao" data-mapa={`passo-${n}`} aria-labelledby={`passo-${n}`}>
      <h2 id={`passo-${n}`} className="mb-5 flex items-center gap-3 text-2xl font-extrabold text-stone-900">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-emerald-700 text-xl text-white" aria-hidden="true">
          {n}
        </span>
        {titulo}
      </h2>
      <div className="space-y-6">{children}</div>
    </section>
  );
}

function Opcao(props: {
  grupo: string;
  valor: string;
  marcado: boolean;
  aoEscolher: () => void;
  titulo: string;
  detalhe: string;
  icone: React.ReactNode;
}) {
  return (
    <label
      data-mapa={`${props.grupo}-${props.valor}`}
      className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 p-3 text-center select-none has-focus-visible:ring-4 has-focus-visible:ring-emerald-200 ${
        props.marcado ? 'border-emerald-700 bg-emerald-700 text-white shadow-md' : 'border-stone-400 bg-white text-stone-900 active:bg-stone-100'
      }`}
    >
      <input type="radio" name={props.grupo} value={props.valor} checked={props.marcado} onChange={props.aoEscolher} className="sr-only" />
      <span aria-hidden="true">{props.icone}</span>
      <span className="text-xl font-extrabold">{props.titulo}</span>
      <span className={`text-lg ${props.marcado ? 'text-emerald-50' : 'text-stone-600'}`}>{props.detalhe}</span>
    </label>
  );
}

const iconeCalendario = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
);
const iconeManha = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
const iconeTarde = (
  <svg viewBox="0 0 24 24" className="h-8 w-8" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
    <path d="M7 17a5 5 0 0 1 10 0M12 6v3M4.9 9.9l2 2M19.1 9.9l-2 2M2 17h20M6 21h12" />
  </svg>
);

export default function FormularioVisita() {
  const [f, setF] = useState<Campos>(VAZIO);
  const [local, setLocal] = useState<Local | null>(null);
  const [erros, setErros] = useState<Erros>({});
  const [busca, setBusca] = useState('');
  const [sugestoes, setSugestoes] = useState<Sugestao[] | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [gps, setGps] = useState<{ estado: 'parado' | 'buscando' | 'erro'; aviso?: string }>({ estado: 'parado' });
  const [enviando, setEnviando] = useState(false);
  const [falha, setFalha] = useState('');
  const [enviado, setEnviado] = useState<Campos | null>(null);
  const [site, setSite] = useState('');
  const carregou = useRef(false);
  const camposVistos = useRef(new Set<string>());
  const inicio = useRef<number | null>(null);

  // Navegação anônima do site (acessos, toques, campos). Com "?mapa" a página é só a
  // imagem de fundo do mapa de calor do painel: não registra nada nem usa rascunho.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('mapa')) return;
    return iniciarRastreio();
  }, []);

  function marcarCampo(chave: string) {
    const campo = chave.startsWith('dia-') ? 'dia' : chave.startsWith('periodo-') ? 'periodo' : chave === 'sem-numero' ? 'numero' : chave;
    if (campo.startsWith('passo-') || camposVistos.current.has(campo)) return;
    camposVistos.current.add(campo);
    inicio.current ??= Date.now();
    rastrear({ tipo: 'campo', chave: campo });
  }

  // Rascunho: se a página fechar sem querer, o que já foi escrito não se perde.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).has('mapa')) return;
    try {
      const salvo = localStorage.getItem(RASCUNHO);
      if (salvo) {
        const d = JSON.parse(salvo) as { f?: Partial<Campos>; local?: Local | null };
        if (d.f) setF({ ...VAZIO, ...d.f });
        if (d.local) setLocal(d.local);
      }
    } catch {}
    carregou.current = true;
  }, []);

  useEffect(() => {
    if (!carregou.current) return;
    try {
      localStorage.setItem(RASCUNHO, JSON.stringify({ f, local }));
    } catch {}
  }, [f, local]);

  // Sugestões de rua enquanto a pessoa digita
  useEffect(() => {
    const termo = busca.trim();
    if (termo.length < 3) {
      setSugestoes(null);
      setBuscando(false);
      return;
    }
    const cancelar = new AbortController();
    setBuscando(true);
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/endereco/buscar?q=${encodeURIComponent(termo)}`, { signal: cancelar.signal });
        const d = (await r.json()) as { itens?: Sugestao[] };
        setSugestoes(d.itens ?? []);
      } catch {
        if (!cancelar.signal.aborted) setSugestoes(null);
      } finally {
        if (!cancelar.signal.aborted) setBuscando(false);
      }
    }, 400);
    return () => {
      clearTimeout(t);
      cancelar.abort();
    };
  }, [busca]);

  function mudar<K extends keyof Campos>(campo: K, valor: Campos[K]) {
    setF((a) => ({ ...a, [campo]: valor }));
    if (campo === 'dia' || campo === 'periodo') marcarCampo(campo);
    if (campo in erros) setErros((e) => ({ ...e, [campo]: undefined }));
    setFalha('');
  }

  function digitarRua(valor: string) {
    mudar('rua', valor);
    setBusca(valor);
    if (local?.fonte === 'sugestao') setLocal(null);
  }

  function escolherSugestao(s: Sugestao) {
    setF((a) => ({ ...a, rua: s.rua, bairro: s.bairro || a.bairro }));
    setErros((e) => ({ ...e, rua: undefined }));
    if (local?.fonte !== 'gps') setLocal({ lat: s.lat, lng: s.lng, fonte: 'sugestao', cidade: s.cidade, uf: s.uf, cep: s.cep });
    setBusca('');
    setSugestoes(null);
    document.getElementById('campo-numero')?.focus();
  }

  function usarLocalizacao() {
    marcarCampo('gps');
    if (!('geolocation' in navigator)) {
      setGps({ estado: 'erro', aviso: 'Este celular não informou a localização. Escreva o nome da rua no campo abaixo.' });
      return;
    }
    setGps({ estado: 'buscando' });
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        let achado: Sugestao | null = null;
        let fora = false;
        try {
          const r = await fetch('/api/endereco/reverso', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ lat, lng }),
          });
          const d = (await r.json()) as { endereco?: Sugestao | null; fora?: boolean };
          achado = d.endereco ?? null;
          fora = Boolean(d.fora);
        } catch {}
        if (fora) {
          setGps({ estado: 'erro', aviso: 'A localização do celular está fora da região atendida. Escreva o nome da rua no campo abaixo.' });
          return;
        }
        setLocal({ lat, lng, fonte: 'gps', precisaoM: accuracy, cidade: achado?.cidade ?? '', uf: achado?.uf ?? '', cep: achado?.cep ?? '' });
        if (achado) {
          setF((a) => ({ ...a, rua: achado.rua, bairro: achado.bairro || a.bairro }));
          setErros((e) => ({ ...e, rua: undefined }));
        }
        setBusca('');
        setSugestoes(null);
        setGps({ estado: 'parado' });
      },
      (erro) => {
        setGps({
          estado: 'erro',
          aviso:
            erro.code === erro.PERMISSION_DENIED
              ? 'O celular não permitiu ver a localização. Sem problema: escreva o nome da rua no campo abaixo.'
              : 'Não conseguimos encontrar a localização agora. Escreva o nome da rua no campo abaixo.',
        });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
    );
  }

  function irParaErro(e: Erros) {
    const primeiro = ORDEM.find((k) => e[k]);
    if (!primeiro) return;
    const alvo = document.getElementById(`campo-${primeiro}`);
    alvo?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    if (alvo instanceof HTMLInputElement) alvo.focus({ preventScroll: true });
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault();
    if (enviando) return;
    const e = validar(f);
    setErros(e);
    if (Object.keys(e).length) {
      rastrear({ tipo: 'tentativa', dados: { erros: Object.keys(e) } });
      irParaErro(e);
      return;
    }
    setEnviando(true);
    setFalha('');
    try {
      const r = await fetch('/api/visitas', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...f,
          numero: f.semNumero ? 'S/N' : f.numero,
          lat: local?.lat ?? null,
          lng: local?.lng ?? null,
          fonte: local?.fonte ?? null,
          precisaoM: local?.precisaoM ?? null,
          cidade: local?.cidade ?? '',
          uf: local?.uf ?? '',
          cep: local?.cep ?? '',
          tela: `${window.innerWidth}x${window.innerHeight}`,
          fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
          visitante: idVisitante(),
          tempoS: inicio.current ? (Date.now() - inicio.current) / 1000 : null,
          site,
        }),
      });
      const d = (await r.json().catch(() => ({}))) as { ok?: boolean; erro?: string; erros?: Erros };
      if (r.ok && d.ok) {
        try {
          localStorage.removeItem(RASCUNHO);
        } catch {}
        rastrear({ tipo: 'cadastro' });
        camposVistos.current.clear();
        inicio.current = null;
        setEnviado(f);
        setF(VAZIO);
        setLocal(null);
        window.scrollTo({ top: 0 });
        return;
      }
      if (d.erros) {
        setErros(d.erros);
        irParaErro(d.erros);
      }
      setFalha(d.erro || 'Não foi possível enviar agora. Toque em "Enviar cadastro" de novo.');
    } catch {
      setFalha('Parece que o celular está sem internet. Seus dados continuam aqui: confira a conexão e toque em "Enviar cadastro" de novo.');
    } finally {
      setEnviando(false);
    }
  }

  // A tecla "Ir" do teclado passa para o próximo campo em vez de enviar o formulário pela metade.
  function aoTeclar(ev: React.KeyboardEvent<HTMLFormElement>) {
    if (ev.key !== 'Enter' || !(ev.target instanceof HTMLInputElement)) return;
    ev.preventDefault();
    const campos = Array.from(ev.currentTarget.querySelectorAll<HTMLElement>('input:not([type=hidden]):not([tabindex="-1"]), textarea'));
    const proximo = campos[campos.indexOf(ev.target) + 1];
    if (proximo) proximo.focus();
    else ev.target.blur();
  }

  if (enviado) {
    const dia = DIAS.find((d) => d.valor === enviado.dia);
    const periodo = PERIODOS.find((p) => p.valor === enviado.periodo);
    return (
      <section className="cartao text-center" role="status" aria-live="polite">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-100">
          <svg viewBox="0 0 24 24" className="h-12 w-12 text-emerald-700" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 12.5 4.5 4.5L19 7.5" />
          </svg>
        </div>
        <h2 className="mt-4 text-3xl font-extrabold text-stone-900">Cadastro enviado!</h2>
        <p className="mt-2 text-lg text-stone-700">Recebemos os dados da família. Não é preciso fazer mais nada.</p>
        <dl className="mt-6 space-y-3 rounded-xl bg-stone-100 p-4 text-left text-lg">
          <div>
            <dt className="text-base text-stone-600">Responsável</dt>
            <dd className="font-bold">{enviado.nome}</dd>
          </div>
          <div>
            <dt className="text-base text-stone-600">Endereço</dt>
            <dd className="font-bold">
              {enviado.rua}, {enviado.semNumero ? 'S/N' : enviado.numero}
              {enviado.complemento ? ` - ${enviado.complemento}` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-base text-stone-600">Visita</dt>
            <dd className="font-bold">
              {dia?.semana}, {dia?.data} · {periodo?.nome}
            </dd>
          </div>
        </dl>
        <button
          type="button"
          data-mapa="outra-familia"
          onClick={() => {
            setEnviado(null);
            window.scrollTo({ top: 0 });
          }}
          className="mt-6 w-full rounded-2xl bg-emerald-700 px-6 py-5 text-xl font-extrabold text-white shadow-md active:bg-emerald-800"
        >
          Cadastrar outra família
        </button>
      </section>
    );
  }

  const mostrarLista = busca.trim().length >= 3 && (buscando || sugestoes !== null);

  return (
    <form
      onSubmit={enviar}
      onKeyDown={aoTeclar}
      onFocus={(ev) => {
        const chave = ev.target.closest('[data-mapa]')?.getAttribute('data-mapa');
        if (chave) marcarCampo(chave);
      }}
      noValidate
      className="space-y-5"
    >
      <Passo n={1} titulo="Quem mora na casa">
        <div data-mapa="nome">
          <label htmlFor="campo-nome" className="rotulo">
            Nome completo do responsável pela casa
          </label>
          <input
            id="campo-nome"
            type="text"
            className={`campo ${erros.nome ? 'campo-erro' : ''}`}
            placeholder="Ex: Maria Aparecida da Silva"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={120}
            value={f.nome}
            onChange={(e) => mudar('nome', e.target.value)}
            aria-invalid={Boolean(erros.nome)}
            aria-describedby={erros.nome ? 'erro-nome' : undefined}
          />
          {erros.nome && (
            <p id="erro-nome" className="erro" role="alert">
              {erros.nome}
            </p>
          )}
        </div>

        <div data-mapa="telefone">
          <label htmlFor="campo-telefone" className="rotulo">
            Telefone de contato
          </label>
          <input
            id="campo-telefone"
            type="tel"
            inputMode="numeric"
            className={`campo ${erros.telefone ? 'campo-erro' : ''}`}
            placeholder="(11) 91234-5678"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            value={f.telefone}
            onChange={(e) => mudar('telefone', mascaraTelefone(e.target.value))}
            aria-invalid={Boolean(erros.telefone)}
            aria-describedby={erros.telefone ? 'erro-telefone' : 'ajuda-telefone'}
          />
          {erros.telefone ? (
            <p id="erro-telefone" className="erro" role="alert">
              {erros.telefone}
            </p>
          ) : (
            <p id="ajuda-telefone" className="ajuda">
              Com DDD. Só os números, o resto aparece sozinho.
            </p>
          )}
        </div>
      </Passo>

      <Passo n={2} titulo="Endereço da família">
        <div data-mapa="gps">
          <button
            type="button"
            onClick={usarLocalizacao}
            disabled={gps.estado === 'buscando'}
            className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-emerald-700 bg-emerald-50 px-4 py-4 text-lg font-bold text-emerald-900 active:bg-emerald-100 disabled:opacity-70"
          >
            <svg viewBox="0 0 24 24" className={`h-7 w-7 shrink-0 ${gps.estado === 'buscando' ? 'animate-spin' : ''}`} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <circle cx="12" cy="12" r="6" />
              <circle cx="12" cy="12" r="1.5" fill="currentColor" />
              <path d="M12 2v4M12 18v4M2 12h4M18 12h4" />
            </svg>
            {gps.estado === 'buscando' ? 'Procurando a localização…' : 'Estou na casa agora: usar minha localização'}
          </button>
          {gps.estado === 'erro' && (
            <p className="mt-2 rounded-xl bg-amber-50 p-3 text-base font-medium text-amber-900" role="status">
              {gps.aviso}
            </p>
          )}
          {local?.fonte === 'gps' && (
            <p className="mt-2 flex items-center justify-between gap-3 rounded-xl bg-emerald-50 p-3 text-base font-semibold text-emerald-900" role="status">
              <span>✓ Localização do celular guardada. Confira a rua e escreva o número.</span>
              <button type="button" onClick={() => setLocal(null)} className="shrink-0 rounded-lg px-2 py-1 font-bold underline">
                Remover
              </button>
            </p>
          )}
          <p className="mt-3 text-center text-base text-stone-500">ou escreva o endereço:</p>
        </div>

        <div data-mapa="rua">
          <label htmlFor="campo-rua" className="rotulo">
            Rua ou avenida
          </label>
          <input
            id="campo-rua"
            type="text"
            role="combobox"
            aria-expanded={mostrarLista}
            aria-controls="lista-ruas"
            aria-autocomplete="list"
            className={`campo ${erros.rua ? 'campo-erro' : ''}`}
            placeholder="Ex: Avenida Itaberaba"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={160}
            value={f.rua}
            onChange={(e) => digitarRua(e.target.value)}
            aria-invalid={Boolean(erros.rua)}
            aria-describedby={erros.rua ? 'erro-rua' : 'ajuda-rua'}
          />
          {erros.rua ? (
            <p id="erro-rua" className="erro" role="alert">
              {erros.rua}
            </p>
          ) : (
            !mostrarLista && (
              <p id="ajuda-rua" className="ajuda">
                Comece a escrever e toque na rua certa quando ela aparecer.
              </p>
            )
          )}

          {mostrarLista && (
            <div id="lista-ruas" role="listbox" aria-label="Ruas encontradas" className="mt-2 overflow-hidden rounded-xl border-2 border-stone-300 bg-white">
              {buscando && !sugestoes?.length && <p className="p-4 text-base text-stone-600">Procurando ruas…</p>}
              {sugestoes?.map((s) => (
                <button
                  key={`${s.rua}|${s.detalhe}`}
                  type="button"
                  role="option"
                  aria-selected={false}
                  onClick={() => escolherSugestao(s)}
                  className="block w-full border-b border-stone-200 px-4 py-3 text-left last:border-b-0 active:bg-emerald-50"
                >
                  <span className="block text-lg font-bold text-stone-900">{s.rua}</span>
                  <span className="block text-base text-stone-600">{s.detalhe}</span>
                </button>
              ))}
              {!buscando && sugestoes?.length === 0 && (
                <p className="p-4 text-base text-stone-700">
                  Não achamos essa rua na lista. Tudo bem: termine de escrever o nome dela e continue o cadastro.
                </p>
              )}
            </div>
          )}
        </div>

        <div data-mapa="numero">
          <label htmlFor="campo-numero" className="rotulo">
            Número da casa
          </label>
          <input
            id="campo-numero"
            type="text"
            inputMode="numeric"
            className={`campo max-w-44 ${erros.numero ? 'campo-erro' : ''} disabled:bg-stone-200 disabled:text-stone-500`}
            placeholder="Ex: 101"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={10}
            disabled={f.semNumero}
            value={f.semNumero ? '' : f.numero}
            onChange={(e) => mudar('numero', e.target.value)}
            aria-invalid={Boolean(erros.numero)}
            aria-describedby={erros.numero ? 'erro-numero' : undefined}
          />
          {erros.numero && (
            <p id="erro-numero" className="erro" role="alert">
              {erros.numero}
            </p>
          )}
          <label data-mapa="sem-numero" className="mt-3 flex cursor-pointer items-center gap-3 py-1 text-lg text-stone-800 select-none">
            <input
              type="checkbox"
              tabIndex={-1}
              className="h-7 w-7 shrink-0 accent-emerald-700"
              checked={f.semNumero}
              onChange={(e) => {
                mudar('semNumero', e.target.checked);
                setErros((x) => ({ ...x, numero: undefined }));
              }}
            />
            A casa não tem número
          </label>
        </div>

        <div data-mapa="complemento">
          <label htmlFor="campo-complemento" className="rotulo">
            Complemento <span className="opcional">(se tiver)</span>
          </label>
          <input
            id="campo-complemento"
            type="text"
            className="campo"
            placeholder="Ex: Apto 101, Bloco 2, casa dos fundos"
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="next"
            maxLength={120}
            value={f.complemento}
            onChange={(e) => mudar('complemento', e.target.value)}
          />
        </div>

        <div data-mapa="bairro">
          <label htmlFor="campo-bairro" className="rotulo">
            Bairro <span className="opcional">(se souber)</span>
          </label>
          <input
            id="campo-bairro"
            type="text"
            className="campo"
            placeholder="Ex: Freguesia do Ó"
            autoComplete="off"
            spellCheck={false}
            autoCapitalize="words"
            enterKeyHint="next"
            maxLength={80}
            value={f.bairro}
            onChange={(e) => mudar('bairro', e.target.value)}
          />
        </div>

        <div data-mapa="obs">
          <label htmlFor="campo-obs" className="rotulo">
            Como achar a casa <span className="opcional">(se quiser)</span>
          </label>
          <textarea
            id="campo-obs"
            className="campo min-h-28"
            placeholder="Ex: Casa azul, ao lado da padaria, portão verde"
            maxLength={500}
            value={f.obs}
            onChange={(e) => mudar('obs', e.target.value)}
          />
        </div>
      </Passo>

      <Passo n={3} titulo="Quando visitar">
        <fieldset id="campo-dia" className="scroll-mt-6">
          <legend className="rotulo">Dia da visita</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {DIAS.map((d) => (
              <Opcao key={d.valor} grupo="dia" valor={d.valor} marcado={f.dia === d.valor} aoEscolher={() => mudar('dia', d.valor)} titulo={d.semana} detalhe={`dia ${d.numero}`} icone={iconeCalendario} />
            ))}
          </div>
          {erros.dia && (
            <p className="erro" role="alert">
              {erros.dia}
            </p>
          )}
        </fieldset>

        <fieldset id="campo-periodo" className="scroll-mt-6">
          <legend className="rotulo">Horário da visita</legend>
          <div className="mt-3 grid grid-cols-2 gap-3">
            {PERIODOS.map((p) => (
              <Opcao key={p.valor} grupo="periodo" valor={p.valor} marcado={f.periodo === p.valor} aoEscolher={() => mudar('periodo', p.valor)} titulo={p.nome} detalhe={p.detalhe} icone={p.valor === 'manha' ? iconeManha : iconeTarde} />
            ))}
          </div>
          {erros.periodo && (
            <p className="erro" role="alert">
              {erros.periodo}
            </p>
          )}
        </fieldset>
      </Passo>

      {/* Campo invisível contra robôs */}
      <div className="hidden" aria-hidden="true">
        <label>
          Não preencha este campo
          <input type="text" name="site" tabIndex={-1} autoComplete="off" value={site} onChange={(e) => setSite(e.target.value)} />
        </label>
      </div>

      {falha && (
        <p className="rounded-2xl border-2 border-red-300 bg-red-50 p-4 text-lg font-semibold text-red-800" role="alert">
          {falha}
        </p>
      )}

      <button
        type="submit"
        data-mapa="enviar"
        disabled={enviando}
        className="w-full rounded-2xl bg-emerald-700 px-6 py-5 text-2xl font-extrabold text-white shadow-lg active:bg-emerald-800 disabled:opacity-70"
      >
        {enviando ? 'Enviando…' : 'Enviar cadastro'}
      </button>
      <p className="text-center text-base text-stone-500">Os dados são usados somente para organizar as visitas.</p>
    </form>
  );
}
