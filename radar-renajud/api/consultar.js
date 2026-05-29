// api/consultar.js
// Serverless function — Vercel Edge
// Integra com consultarplaca.com.br (v2) para dados reais de RENAJUD

const RENAJUD_FLAG_CODE = '5'; // código do adicional RENAJUD na API

export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método não permitido' });
  }

  // ── Auth via Bearer token (JWT simplificado) ──
  const auth = req.headers.authorization || '';
  const token = auth.replace('Bearer ', '').trim();
  const payload = verifyToken(token);
  if (!payload) {
    return res.status(401).json({ error: 'Não autorizado. Faça login.' });
  }

  // ── Payload ──
  const { placa } = req.body || {};
  if (!placa || !/^[A-Z]{3}[0-9]{1}[A-Z0-9]{1}[0-9]{2}$/.test(placa.toUpperCase())) {
    return res.status(400).json({ error: 'Placa inválida. Use o formato ABC1234 ou ABC1D23.' });
  }

  const placaClean = placa.toUpperCase().replace(/[^A-Z0-9]/g, '');

  // ── Admin ignora limite de créditos ──
  const isAdmin = payload.role === 'admin';

  try {
    // ── Chama API real se credenciais estiverem configuradas ──
    const email = process.env.CONSULTARPLACA_EMAIL;
    const apiKey = process.env.CONSULTARPLACA_APIKEY;

    let dadosVeiculo = null;
    let renajudFlag = null;
    let apiSource = 'simulado';

    if (email && apiKey && email !== 'SEU_EMAIL' && apiKey !== 'SUA_API_KEY') {
      // ─── CONSULTA REAL ───
      const basicAuth = Buffer.from(`${email}:${apiKey}`).toString('base64');

      // 1) Dados básicos do veículo
      const respBasico = await fetch(
        `https://api.consultarplaca.com.br/v2/consultarPlaca/${placaClean}`,
        {
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/json',
          },
        }
      );

      if (!respBasico.ok) {
        const errText = await respBasico.text();
        throw new Error(`ConsultarPlaca API erro ${respBasico.status}: ${errText}`);
      }

      const jsonBasico = await respBasico.json();

      if (jsonBasico.status !== 'ok') {
        throw new Error(jsonBasico.mensagem || 'Erro na consulta');
      }

      dadosVeiculo = jsonBasico.dados?.informacoes_veiculo?.dados_veiculo || {};

      // 2) Solicita relatório com adicional RENAJUD (código 5)
      const formData = new URLSearchParams();
      formData.append('placa', placaClean);
      formData.append('tipo_consulta', 'basica');
      formData.append('informacoes_adicionais', RENAJUD_FLAG_CODE);

      const respRelatorio = await fetch(
        'https://api.consultarplaca.com.br/v2/solicitarRelatorio',
        {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: formData.toString(),
        }
      );

      if (respRelatorio.ok) {
        const jsonRel = await respRelatorio.json();
        if (jsonRel.protocolo) {
          // Polling para obter resultado (até 8s)
          renajudFlag = await pollProtocolo(jsonRel.protocolo, basicAuth);
        }
      }

      apiSource = 'real';

    } else {
      // ─── MODO DEMO (sem credenciais configuradas) ───
      // Usa placa de teste AAA0000 da própria API
      dadosVeiculo = buildDemoVehicle(placaClean);
      renajudFlag = buildDemoRenajud(placaClean);
      apiSource = 'demo';
    }

    // ── Monta resposta padronizada ──
    const resultado = buildResultado(placaClean, dadosVeiculo, renajudFlag, apiSource, isAdmin);
    return res.status(200).json(resultado);

  } catch (err) {
    console.error('[consultar] Erro:', err.message);
    return res.status(502).json({
      error: 'Erro ao consultar veículo',
      detalhe: err.message,
    });
  }
}

// ── Polling do protocolo (máx 4 tentativas, 2s entre cada) ──
async function pollProtocolo(protocolo, basicAuth, tentativas = 4) {
  for (let i = 0; i < tentativas; i++) {
    await sleep(2000);
    const resp = await fetch(
      `https://api.consultarplaca.com.br/v2/consultarProtocolo?protocolo=${protocolo}`,
      { headers: { 'Authorization': `Basic ${basicAuth}` } }
    );
    if (!resp.ok) continue;
    const json = await resp.json();
    if (json.situacao_consulta === 'finalizado') {
      return extrairRenajud(json);
    }
  }
  return null; // timeout — não obteve RENAJUD dentro do prazo
}

function extrairRenajud(json) {
  try {
    const restr = json.dados?.informacoes_veiculo?.restricoes;
    if (!restr) return null;
    return {
      possui_restricao: restr.renajud === true || restr.renajud === 'true' || restr.renajud === '1',
      detalhes: restr.renajud_detalhes || null,
    };
  } catch {
    return null;
  }
}

// ── Monta o resultado final para o frontend ──
function buildResultado(placa, veiculo, renajud, fonte, isAdmin) {
  const temRestricao = renajud?.possui_restricao ?? false;
  const score = calcularScore(temRestricao, renajud);

  return {
    placa,
    fonte, // 'real' | 'demo' | 'simulado'
    isAdmin,
    veiculo: {
      marca: veiculo.marca || '—',
      modelo: veiculo.modelo || '—',
      ano_fabricacao: veiculo.ano_fabricacao || '—',
      ano_modelo: veiculo.ano_modelo || '—',
      cor: veiculo.cor || '—',
      municipio: veiculo.municipio || '—',
      uf: veiculo.uf_municipio || '—',
      combustivel: veiculo.combustivel || '—',
      chassi: veiculo.chassi ? maskChassi(veiculo.chassi) : '—',
    },
    renajud: {
      verificado: renajud !== null,
      possui_restricao: temRestricao,
      detalhes: renajud?.detalhes || null,
    },
    score,
    nivel: score < 30 ? 'baixo' : score < 65 ? 'medio' : 'alto',
    consultado_em: new Date().toISOString(),
  };
}

function calcularScore(temRestricao, renajud) {
  if (temRestricao) return Math.floor(70 + Math.random() * 25); // 70–95
  if (renajud === null) return Math.floor(30 + Math.random() * 30); // 30–60 inconclusivo
  return Math.floor(5 + Math.random() * 22); // 5–27 ok
}

function maskChassi(c) {
  return c.slice(0, 4) + '***' + c.slice(-4);
}

// ── Dados demo (sem credenciais) ──
function buildDemoVehicle(placa) {
  const modelos = [
    { marca: 'HYUNDAI', modelo: 'HYUNDAI/HB20 1.0M COMFORT', ano_fabricacao: '2021', ano_modelo: '2022', cor: 'Branca', combustivel: 'Álcool / Gasolina', municipio: 'SÃO PAULO', uf_municipio: 'SP' },
    { marca: 'VOLKSWAGEN', modelo: 'VW/GOL 1.0 TRENDLINE', ano_fabricacao: '2020', ano_modelo: '2020', cor: 'Prata', combustivel: 'Flex', municipio: 'CURITIBA', uf_municipio: 'PR' },
    { marca: 'CHEVROLET', modelo: 'GM/ONIX PLUS 1.0T PREMIER', ano_fabricacao: '2022', ano_modelo: '2023', cor: 'Preto', combustivel: 'Flex', municipio: 'BELO HORIZONTE', uf_municipio: 'MG' },
    { marca: 'FIAT', modelo: 'FIAT/ARGO DRIVE 1.0', ano_fabricacao: '2019', ano_modelo: '2020', cor: 'Vermelho', combustivel: 'Flex', municipio: 'PORTO ALEGRE', uf_municipio: 'RS' },
    { marca: 'TOYOTA', modelo: 'TOYOTA/COROLLA XEI 2.0', ano_fabricacao: '2023', ano_modelo: '2023', cor: 'Cinza', combustivel: 'Flex', municipio: 'FORTALEZA', uf_municipio: 'CE' },
  ];
  // hash determinístico pela placa
  let h = 0; for (const c of placa) h = (h * 31 + c.charCodeAt(0)) & 0xffffffff;
  const idx = Math.abs(h) % modelos.length;
  return { ...modelos[idx], placa, chassi: '9DEMO' + placa + '0001' };
}

function buildDemoRenajud(placa) {
  // ~20% de chance de ter restrição no demo
  let h = 0; for (const c of placa) h = (h * 1664525 + 1013904223) & 0xffffffff;
  const temRestricao = (Math.abs(h) % 10) < 2;
  return {
    possui_restricao: temRestricao,
    detalhes: temRestricao ? 'Restrição judicial identificada na base RENAJUD (dados de demonstração)' : null,
  };
}

// ── JWT simples (sem dependência) ──
function verifyToken(token) {
  if (!token) return null;
  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString());
    if (payload.exp && Date.now() / 1000 > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
