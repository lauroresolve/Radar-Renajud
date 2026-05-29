# 📡 Radar Renajud — Backend

## Estrutura do projeto

```
radar-renajud/
├── api/
│   ├── login.js        ← Login + geração de JWT
│   └── consultar.js    ← Consulta placa (real ou demo)
├── public/
│   └── index.html      ← Frontend completo (SPA)
├── vercel.json         ← Configuração de rotas
└── README.md
```

## Deploy na Vercel (passo a passo)

### 1. Clone / crie o repositório no GitHub
Suba todos esses arquivos para um repositório GitHub.

### 2. Importe na Vercel
- Acesse https://vercel.com/new
- Conecte o repositório
- Framework: **Other**
- Build Command: *(vazio)*
- Output Directory: *(vazio)*

### 3. Configure as variáveis de ambiente (Vercel → Settings → Environment Variables)

| Variável | Valor | Onde obter |
|---|---|---|
| `CONSULTARPLACA_EMAIL` | seu@email.com | Cadastro em consultarplaca.com.br |
| `CONSULTARPLACA_APIKEY` | `abc123...` | Minha Conta → API → Gerar API Key |
| `ADMIN_EMAIL` | admin@seusite.com.br | Você define |
| `ADMIN_PASSWORD` | SenhaForte123! | Você define |
| `JWT_SECRET` | string aleatória longa | Gere em: https://generate-secret.vercel.app/32 |

### 4. Login Admin (acesso ilimitado)
Use as credenciais que você definiu em `ADMIN_EMAIL` e `ADMIN_PASSWORD`.
O admin **não consome créditos** e tem acesso irrestrito a todas as consultas.

### 5. Modo Demo (sem credenciais)
Se `CONSULTARPLACA_EMAIL` não estiver configurado, o sistema roda em modo demo com dados realistas simulados. Ideal para testar o fluxo antes de contratar a API.

### 6. Modo Teste com placa real
A própria API do ConsultarPlaca tem uma placa de teste: **AAA0000**
- Não consome créditos
- Retorna dados fictícios mas estrutura real

## Obtendo a API Key do ConsultarPlaca

1. Acesse https://www.consultarplaca.com.br
2. Crie uma conta (gratuito)
3. Acesse **Minha Conta → API → Gerar API Key**
4. Copie o email e a API Key
5. Cole nas variáveis de ambiente da Vercel

**Custo estimado:** ~R$ 0,25 por consulta básica (flag RENAJUD inclusa)

## Endpoints da API

### POST /api/login
```json
// Body
{ "email": "admin@radarrenajud.com.br", "senha": "Admin@2025!" }

// Resposta
{
  "token": "eyJ...",
  "user": { "nome": "Administrador", "role": "admin", "plano": "ilimitado" }
}
```

### POST /api/consultar
```
Authorization: Bearer <token>
Content-Type: application/json
```
```json
// Body
{ "placa": "ABC1D23" }

// Resposta
{
  "placa": "ABC1D23",
  "fonte": "real",
  "veiculo": { "marca": "HYUNDAI", "modelo": "HB20", "ano_fabricacao": "2022", ... },
  "renajud": { "verificado": true, "possui_restricao": false, "detalhes": null },
  "score": 12,
  "nivel": "baixo",
  "consultado_em": "2025-05-29T..."
}
```

## Usuários de teste (sem banco de dados)

- **Admin:** `ADMIN_EMAIL` + `ADMIN_PASSWORD` → role: admin, ilimitado
- **Usuário demo:** qualquer `@teste.com` + qualquer senha → role: user, 5 créditos

## Próximos passos para produção

- [ ] Substituir JWT manual por `jose` ou `jsonwebtoken` (npm)
- [ ] Adicionar banco de dados (Supabase recomendado — plano gratuito)
- [ ] Implementar controle de créditos por usuário
- [ ] Adicionar pagamentos (Stripe ou Pix via Mercado Pago)
- [ ] Rate limiting por IP para evitar abuso
