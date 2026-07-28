const db = require("../db");

// ==========================================================================
// IDENTIDADE — a conta em si agora é real: nasce de POST /usuarios/
// entrar-google, que confere a assinatura do ID token do Google antes de
// criar/recuperar o usuário (ver routes/usuarios.js). Ninguém cria conta
// só inventando um telefone como antes.
//
// A SESSÃO depois disso ainda é simples: o cliente guarda o id retornado
// e manda esse id no header abaixo em toda request seguinte — sem
// expiração, sem rotação, sem verificação de assinatura própria. Ou seja,
// quem descobrir o id de outra pessoa (vazamento, XSS, etc.) ainda
// consegue se passar por ela nas chamadas à API, mesmo sem saber a senha
// de ninguém (não existe senha aqui). Pra evoluir isso, o próximo passo
// seria trocar esse id "eterno" por um token de sessão de curta duração
// (JWT assinado pelo servidor, com expiração) — a criação da conta em si
// já não precisa mudar.
// ==========================================================================
const HEADER_USUARIO_ID = "x-usuario-id";

// Anexa req.usuario quando o header vem e bate com alguém no banco.
// Não bloqueia a request — quem exige identidade usa exigirUsuario abaixo.
function identificarUsuario(req, res, next) {
    const id = req.header(HEADER_USUARIO_ID);
    req.usuario = id
        ? db.prepare("SELECT id, nome, email, telefone FROM usuarios WHERE id = ?").get(id) || null
        : null;
    next();
}

// Pra rotas que exigem alguém identificado (cadastrar prestador, avaliar,
// salvar, decidir avaliação pendente).
function exigirUsuario(req, res, next) {
    if (!req.usuario) {
        return res.status(401).json({ erro: `Faltou o header ${HEADER_USUARIO_ID} (ou ele não corresponde a nenhum usuário). Entre com o Google primeiro (POST /api/usuarios/entrar-google).` });
    }
    next();
}

module.exports = { identificarUsuario, exigirUsuario, HEADER_USUARIO_ID };
