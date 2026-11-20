'use client';

import { useTransition } from 'react';
import { excluirGrupo, gruposDoRoteiro, marcarFeitaPeloPainel, mudarGrupoDaVisita } from '../../acoes-grupos';

export function BotaoRoteiro({ grupos, visitas }: { grupos: number; visitas: number }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        if (confirm(`Criar ${grupos} ${grupos === 1 ? 'grupo' : 'grupos'} pelo roteiro da IA e colocar neles ${visitas} ${visitas === 1 ? 'visita' : 'visitas'} que estão sem grupo?`)) {
          iniciar(() => gruposDoRoteiro());
        }
      }}
      className="adm-botao-sec w-full"
    >
      {pendente ? 'Criando grupos…' : 'Criar grupos pelo roteiro da IA'}
    </button>
  );
}

export function BotaoExcluirGrupo({ id, nome, visitas }: { id: number; nome: string; visitas: number }) {
  const [pendente, iniciar] = useTransition();
  return (
    <button
      type="button"
      disabled={pendente}
      onClick={() => {
        const aviso = visitas ? ` As ${visitas} visitas dele voltam para "sem grupo".` : '';
        if (confirm(`Excluir o grupo "${nome}"?${aviso}`)) iniciar(() => excluirGrupo(id));
      }}
      className="rounded-lg px-3 py-2 text-sm font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
    >
      {pendente ? 'Excluindo…' : 'Excluir grupo'}
    </button>
  );
}

// Na tela do grupo: mudar a visita de grupo e marcar ou desmarcar a visita feita (só a coordenação desmarca).
export function ControlesDaVisita({ id, nome, feita, grupo, outros }: { id: number; nome: string; feita: boolean; grupo: number; outros: { id: number; nome: string }[] }) {
  const [pendente, iniciar] = useTransition();
  return (
    <div className={`flex flex-wrap items-center gap-2 print:hidden ${pendente ? 'opacity-60' : ''}`}>
      <button
        type="button"
        disabled={pendente}
        onClick={() => {
          const pergunta = feita ? `Desmarcar a visita feita de ${nome}? Ela volta a aparecer como a fazer para o líder.` : `Marcar a visita de ${nome} como feita?`;
          if (confirm(pergunta)) iniciar(() => marcarFeitaPeloPainel(id, !feita));
        }}
        className="adm-botao-sec py-1.5"
      >
        {feita ? 'Desmarcar feita' : 'Marcar como feita'}
      </button>
      <select
        aria-label={`Mudar o grupo de ${nome}`}
        value={grupo}
        disabled={pendente}
        onChange={(e) => {
          const destino = Number(e.target.value);
          if (destino !== grupo) iniciar(() => mudarGrupoDaVisita(id, destino));
        }}
        className="adm-campo w-auto max-w-56 py-1.5 text-sm"
      >
        {outros.map((g) => (
          <option key={g.id} value={g.id}>
            {g.id === grupo ? 'Mudar de grupo…' : g.nome}
          </option>
        ))}
        <option value={0}>Tirar do grupo</option>
      </select>
    </div>
  );
}
