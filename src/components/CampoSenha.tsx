'use client';

import { useState } from 'react';

// Campo de senha com botão para mostrar o que foi digitado.
export default function CampoSenha(props: { name: string; rotulo: string; autoComplete: string; minLength?: number; ajuda?: string }) {
  const [visivel, setVisivel] = useState(false);
  const id = `senha-${props.name}`;
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-sm font-semibold text-stone-800">
        {props.rotulo}
      </label>
      <div className="relative">
        <input
          id={id}
          name={props.name}
          type={visivel ? 'text' : 'password'}
          autoComplete={props.autoComplete}
          minLength={props.minLength}
          required
          className="adm-campo pr-24"
        />
        <button
          type="button"
          onClick={() => setVisivel((v) => !v)}
          aria-pressed={visivel}
          className="absolute inset-y-0 right-0 px-3 text-sm font-semibold text-emerald-800"
        >
          {visivel ? 'Ocultar' : 'Mostrar'}
        </button>
      </div>
      {props.ajuda && <p className="mt-1 text-xs text-stone-500">{props.ajuda}</p>}
    </div>
  );
}
