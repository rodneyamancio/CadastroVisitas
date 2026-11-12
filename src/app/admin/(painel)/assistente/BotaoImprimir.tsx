'use client';

export default function BotaoImprimir() {
  return (
    <button type="button" onClick={() => window.print()} className="adm-botao-sec">
      Imprimir
    </button>
  );
}
