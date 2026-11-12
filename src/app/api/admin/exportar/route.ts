import ExcelJS from 'exceljs';
import { usuarioAtual } from '@/lib/auth';
import { PRECISOES, nomeDia, nomePeriodo } from '@/lib/config';
import { lerFiltros, listarVisitas } from '@/lib/visitas';

export const dynamic = 'force-dynamic';

const quando = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

export async function GET(req: Request) {
  if (!(await usuarioAtual())) return new Response('Não autorizado', { status: 401 });

  const filtros = lerFiltros(Object.fromEntries(new URL(req.url).searchParams));
  const visitas = await listarVisitas(filtros);

  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Visitas', { views: [{ state: 'frozen', ySplit: 1 }] });
  aba.columns = [
    { header: 'Nº', key: 'id', width: 7 },
    { header: 'Responsável', key: 'responsavel', width: 32 },
    { header: 'Telefone', key: 'telefone', width: 17 },
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
    { header: 'Latitude', key: 'lat', width: 12 },
    { header: 'Longitude', key: 'lng', width: 12 },
    { header: 'Precisão no mapa', key: 'precisao', width: 22 },
    { header: 'Cadastrado em', key: 'criado_em', width: 18 },
  ];
  const telefone = (t: string) =>
    t.length === 11 ? `(${t.slice(0, 2)}) ${t.slice(2, 7)}-${t.slice(7)}` : t.length === 10 ? `(${t.slice(0, 2)}) ${t.slice(2, 6)}-${t.slice(6)}` : t;
  for (const v of visitas) {
    aba.addRow({
      ...v,
      telefone: telefone(v.telefone),
      dia: nomeDia(v.data_visita),
      periodo: nomePeriodo(v.periodo),
      precisao: v.precisao ? PRECISOES[v.precisao] : 'Não localizado',
      criado_em: quando.format(v.criado_em),
    });
  }
  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  cabecalho.alignment = { vertical: 'middle' };
  cabecalho.height = 22;
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.columns.length } };

  const dados = await livro.xlsx.writeBuffer();
  const hoje = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
  return new Response(dados as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="visitas-${hoje}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
