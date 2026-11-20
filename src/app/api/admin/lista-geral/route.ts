import ExcelJS from 'exceljs';
import { registrar } from '@/lib/auditoria';
import { usuarioAtual } from '@/lib/auth';
import { formatarTelefone, lerFiltrosGerais, listaGeral } from '@/lib/cadastros';
import { nomeDia, nomePeriodo } from '@/lib/config';

export const dynamic = 'force-dynamic';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

// Planilha da lista geral: visitas deste evento + cadastros sem visita
export async function GET(req: Request) {
  const usuario = await usuarioAtual();
  if (!usuario) return new Response('Não autorizado', { status: 401 });

  const filtros = lerFiltrosGerais(Object.fromEntries(new URL(req.url).searchParams));
  const familias = await listaGeral(filtros);

  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Lista geral', { views: [{ state: 'frozen', ySplit: 1 }] });
  aba.columns = [
    { header: 'Responsável', key: 'responsavel', width: 32 },
    { header: 'Telefone', key: 'telefone', width: 17 },
    { header: 'Situação', key: 'situacao', width: 14 },
    { header: 'Nº', key: 'id', width: 7 },
    { header: 'Dia da visita', key: 'dia', width: 18 },
    { header: 'Horário', key: 'periodo', width: 10 },
    { header: 'Rua / Avenida', key: 'endereco', width: 36 },
    { header: 'Número', key: 'numero', width: 9 },
    { header: 'Complemento', key: 'complemento', width: 22 },
    { header: 'Bairro', key: 'bairro', width: 24 },
    { header: 'Cidade', key: 'cidade', width: 16 },
    { header: 'UF', key: 'uf', width: 6 },
    { header: 'CEP', key: 'cep', width: 11 },
    { header: 'Como achar a casa', key: 'observacoes', width: 40 },
    { header: 'Por que não teve visita', key: 'motivo', width: 36 },
    { header: 'Telefone repetido na lista', key: 'repetido', width: 24 },
    { header: 'Cadastrado em', key: 'criado_em', width: 18 },
    { header: 'Cadastrado por', key: 'criado_por', width: 24 },
  ];
  for (const f of familias) {
    aba.addRow({
      ...f,
      telefone: formatarTelefone(f.telefone),
      situacao: f.tipo === 'visita' ? 'Com visita' : 'Sem visita',
      dia: f.data_visita ? nomeDia(f.data_visita) : '',
      periodo: f.periodo ? nomePeriodo(f.periodo) : '',
      repetido: f.mesmo_telefone > 1 ? 'Sim' : '',
      criado_em: quando.format(f.criado_em),
      criado_por: f.criado_por ?? '',
    });
  }
  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.height = 22;
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.columns.length } };

  await registrar('cadastro.exportado', usuario, null, {
    famílias: familias.length,
    'com visita': familias.filter((f) => f.tipo === 'visita').length,
    'sem visita': familias.filter((f) => f.tipo === 'cadastro').length,
    filtros: Object.entries(filtros).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ') || 'nenhum',
  });
  const dados = await livro.xlsx.writeBuffer();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Response(dados as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="lista-geral-${hoje}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
