import ExcelJS from 'exceljs';
import { registrar } from '@/lib/auditoria';
import { usuarioAtual } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { ultimoRoteiro } from '@/lib/roteiro';
import { listarVisitas } from '@/lib/visitas';

export const dynamic = 'force-dynamic';

// Planilha dos roteiros montados pelo assistente: uma linha por visita, na ordem sugerida.
export async function GET() {
  const usuario = await usuarioAtual();
  if (!usuario) return new Response('Não autorizado', { status: 401 });
  const roteiro = await ultimoRoteiro();
  if (!roteiro) return new Response('Nenhum roteiro montado ainda', { status: 404 });
  const porId = new Map((await listarVisitas()).map((v) => [v.id, v]));

  const livro = new ExcelJS.Workbook();
  const aba = livro.addWorksheet('Roteiros', { views: [{ state: 'frozen', ySplit: 1 }] });
  aba.columns = [
    { header: 'Dia', key: 'dia', width: 18 },
    { header: 'Horário', key: 'periodo', width: 10 },
    { header: 'Grupo', key: 'grupo', width: 34 },
    { header: 'Ordem', key: 'ordem', width: 8 },
    { header: 'Responsável', key: 'responsavel', width: 32 },
    { header: 'Telefone', key: 'telefone', width: 16 },
    { header: 'Rua / Avenida', key: 'endereco', width: 36 },
    { header: 'Número', key: 'numero', width: 9 },
    { header: 'Complemento', key: 'complemento', width: 22 },
    { header: 'Bairro', key: 'bairro', width: 24 },
    { header: 'Como achar a casa', key: 'observacoes', width: 40 },
    { header: 'Observação do grupo', key: 'observacao', width: 50 },
  ];
  let numero = 0;
  for (const g of roteiro.plano.grupos) {
    const visitas = g.visitas.map((id) => porId.get(id)).filter((v) => v !== undefined);
    if (!visitas.length) continue;
    numero++;
    visitas.forEach((v, i) => {
      aba.addRow({
        dia: nomeDia(g.dia),
        periodo: nomePeriodo(g.periodo),
        grupo: `Grupo ${numero}: ${g.nome}`,
        ordem: i + 1,
        responsavel: v.responsavel,
        telefone: v.telefone,
        endereco: v.endereco,
        numero: v.numero,
        complemento: v.complemento,
        bairro: v.bairro,
        observacoes: v.observacoes,
        observacao: g.observacao,
      });
    });
  }
  const cabecalho = aba.getRow(1);
  cabecalho.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  cabecalho.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF047857' } };
  aba.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: aba.columns.length } };

  await registrar('roteiro.exportado', usuario, null, { grupos: numero });
  const dados = await livro.xlsx.writeBuffer();
  return new Response(dados as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': 'attachment; filename="roteiros-de-visita.xlsx"',
      'Cache-Control': 'no-store',
    },
  });
}
