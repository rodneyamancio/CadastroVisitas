'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { registrar } from '@/lib/auditoria';
import { exigirUsuario } from '@/lib/auth';
import {
  conferirBairroDoCadastro,
  criarCadastro,
  editarCadastro,
  excluirCadastro,
  familiasParecidas,
  formatarTelefone,
  validarCadastro,
  type MudancaDoCadastro,
} from '@/lib/cadastros';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { sql } from '@/lib/db';
import { enderecoCompleto, type Visita } from '@/lib/visitas';
import type { DadosDaVisita } from './(painel)/visitas/CamposDaVisita';

// Cadastros sem visita (lista geral): famílias que não vão receber visita neste evento.

const campo = (fd: FormData, nome: string) => String(fd.get(nome) ?? '').trim();

// O que volta para o formulário (os campos da visita ficam vazios: este cadastro não tem visita)
function valoresDoCadastro(fd: FormData): DadosDaVisita {
  return {
    responsavel: campo(fd, 'responsavel'),
    telefone: campo(fd, 'telefone'),
    endereco: campo(fd, 'endereco'),
    numero: campo(fd, 'numero'),
    complemento: campo(fd, 'complemento'),
    bairro: campo(fd, 'bairro'),
    cep: campo(fd, 'cep'),
    observacoes: campo(fd, 'observacoes'),
    data_visita: '',
    periodo: '',
    confirmar: '',
    motivo: campo(fd, 'motivo'),
  };
}

// Família que parece já estar na lista geral. "chave": v<nº da visita> ou c<nº do cadastro sem visita>.
export type FamiliaParecida = { chave: string; href: string; titulo: string; telefone: string; endereco: string; situacao: string; motivos: string[] };
export type RetornoSemVisita =
  | { erro?: string; erros?: Record<string, string>; parecidas?: FamiliaParecida[]; ignoradas?: string[]; valores?: DadosDaVisita; criado?: { id: number; nome: string } }
  | undefined;

export async function cadastrarSemVisita(_anterior: RetornoSemVisita, fd: FormData): Promise<RetornoSemVisita> {
  const eu = await exigirUsuario();
  const valores = valoresDoCadastro(fd);
  const { dados, erros } = validarCadastro(valores);
  // Famílias parecidas que a pessoa já disse serem outras (voltam ao formulário em toda resposta)
  const ignorar = new Set(fd.getAll('ignorar').flatMap((v) => String(v).split(',')).filter((c) => /^[vc]\d+$/.test(c)));
  if (Object.keys(erros).length) return { erro: 'Confira os campos destacados.', erros, valores, ignoradas: [...ignorar] };

  // A família já está nas visitas deste evento ou nos cadastros sem visita? Mostra antes de gravar.
  const achadas = await familiasParecidas(dados).catch((e) => {
    console.error('Falha ao procurar família parecida', e);
    return { visitas: [], cadastros: [] };
  });
  const visitas = achadas.visitas.filter((p) => !ignorar.has(`v${p.id}`));
  const cadastros = achadas.cadastros.filter((p) => !ignorar.has(`c${p.cadastro.id}`));
  if (visitas.length || cadastros.length) {
    const completas = visitas.length ? await sql<Visita>('SELECT * FROM visitas WHERE id = ANY($1::int[])', [visitas.map((p) => p.id)]) : [];
    const porId = new Map(completas.map((v) => [v.id, v]));
    const parecidas: FamiliaParecida[] = [
      ...visitas.flatMap((p) => {
        const v = porId.get(p.id);
        return v
          ? [
              {
                chave: `v${v.id}`,
                href: `/admin/visitas/${v.id}`,
                titulo: `Visita nº ${v.id} · ${v.responsavel}`,
                telefone: formatarTelefone(v.telefone),
                endereco: enderecoCompleto(v),
                situacao: `Já tem visita neste evento: ${nomeDia(v.data_visita)} · ${nomePeriodo(v.periodo)}`,
                motivos: p.motivos,
              },
            ]
          : [];
      }),
      ...cadastros.map(({ cadastro: c, motivos }) => ({
        chave: `c${c.id}`,
        href: `/admin/lista-geral/${c.id}`,
        titulo: `Cadastro sem visita nº ${c.id} · ${c.responsavel}`,
        telefone: formatarTelefone(c.telefone),
        endereco: enderecoCompleto(c),
        situacao: 'Já está na lista geral, sem visita',
        motivos,
      })),
    ];
    await registrar('cadastro.duplicidade.aviso', eu, dados.responsavel, {
      endereço: `${dados.endereco}, ${dados.numero}`,
      'parecido com': parecidas.map((p) => `${p.titulo.split(' · ')[0]} (${p.motivos.join(', ')})`).join(' · '),
    });
    return { erro: 'Parece que esta família já está na lista geral. Confira antes de gravar.', valores, ignoradas: [...ignorar], parecidas };
  }

  const novo = await criarCadastro(dados, eu.nome);
  await registrar('cadastro.criado', eu, `Sem visita nº ${novo.id} · ${novo.responsavel}`, {
    endereço: `${novo.endereco}, ${novo.numero}`,
    telefone: formatarTelefone(novo.telefone),
    ...(novo.motivo ? { 'por que não vai ter visita': novo.motivo } : {}),
    ...(ignorar.size ? { 'aviso de família parecida': 'confirmou que é outra família' } : {}),
  });
  // Bairro pelos Correios quando ficou em branco (sem prender a resposta)
  void conferirBairroDoCadastro(novo.id, false).catch((e) => console.error('Falha ao conferir bairro do cadastro', novo.id, e));
  revalidatePath('/admin/lista-geral', 'layout');
  return { criado: { id: novo.id, nome: novo.responsavel } };
}

export type RetornoEdicaoCadastro = { erro?: string; erros?: Record<string, string>; ok?: string; mudancas?: MudancaDoCadastro[]; valores?: DadosDaVisita } | undefined;

export async function salvarCadastro(id: number, _anterior: RetornoEdicaoCadastro, fd: FormData): Promise<RetornoEdicaoCadastro> {
  const eu = await exigirUsuario();
  const valores = valoresDoCadastro(fd);
  const { dados, erros } = validarCadastro(valores);
  if (Object.keys(erros).length) return { erro: 'Confira os campos destacados.', erros, valores };
  const r = await editarCadastro(id, dados);
  if ('erro' in r) return { erro: r.erro, valores };
  if (!r.mudancas.length) return { ok: 'Nada foi alterado: os dados já estavam assim.' };
  await registrar('cadastro.editado', eu, `Sem visita nº ${r.cadastro.id} · ${r.cadastro.responsavel}`, Object.fromEntries(r.mudancas.map((m) => [m.campo, `${m.antes} → ${m.depois}`])));
  revalidatePath('/admin/lista-geral', 'layout');
  return { ok: 'Alterações salvas.', mudancas: r.mudancas };
}

export async function apagarCadastro(id: number): Promise<void> {
  const eu = await exigirUsuario();
  const c = await excluirCadastro(id);
  if (c) {
    await registrar('cadastro.excluido', eu, `Sem visita nº ${c.id} · ${c.responsavel}`, {
      endereço: enderecoCompleto(c),
      telefone: formatarTelefone(c.telefone),
      ...(c.motivo ? { 'por que não ia ter visita': c.motivo } : {}),
    });
  }
  revalidatePath('/admin/lista-geral', 'layout');
  redirect('/admin/lista-geral');
}
