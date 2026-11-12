import { exigirUsuario } from '@/lib/auth';
import { CENTRO } from '@/lib/config';
import { enderecoCompleto, listarVisitas } from '@/lib/visitas';
import { localizarPendentes } from '../../acoes';
import MapaCalor, { type Ponto } from './MapaCalor';

export default async function Mapa() {
  await exigirUsuario();
  const visitas = await listarVisitas();
  const pontos: Ponto[] = visitas.map((v) => ({
    id: v.id,
    lat: v.lat,
    lng: v.lng,
    nome: v.responsavel,
    endereco: enderecoCompleto(v),
    bairro: v.bairro?.trim() || 'Bairro não informado',
    dia: v.data_visita,
    periodo: v.periodo,
    precisao: v.precisao,
  }));
  const semPosicao = pontos.filter((p) => p.lat == null).length;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-extrabold text-stone-900">Mapa de calor das visitas</h1>
        <p className="text-sm text-stone-600">Quanto mais vermelho, mais famílias cadastradas perto umas das outras.</p>
      </div>
      {semPosicao > 0 && (
        <form action={localizarPendentes} className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">
          <span>
            {semPosicao} {semPosicao === 1 ? 'endereço ainda não foi encontrado' : 'endereços ainda não foram encontrados'} no mapa.
          </span>
          <button type="submit" className="adm-botao-sec">
            Tentar localizar de novo
          </button>
        </form>
      )}
      <MapaCalor pontos={pontos} centro={CENTRO} />
    </div>
  );
}
