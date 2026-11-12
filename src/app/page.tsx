import FormularioVisita from '@/components/FormularioVisita';
import { SUBTITULO, TITULO } from '@/lib/config';

export default function Inicio() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16">
      <header data-mapa="topo" className="pt-8 pb-6 text-center">
        <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-emerald-700">
          <svg viewBox="0 0 24 24" className="h-8 w-8 fill-white" aria-hidden="true">
            <path d="M12 3 2 11.5h3V21h5.5v-6h3v6H19v-9.5h3z" />
          </svg>
        </div>
        <h1 className="text-3xl font-extrabold tracking-tight text-stone-900">{TITULO}</h1>
        <p className="mt-1 text-lg text-stone-600">{SUBTITULO}</p>
      </header>
      <FormularioVisita />
    </main>
  );
}
