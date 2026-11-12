import { NextResponse, after } from 'next/server';
import { registrar } from '@/lib/auditoria';
import { ipDoCliente } from '@/lib/auth';
import { CIDADE_PADRAO, DIAS, PERIODOS, UF_PADRAO, nomeDia, nomePeriodo } from '@/lib/config';
import { sql } from '@/lib/db';
import { resumoDoAparelho } from '@/lib/dispositivo';
import { dentroDaRegiao } from '@/lib/geocode';
import { dentroDoLimite } from '@/lib/limite';
import { avisarNovaVisita } from '@/lib/mcp/sessoes';
import { conferirBairro, localizarVisita } from '@/lib/visitas';

const texto = (v: unknown, max: number) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, max) : '');

export async function POST(req: Request) {
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c) return NextResponse.json({ erro: 'Não foi possível ler os dados enviados.' }, { status: 400 });

  // Campo invisível: pessoas não preenchem, robôs sim.
  if (texto(c.site, 50)) return NextResponse.json({ ok: true });

  const ip = await ipDoCliente();
  if (!dentroDoLimite(`cadastro:${ip}`, 120, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitos cadastros em pouco tempo. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
  }

  const nome = texto(c.nome, 120);
  const telefone = texto(c.telefone, 20).replace(/\D/g, '');
  const rua = texto(c.rua, 160);
  const numero = texto(c.numero, 12);
  const dia = texto(c.dia, 10);
  const periodo = texto(c.periodo, 10);

  const erros: Record<string, string> = {};
  if (nome.length < 3) erros.nome = 'Escreva o nome completo do responsável pela casa.';
  if (telefone.length < 10 || telefone.length > 11) erros.telefone = 'Escreva o telefone com DDD. Exemplo: (11) 91234-5678.';
  if (rua.length < 3) erros.rua = 'Escreva o nome da rua ou avenida.';
  if (!numero) erros.numero = 'Escreva o número da casa.';
  if (!DIAS.some((d) => d.valor === dia)) erros.dia = 'Escolha o dia da visita.';
  if (!PERIODOS.some((p) => p.valor === periodo)) erros.periodo = 'Escolha o horário da visita.';
  if (Object.keys(erros).length) return NextResponse.json({ erro: 'Confira os campos destacados.', erros }, { status: 422 });

  // Posição inicial: GPS do celular (exata) ou a rua escolhida na lista. O número da casa é localizado depois.
  let lat: number | null = Number(c.lat);
  let lng: number | null = Number(c.lng);
  let precisao: string | null = null;
  if (c.lat != null && c.lng != null && Number.isFinite(lat) && Number.isFinite(lng) && dentroDaRegiao(lat, lng)) {
    const precisaoM = Number(c.precisaoM);
    precisao = c.fonte === 'gps' && Number.isFinite(precisaoM) && precisaoM <= 80 ? 'gps' : 'rua';
  } else {
    lat = null;
    lng = null;
  }

  // Dados de quem preencheu (auditoria, visíveis só para o super admin)
  const agente = (req.headers.get('user-agent') ?? '').slice(0, 400);
  const tempo = Number(c.tempoS);
  const extra = {
    aparelho: resumoDoAparelho(agente),
    idioma: (req.headers.get('accept-language') ?? '').split(',')[0].slice(0, 20),
    tela: texto(c.tela, 20),
    fuso: texto(c.fuso, 60),
    visitante: texto(c.visitante, 64),
    tempoS: Number.isFinite(tempo) && tempo >= 0 && tempo < 86_400 ? Math.round(tempo) : null,
    usouGps: c.fonte === 'gps',
  };

  const [nova] = await sql<{ id: number }>(
    `INSERT INTO visitas (responsavel, telefone, endereco, numero, complemento, bairro, cidade, uf, cep, observacoes,
                          data_visita, periodo, lat, lng, precisao, ip, agente, extra)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18) RETURNING id`,
    [
      nome,
      telefone,
      rua,
      numero,
      texto(c.complemento, 120) || null,
      texto(c.bairro, 80) || null,
      texto(c.cidade, 80) || CIDADE_PADRAO,
      texto(c.uf, 30) || UF_PADRAO,
      texto(c.cep, 10) || null,
      texto(c.obs, 500) || null,
      dia,
      periodo,
      lat,
      lng,
      precisao,
      ip,
      agente || null,
      JSON.stringify(extra),
    ],
  );

  await registrar('visita.criada', { nome: 'Formulário público' }, `Nº ${nova.id} · ${nome}`, {
    endereço: `${rua}, ${numero}`,
    visita: `${nomeDia(dia)} · ${nomePeriodo(periodo)}`,
    aparelho: extra.aparelho,
  });

  // Depois de responder: confere o bairro pela rua e pelo número (Correios) e acha a casa no mapa.
  // O bairro escrito à mão por quem cadastrou é respeitado; o preenchido sozinho pode ser trocado.
  const bairroAutomatico = c.bairroAutomatico === true;
  after(async () => {
    await conferirBairro(nova.id, bairroAutomatico).catch((e) => console.error('Falha ao conferir bairro', nova.id, e));
    // Avisa quem está conectado pelo MCP (já com o bairro conferido)
    await avisarNovaVisita(nova.id).catch((e) => console.error('Falha ao avisar pelo MCP', nova.id, e));
    if (precisao !== 'gps') await localizarVisita(nova.id).catch((e) => console.error('Falha ao localizar endereço', nova.id, e));
  });
  return NextResponse.json({ ok: true, id: nova.id });
}
