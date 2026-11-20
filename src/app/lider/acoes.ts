'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registrar } from '@/lib/auditoria';
import { exigirPessoa, ipDoCliente } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { gravarVisita, processarNovaVisita, validarNovaVisita } from '@/lib/criacao';
import { sql } from '@/lib/db';
import { parecidasCom } from '@/lib/duplicidade';
import { comentar, gruposDoLider, marcarFeita, visitaDoLider } from '@/lib/grupos';
import { dentroDoLimite } from '@/lib/limite';
import { enderecoCompleto, type Visita } from '@/lib/visitas';

// Ações do líder de grupo. Toda ação confere se a visita está em um grupo que a pessoa lidera.
// De propósito, não existe ação para o líder desmarcar a visita feita: só a coordenação desmarca.

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();
const FORA_DO_GRUPO = 'Esta visita não está mais no seu grupo. Atualize a página.';

function atualizar() {
  revalidatePath('/lider', 'layout');
  revalidatePath('/admin', 'layout');
}

export type RetornoDoLider = { erro?: string } | undefined;

export async function marcarVisitaFeita(id: number, comentario: string): Promise<RetornoDoLider> {
  const eu = await exigirPessoa();
  const v = await visitaDoLider(id, eu.id);
  if (!v) return { erro: FORA_DO_GRUPO };
  const texto = String(comentario ?? '').trim().slice(0, 500);
  const feita = await marcarFeita(id, eu.nome);
  if (texto) await comentar(id, texto, eu.nome);
  // Já estava marcada (dois toques ou dois aparelhos): nada a registrar de novo
  if (feita) {
    await registrar('visita.feita', eu, `Nº ${v.id} · ${v.responsavel}`, {
      origem: 'líder do grupo',
      visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
      ...(texto ? { comentário: texto } : {}),
    });
  }
  atualizar();
  return undefined;
}

export async function salvarComentario(id: number, comentario: string): Promise<RetornoDoLider> {
  const eu = await exigirPessoa();
  const v = await visitaDoLider(id, eu.id);
  if (!v) return { erro: FORA_DO_GRUPO };
  const texto = String(comentario ?? '').trim().slice(0, 500);
  const mudou = await comentar(id, texto || null, eu.nome);
  if (mudou) await registrar('visita.comentario', eu, `Nº ${v.id} · ${v.responsavel}`, { origem: 'líder do grupo', comentário: texto || '(apagado)' });
  atualizar();
  return undefined;
}

export type ValoresDoLancamento = {
  grupo: string;
  responsavel: string;
  telefone: string;
  endereco: string;
  numero: string;
  complemento: string;
  bairro: string;
  observacoes: string;
  data_visita: string;
  periodo: string;
  comentario: string;
};
export type JaNaLista = { id: number; responsavel: string; endereco: string; visita: string; feita: boolean; motivos: string[] };
export type RetornoLancamento = { erro?: string; erros?: Record<string, string>; valores?: ValoresDoLancamento; jaNaLista?: JaNaLista[] } | undefined;

// Os nomes dos campos do formulário público são outros
const CAMPO_DO_LIDER: Record<string, string> = { nome: 'responsavel', rua: 'endereco', dia: 'data_visita' };

// Visita que não estava na lista: entra nas visitas do evento já como feita, no grupo do líder,
// marcada como "lançada pelo líder".
export async function lancarVisita(_anterior: RetornoLancamento, fd: FormData): Promise<RetornoLancamento> {
  const eu = await exigirPessoa();
  const valores: ValoresDoLancamento = {
    grupo: campo(fd, 'grupo'),
    responsavel: campo(fd, 'responsavel'),
    telefone: campo(fd, 'telefone'),
    endereco: campo(fd, 'endereco'),
    numero: campo(fd, 'numero'),
    complemento: campo(fd, 'complemento'),
    bairro: campo(fd, 'bairro'),
    observacoes: campo(fd, 'observacoes'),
    data_visita: campo(fd, 'data_visita'),
    periodo: campo(fd, 'periodo'),
    comentario: campo(fd, 'comentario').slice(0, 500),
  };
  const grupos = await gruposDoLider(eu.id);
  if (!grupos.length) return { erro: 'Você não está em nenhum grupo. Fale com a coordenação.', valores };
  const grupo = grupos.length === 1 ? grupos[0] : grupos.find((g) => String(g.id) === valores.grupo);

  const { dados, erros } = validarNovaVisita({
    nome: valores.responsavel,
    telefone: valores.telefone,
    rua: valores.endereco,
    numero: valores.numero,
    complemento: valores.complemento,
    bairro: valores.bairro,
    obs: valores.observacoes,
    dia: valores.data_visita,
    periodo: valores.periodo,
    confirmar: null,
  });
  const errosDoLider = Object.fromEntries(Object.entries(erros).map(([k, v]) => [CAMPO_DO_LIDER[k] ?? k, v]));
  if (!grupo) errosDoLider.grupo = 'Escolha o grupo.';
  if (Object.keys(errosDoLider).length || !grupo) return { erro: 'Confira os campos destacados.', erros: errosDoLider, valores };
  if (!dentroDoLimite(`lancar:${eu.id}`, 40, 60 * 60_000)) return { erro: 'Muitos lançamentos em pouco tempo. Aguarde alguns minutos.', valores };

  // A família já está na lista do líder? (só olha os grupos dele, para não mostrar famílias de outros grupos)
  if (!fd.get('mesmo_assim')) {
    const parecidas = await parecidasCom(dados).catch(() => []);
    if (parecidas.length) {
      const minhas = await sql<Visita>('SELECT * FROM visitas WHERE id = ANY($1::int[]) AND grupo_id = ANY($2::int[])', [parecidas.map((p) => p.id), grupos.map((g) => g.id)]);
      if (minhas.length) {
        return {
          erro: 'Parece que esta família já está na sua lista.',
          valores,
          jaNaLista: minhas.map((v) => ({
            id: v.id,
            responsavel: v.responsavel,
            endereco: enderecoCompleto(v),
            visita: `${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
            feita: v.feita_em != null,
            motivos: parecidas.find((p) => p.id === v.id)?.motivos ?? [],
          })),
        };
      }
    }
  }

  const nova = await gravarVisita(dados, {
    lat: null,
    lng: null,
    precisao: null,
    ip: await ipDoCliente(),
    agente: ((await headers()).get('user-agent') ?? '').slice(0, 400) || null,
    extra: { aparelho: `Lançada no dia pelo líder ${eu.nome}` },
  });
  await sql(
    `UPDATE visitas SET grupo_id = $2, lancada_por = $3, feita_em = now(), feita_por = $3,
            comentario = $4, comentario_em = CASE WHEN $4::text IS NULL THEN NULL ELSE now() END, comentario_por = CASE WHEN $4::text IS NULL THEN NULL ELSE $3 END
     WHERE id = $1`,
    [nova.id, grupo.id, eu.nome, valores.comentario || null],
  );
  await registrar('visita.lancada', eu, `Nº ${nova.id} · ${nova.responsavel}`, {
    grupo: grupo.nome,
    endereço: `${nova.endereco}, ${nova.numero}`,
    visita: `${nomeDia(nova.data_visita)} · ${nomePeriodo(nova.periodo)}`,
    ...(valores.comentario ? { comentário: valores.comentario } : {}),
  });
  // Bairro pelos Correios, aviso no MCP, posição no mapa e conferência de duplicidade
  void processarNovaVisita(nova.id, false, null);
  atualizar();
  redirect(`/lider?dia=${nova.data_visita}&lancada=${nova.id}`);
}
