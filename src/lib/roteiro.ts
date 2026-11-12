import { z } from 'zod';
import { CENTRO, DIAS, PERIODOS } from './config';
import { sql } from './db';
import { gerarJson } from './ia';
import type { Provedor } from './configuracoes';
import type { Visita } from './visitas';

const EsquemaPlano = z.object({
  resumo: z.string(),
  grupos: z.array(
    z.object({
      nome: z.string(),
      dia: z.enum(DIAS.map((d) => d.valor) as [string, ...string[]]),
      periodo: z.enum(PERIODOS.map((p) => p.valor) as [string, ...string[]]),
      visitas: z.array(z.number()),
      observacao: z.string(),
    }),
  ),
});

export type Grupo = { nome: string; dia: string; periodo: string; observacao: string; visitas: number[]; distanciaM: number | null };
export type Plano = { resumo: string; grupos: Grupo[] };
export type Parametros = { maxPorGrupo: number; orientacoes: string; totalVisitas: number };
export type Roteiro = { id: number; criado_em: Date; criado_por: string | null; provedor: string; modelo: string; parametros: Parametros; plano: Plano };

const SISTEMA = `Você ajuda a coordenação de uma missão de visitas a famílias em São Paulo a organizar a logística. As equipes saem em dois dias (sábado e domingo), em dois períodos (manhã e tarde). Sua tarefa é dividir as visitas em grupos que uma equipe consiga fazer em sequência no mesmo período, juntando casas próximas para reduzir o deslocamento.

Como agrupar:
- Cada grupo só tem visitas do mesmo dia e do mesmo período, porque cada família escolheu quando quer ser visitada.
- Cada visita aparece em exatamente um grupo. Nenhuma fica de fora e nenhuma se repete.
- Respeite o máximo de visitas por grupo informado. Prefira grupos equilibrados a um grupo cheio e outro com uma visita só, a não ser que a casa isolada esteja longe das demais.
- A proximidade é o critério principal. As posições vêm em metros (x cresce para o leste, y cresce para o norte) a partir de um ponto de referência do setor, então a distância entre duas casas é a distância em linha reta entre os pontos. Casas na mesma rua ou no mesmo condomínio ficam juntas.
- Algumas visitas não têm posição (x e y nulos). Coloque cada uma no grupo que mais combina pelo nome da rua e do bairro. Se nada combinar, reúna essas visitas em um grupo próprio daquele dia e período.

Para cada grupo, dê um nome curto que ajude a equipe a reconhecer a região (bairro ou rua principal) e uma observação prática de uma frase, por exemplo: casas na mesma rua, uma casa mais afastada, endereço sem localização para confirmar por telefone. A ordem das visitas dentro do grupo não importa, porque o sistema calcula o trajeto depois.

No resumo, escreva de 3 a 6 frases para a coordenação: quantas equipes são necessárias em cada dia e período, onde está a maior concentração de famílias e os pontos de atenção (períodos sobrecarregados, casas isoladas, endereços sem localização). Escreva em português do Brasil, em linguagem simples.`;

// Posição em metros a partir do centro do setor (mais fácil de comparar do que latitude e longitude).
function emMetros(v: Pick<Visita, 'lat' | 'lng'>): { x: number; y: number } | null {
  if (v.lat == null || v.lng == null) return null;
  return {
    x: Math.round((v.lng - CENTRO.lng) * 111_320 * Math.cos((CENTRO.lat * Math.PI) / 180)),
    y: Math.round((v.lat - CENTRO.lat) * 110_574),
  };
}

// Ordem de visita dentro do grupo: começa pela casa mais afastada e segue sempre para a mais próxima.
function ordenar(ids: number[], posicoes: Map<number, { x: number; y: number } | null>): { ordem: number[]; distanciaM: number | null } {
  const comPosicao = ids.filter((id) => posicoes.get(id));
  const semPosicao = ids.filter((id) => !posicoes.get(id));
  if (comPosicao.length < 2) return { ordem: [...comPosicao, ...semPosicao], distanciaM: comPosicao.length ? 0 : null };
  const p = (id: number) => posicoes.get(id)!;
  const cx = comPosicao.reduce((s, id) => s + p(id).x, 0) / comPosicao.length;
  const cy = comPosicao.reduce((s, id) => s + p(id).y, 0) / comPosicao.length;
  const restantes = new Set(comPosicao);
  let atual = comPosicao.reduce((a, b) => (Math.hypot(p(b).x - cx, p(b).y - cy) > Math.hypot(p(a).x - cx, p(a).y - cy) ? b : a));
  const ordem = [atual];
  restantes.delete(atual);
  let distancia = 0;
  while (restantes.size) {
    let proximo = -1;
    let menor = Infinity;
    for (const id of restantes) {
      const d = Math.hypot(p(id).x - p(atual).x, p(id).y - p(atual).y);
      if (d < menor) {
        menor = d;
        proximo = id;
      }
    }
    distancia += menor;
    ordem.push(proximo);
    restantes.delete(proximo);
    atual = proximo;
  }
  return { ordem: [...ordem, ...semPosicao], distanciaM: Math.round(distancia) };
}

export async function montarRoteiro(
  visitas: Visita[],
  parametros: { maxPorGrupo: number; orientacoes: string },
  ia: { provedor: Provedor; modelo: string; chave: string },
  autor: string,
): Promise<void> {
  const posicoes = new Map(visitas.map((v) => [v.id, emMetros(v)]));
  // Para a IA vão só os dados de endereço e de horário: nomes e telefones ficam no sistema.
  const dados = visitas.map((v) => ({
    id: v.id,
    dia: v.data_visita,
    periodo: v.periodo,
    rua: v.endereco,
    numero: v.numero,
    bairro: v.bairro ?? '',
    x: posicoes.get(v.id)?.x ?? null,
    y: posicoes.get(v.id)?.y ?? null,
  }));
  const usuario = [
    `Máximo de visitas por grupo: ${parametros.maxPorGrupo}.`,
    parametros.orientacoes ? `Orientações da coordenação: ${parametros.orientacoes}` : '',
    `Dias: ${DIAS.map((d) => `${d.valor} = ${d.semana}`).join(', ')}. Períodos: manha = manhã, tarde = tarde.`,
    '',
    `Visitas (${dados.length}), em JSON:`,
    JSON.stringify(dados),
  ]
    .filter((l) => l !== '')
    .join('\n');

  const bruto = await gerarJson(ia, { sistema: SISTEMA, usuario, esquema: EsquemaPlano, nome: 'roteiros' });

  // Conferência: cada visita entra uma única vez e sempre no dia e período que a família escolheu.
  const porId = new Map(visitas.map((v) => [v.id, v]));
  const usadas = new Set<number>();
  const grupos: Grupo[] = [];
  for (const g of bruto.grupos) {
    const ids = g.visitas
      .map((n) => Math.round(n))
      .filter((id) => {
        const v = porId.get(id);
        if (!v || usadas.has(id) || v.data_visita !== g.dia || v.periodo !== g.periodo) return false;
        usadas.add(id);
        return true;
      });
    if (!ids.length) continue;
    const { ordem, distanciaM } = ordenar(ids, posicoes);
    grupos.push({ nome: g.nome.slice(0, 80), dia: g.dia, periodo: g.periodo, observacao: g.observacao.slice(0, 300), visitas: ordem, distanciaM });
  }
  for (const d of DIAS) {
    for (const p of PERIODOS) {
      const sobras = visitas.filter((v) => !usadas.has(v.id) && v.data_visita === d.valor && v.periodo === p.valor).map((v) => v.id);
      for (let i = 0; i < sobras.length; i += parametros.maxPorGrupo) {
        const { ordem, distanciaM } = ordenar(sobras.slice(i, i + parametros.maxPorGrupo), posicoes);
        grupos.push({ nome: 'Demais endereços', dia: d.valor, periodo: p.valor, observacao: 'Visitas que a IA não encaixou em nenhum grupo. Confira.', visitas: ordem, distanciaM });
      }
    }
  }
  const posicao = (g: Grupo) => DIAS.findIndex((d) => d.valor === g.dia) * 10 + PERIODOS.findIndex((p) => p.valor === g.periodo);
  grupos.sort((a, b) => posicao(a) - posicao(b));

  const plano: Plano = { resumo: bruto.resumo.slice(0, 3000), grupos };
  await sql('INSERT INTO roteiros (criado_por, provedor, modelo, parametros, plano) VALUES ($1, $2, $3, $4, $5)', [
    autor,
    ia.provedor,
    ia.modelo,
    JSON.stringify({ ...parametros, totalVisitas: visitas.length }),
    JSON.stringify(plano),
  ]);
}

export async function ultimoRoteiro(): Promise<Roteiro | null> {
  const [r] = await sql<Roteiro>('SELECT * FROM roteiros ORDER BY id DESC LIMIT 1');
  return r ?? null;
}
