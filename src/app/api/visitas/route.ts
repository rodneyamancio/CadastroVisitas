import { NextResponse, after } from 'next/server';
import { registrar } from '@/lib/auditoria';
import { ipDoCliente } from '@/lib/auth';
import { nomeDia, nomePeriodo } from '@/lib/config';
import { gravarVisita, processarNovaVisita, texto, validarNovaVisita } from '@/lib/criacao';
import { resumoDoAparelho } from '@/lib/dispositivo';
import { parecidasCom } from '@/lib/duplicidade';
import { dentroDaRegiao } from '@/lib/geocode';
import { dentroDoLimite } from '@/lib/limite';

export async function POST(req: Request) {
  const c = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!c) return NextResponse.json({ erro: 'Não foi possível ler os dados enviados.' }, { status: 400 });

  // Campo invisível: pessoas não preenchem, robôs sim.
  if (texto(c.site, 50)) return NextResponse.json({ ok: true });

  const ip = await ipDoCliente();
  if (!dentroDoLimite(`cadastro:${ip}`, 120, 10 * 60_000)) {
    return NextResponse.json({ erro: 'Muitos cadastros em pouco tempo. Aguarde alguns minutos e tente de novo.' }, { status: 429 });
  }

  // Quem está com o formulário antigo aberto não manda a resposta: fica sem informação, sem travar o envio.
  const confirmarContato = c.contato === 'sim' ? true : c.contato === 'nao' ? false : null;
  const { dados, erros } = validarNovaVisita({ ...c, confirmar: confirmarContato });
  if (Object.keys(erros).length) return NextResponse.json({ erro: 'Confira os campos destacados.', erros }, { status: 422 });
  const { responsavel: nome, telefone, endereco: rua, numero, complemento, data_visita: dia, periodo } = dados;

  // Antes de gravar: se já existe cadastro parecido, pergunta a quem está cadastrando se é a mesma família.
  // Só para o formulário novo (que sabe mostrar o aviso). "ignorar" traz os cadastros que a pessoa já disse
  // serem de outra família; com "confirmado" (formulário da versão anterior), grava sem conferir.
  const ignorar = new Set(Array.isArray(c.ignorar) ? c.ignorar.filter((n): n is number => Number.isInteger(n)) : []);
  let confirmado = c.confirmado === true;
  if (c.avisarDuplicidade === true && !confirmado) {
    const todas = await parecidasCom({ responsavel: nome, telefone, endereco: rua, numero, complemento }).catch((e) => {
      console.error('Falha ao procurar cadastro parecido', e);
      return [];
    });
    const parecidas = todas.filter((p) => !ignorar.has(p.id));
    confirmado = todas.length > 0 && !parecidas.length;
    if (parecidas.length) {
      await registrar('visita.duplicidade.aviso', { nome: 'Formulário público' }, nome, {
        endereço: `${rua}, ${numero}`,
        'parecido com': parecidas.map((p) => `Nº ${p.id} (${p.motivos.join(', ')})`).join(' · '),
      });
      return NextResponse.json({ erro: 'Parece que esta família já foi cadastrada.', duplicidade: parecidas }, { status: 409 });
    }
  }

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

  const nova = await gravarVisita(dados, { lat, lng, precisao, ip, agente: agente || null, extra });

  await registrar('visita.criada', { nome: 'Formulário público' }, `Nº ${nova.id} · ${nome}`, {
    endereço: `${rua}, ${numero}`,
    visita: `${nomeDia(dia)} · ${nomePeriodo(periodo)}`,
    'confirmar antes': confirmarContato == null ? 'não informado' : confirmarContato ? 'sim' : 'não',
    ...(confirmado ? { 'aviso de duplicidade': 'viu o aviso e disse que é outra família' } : {}),
    aparelho: extra.aparelho,
  });

  // Depois de responder: bairro pelos Correios, aviso no MCP, mapa e duplicidade.
  // O bairro escrito à mão por quem cadastrou é respeitado; o preenchido sozinho pode ser trocado.
  const bairroAutomatico = c.bairroAutomatico === true;
  after(() => processarNovaVisita(nova.id, bairroAutomatico, precisao));
  return NextResponse.json({ ok: true, id: nova.id });
}
