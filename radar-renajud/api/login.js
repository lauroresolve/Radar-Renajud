// api/login.js
// Login de usuários + admin com JWT

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') return res.status(405).end();

  const { email, senha } = req.body || {};
  if (!email || !senha) {
    return res.status(400).json({ error: 'E-mail e senha obrigatórios.' });
  }

  const adminEmail = process.env.ADMIN_EMAIL || 'admin@radarrenajud.com.br';
  const adminPass = process.env.ADMIN_PASSWORD || 'Admin@2025!';
  const jwtSecret = process.env.JWT_SECRET || 'radar-renajud-secret-dev';

  let user = null;

  // ── Login Admin ──
  if (email.toLowerCase() === adminEmail.toLowerCase() && senha === adminPass) {
    user = {
      id: 'admin-001',
      nome: 'Administrador',
      email: adminEmail,
      role: 'admin',
      plano: 'ilimitado',
      creditos: 999999,
    };
  }

  // ── Aqui você pode adicionar validação de usuários reais (banco de dados) ──
  // Exemplo com Supabase:
  // const { data, error } = await supabase.from('users').select('*').eq('email', email).single()
  // if (data && await bcrypt.compare(senha, data.password_hash)) { user = data }

  // ── Demo: qualquer email com @teste.com funciona como usuário regular ──
  if (!user && email.endsWith('@teste.com')) {
    user = {
      id: 'user-demo-' + Date.now(),
      nome: email.split('@')[0],
      email,
      role: 'user',
      plano: 'basico',
      creditos: 5,
    };
  }

  if (!user) {
    // Simula delay de segurança
    await new Promise(r => setTimeout(r, 500));
    return res.status(401).json({ error: 'E-mail ou senha incorretos.' });
  }

  const token = makeJWT(user, jwtSecret);

  return res.status(200).json({
    token,
    user: {
      id: user.id,
      nome: user.nome,
      email: user.email,
      role: user.role,
      plano: user.plano,
      creditos: user.creditos,
      avatar: user.nome[0].toUpperCase(),
    },
  });
}

// ── JWT manual (sem dependências externas) ──
function makeJWT(payload, secret) {
  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = b64url(JSON.stringify({
    ...payload,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 7, // 7 dias
  }));
  // Nota: Em produção use uma biblioteca JWT real (jose, jsonwebtoken)
  // Este HMAC simples serve para desenvolvimento/demo
  const sig = b64url(simpleHmac(`${header}.${body}`, secret));
  return `${header}.${body}.${sig}`;
}

function b64url(str) {
  return Buffer.from(str).toString('base64url');
}

function simpleHmac(data, key) {
  // AVISO: Este é um HMAC simplificado para demo.
  // Em produção, use: crypto.createHmac('sha256', key).update(data).digest()
  const crypto = require('crypto');
  return crypto.createHmac('sha256', key).update(data).digest('hex');
}
