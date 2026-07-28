const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { OAuth2Client } = require("google-auth-library");
const db = require("../db");
const { sanitizarTexto } = require("../utils/sanitizar");
const { exigirUsuario } = require("../middleware/identidade");
const { formatarPrestador, SELECT_PRESTADORES_COM_NOTA } = require("../utils/formatarPrestador");

const router = express.Router();

// ==========================================================================
// LOGIN COM GOOGLE — substitui o "entrar por telefone" (que não verificava
// nada, só confiava no que a pessoa digitava). Isso só funciona rodando
// como site normal (fora do WebView do app Android) — Google recusa OAuth
// dentro de WebView embutida de propósito, desde 2016. Ver conversa sobre
// isso: quando o REFLEXO virar app de novo, essa tela de login precisa
// abrir numa Custom Tab (ou usar o SDK nativo), não dentro da WebView.
//
// GOOGLE_CLIENT_ID precisa ser o MESMO Client ID configurado no front
// (script.js) — ele é a "audiência" que valida o token aqui.
// ==========================================================================
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const googleClient = GOOGLE_CLIENT_ID ? new OAuth2Client(GOOGLE_CLIENT_ID) : null;

// POST /api/usuarios/entrar-google
// Body: { credential } — o ID token (JWT) que o botão "Sign in with
// Google" do front recebe pronto, sem o front nunca ver senha nenhuma.
// O servidor verifica a ASSINATURA desse token direto com o Google
// (verifyIdToken já faz isso, incluindo checar expiração e audiência) —
// então um token forjado não passa, ao contrário do telefone auto-declarado
// de antes.
router.post("/entrar-google", async (req, res) => {
    if (!googleClient) {
        return res.status(500).json({ erro: "Servidor sem GOOGLE_CLIENT_ID configurado (ver .env)." });
    }

    const { credential } = req.body;
    if (!credential) return res.status(400).json({ erro: "credential é obrigatório." });

    let payload;
    try {
        const ticket = await googleClient.verifyIdToken({ idToken: credential, audience: GOOGLE_CLIENT_ID });
        payload = ticket.getPayload();
    } catch (erro) {
        return res.status(401).json({ erro: "Token do Google inválido ou expirado." });
    }

    const googleSub = payload.sub;
    const email = payload.email;
    const nome = sanitizarTexto(payload.name || email || "Você", 80);
    // payload.picture: URL do CDN do Google (lh3.googleusercontent.com),
    // não é um arquivo nosso — só guardamos a referência. Pode vir vazio
    // em contas sem foto configurada (payload simplesmente omite o campo).
    const avatarUrl = payload.picture || null;

    let usuario = db.prepare("SELECT id, nome, email, telefone, avatar_url AS avatarUrl FROM usuarios WHERE google_sub = ?").get(googleSub);

    if (!usuario) {
        const novo = { id: uuidv4(), nome, email, google_sub: googleSub, avatar_url: avatarUrl, criado_em: Date.now() };
        db.prepare(`
            INSERT INTO usuarios (id, nome, email, google_sub, telefone, avatar_url, criado_em)
            VALUES (@id, @nome, @email, @google_sub, NULL, @avatar_url, @criado_em)
        `).run(novo);
        usuario = { id: novo.id, nome: novo.nome, email: novo.email, telefone: null, avatarUrl: novo.avatar_url };
    } else {
        // Login em conta já existente: a foto do Google pode ter mudado
        // desde o último login — atualiza pra manter em sincronia (é só
        // uma URL, sem custo de reprocessar/baixar nada).
        db.prepare("UPDATE usuarios SET avatar_url = ? WHERE id = ?").run(avatarUrl, usuario.id);
        usuario.avatarUrl = avatarUrl;
    }

    res.json(usuario);
});

// GET /api/usuarios/:id
router.get("/:id", (req, res) => {
    const usuario = db.prepare("SELECT id, nome, email, telefone, avatar_url AS avatarUrl FROM usuarios WHERE id = ?").get(req.params.id);
    if (!usuario) return res.status(404).json({ erro: "Usuário não encontrado." });
    res.json(usuario);
});

// PATCH /api/usuarios/:id — editar perfil (hoje só o nome é editável no front;
// email vem do Google e não é editável por aqui de propósito, é a âncora
// da conta).
router.patch("/:id", exigirUsuario, (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra editar o próprio perfil." });
    }

    const nome = sanitizarTexto(req.body.nome, 80);
    if (!nome) return res.status(400).json({ erro: "nome é obrigatório." });

    db.prepare("UPDATE usuarios SET nome = ? WHERE id = ?").run(nome, req.params.id);
    // Reconsulta em vez de montar a mão: evita depender de exigirUsuario
    // já trazer avatarUrl no formato certo (req.usuario vem do middleware,
    // que pode ter sido escrito antes dessa coluna existir).
    const atualizado = db.prepare("SELECT id, nome, email, telefone, avatar_url AS avatarUrl FROM usuarios WHERE id = ?").get(req.params.id);
    res.json(atualizado);
});

// ---- SALVOS (prestadores salvos por esse usuário) ----

router.get("/:id/salvos", exigirUsuario, (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra ver a própria lista de salvos." });
    }

    const linhas = db.prepare(`
        ${SELECT_PRESTADORES_COM_NOTA}
        JOIN salvos s ON s.prestador_id = p.id
        WHERE s.usuario_id = ?
        GROUP BY p.id
        ORDER BY s.criado_em DESC
    `).all(req.params.id);

    res.json(linhas.map(formatarPrestador));
});

router.post("/:id/salvos/:prestadorId", exigirUsuario, (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra alterar a própria lista de salvos." });
    }

    db.prepare(`
        INSERT OR IGNORE INTO salvos (usuario_id, prestador_id, criado_em)
        VALUES (?, ?, ?)
    `).run(req.params.id, req.params.prestadorId, Date.now());

    res.status(204).end();
});

router.delete("/:id/salvos/:prestadorId", exigirUsuario, (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra alterar a própria lista de salvos." });
    }

    db.prepare("DELETE FROM salvos WHERE usuario_id = ? AND prestador_id = ?").run(req.params.id, req.params.prestadorId);
    res.status(204).end();
});

module.exports = router;