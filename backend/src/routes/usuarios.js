const express = require("express");
const { v4: uuidv4 } = require("uuid");
const { OAuth2Client } = require("google-auth-library");
const jwt = require("jsonwebtoken");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const db = require("../db");
const { sanitizarTexto } = require("../utils/sanitizar");
const { exigirUsuario } = require("../middleware/identidade");
const { formatarPrestador, SELECT_PRESTADORES_COM_NOTA } = require("../utils/formatarPrestador");

const router = express.Router();

// ==========================================================================
// MIGRAÇÃO LEVE: avatar_customizado — diz se a conta subiu uma foto
// própria (POST /:id/avatar) que deve valer no lugar da foto do Google, E
// funciona como "versão" da foto: guarda 0 (nunca customizou) ou o
// timestamp (ms) do último upload — não é mais um booleano puro. Isso
// serve de cache-bust na URL da foto (?v=<timestamp>, ver avatarUrlEfetivo
// no front): o arquivo em disco tem sempre o mesmo nome determinístico
// (id da conta), então sem um valor que MUDA a cada upload, trocar a foto
// mantém a mesma URL de sempre e o navegador nunca pediria a versão nova
// — ficaria com a antiga em cache pra sempre, em qualquer lugar que já
// tivesse carregado ela antes (era exatamente o bug relatado: foto trocada
// não atualizava em todo canto).
// A foto do Google em si continua sendo sincronizada a cada login (coluna
// avatar_url, ver /entrar-google) independente disso — assim reverter
// (DELETE /:id/avatar) é só zerar essa flag, sem perder a foto do Google
// por baixo. Self-healing, mesmo padrão da migração capa_tipo em
// prestadores.js.
// ==========================================================================
try {
    db.exec("ALTER TABLE usuarios ADD COLUMN avatar_customizado INTEGER NOT NULL DEFAULT 0");
} catch (erro) {
    if (!String(erro.message).includes("duplicate column")) throw erro;
}

const UPLOADS_DIR_AVATAR_USUARIO = path.join(__dirname, "../public/uploads/usuarios/avatar");
fs.mkdirSync(UPLOADS_DIR_AVATAR_USUARIO, { recursive: true });

const TAMANHO_MAXIMO_AVATAR_USUARIO = 6 * 1024 * 1024; // 6MB, mesma folga usada nas fotos de prestador

const uploadAvatarUsuario = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TAMANHO_MAXIMO_AVATAR_USUARIO },
    fileFilter: (req, file, cb) => cb(null, file.mimetype.startsWith("image/"))
});

function receberAvatarUsuario(req, res, next) {
    uploadAvatarUsuario.single("foto")(req, res, (erro) => {
        if (!erro) return next();
        if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ erro: `Imagem muito grande (máximo ${TAMANHO_MAXIMO_AVATAR_USUARIO / 1024 / 1024}MB).` });
        }
        return res.status(400).json({ erro: "Não foi possível receber a imagem enviada." });
    });
}

// Mesma SELECT usada no restante do arquivo (GET/PATCH/entrar-google) —
// evita repetir a lista de colunas com o avatar_customizado embutido.
const SELECT_USUARIO = "SELECT id, nome, email, telefone, avatar_url AS avatarUrl, avatar_customizado AS avatarCustomizado FROM usuarios WHERE id = ?";

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

// JWT_SECRET assina a SESSÃO (não confundir com o Client ID do Google
// acima, que só serve pra validar quem a pessoa é). Precisa ser um
// segredo aleatório e comprido, só do servidor — ver .env. Sem ele,
// /entrar-google não emite token nenhum e ninguém consegue acessar rota
// protegida (ver identidade.js: sem JWT_SECRET, identificarUsuario nunca
// autentica ninguém).
const JWT_SECRET = process.env.JWT_SECRET;
const JWT_EXPIRACAO = "30d"; // sessão dura 30 dias; depois disso precisa logar de novo

function assinarTokenSessao(usuarioId) {
    return jwt.sign({ sub: usuarioId }, JWT_SECRET, { expiresIn: JWT_EXPIRACAO });
}

// POST /api/usuarios/entrar-google
// Body: { credential } — o ID token (JWT) que o botão "Sign in with
// Google" do front recebe pronto, sem o front nunca ver senha nenhuma.
// O servidor verifica a ASSINATURA desse token direto com o Google
// (verifyIdToken já faz isso, incluindo checar expiração e audiência) —
// então um token forjado não passa, ao contrário do telefone auto-declarado
// de antes. Depois de confirmar quem é a pessoa, assina o NOSSO próprio
// token de sessão (JWT_SECRET) — é esse token que o front usa daqui pra
// frente em toda request, não o credential do Google (que é de uso único).
router.post("/entrar-google", async (req, res) => {
    if (!googleClient) {
        return res.status(500).json({ erro: "Servidor sem GOOGLE_CLIENT_ID configurado (ver .env)." });
    }
    if (!JWT_SECRET) {
        return res.status(500).json({ erro: "Servidor sem JWT_SECRET configurado (ver .env)." });
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

    let usuario = db.prepare("SELECT id, nome, email, telefone, avatar_url AS avatarUrl, avatar_customizado AS avatarCustomizado FROM usuarios WHERE google_sub = ?").get(googleSub);

    if (!usuario) {
        const novo = { id: uuidv4(), nome, email, google_sub: googleSub, avatar_url: avatarUrl, criado_em: Date.now() };
        db.prepare(`
            INSERT INTO usuarios (id, nome, email, google_sub, telefone, avatar_url, criado_em)
            VALUES (@id, @nome, @email, @google_sub, NULL, @avatar_url, @criado_em)
        `).run(novo);
        usuario = { id: novo.id, nome: novo.nome, email: novo.email, telefone: null, avatarUrl: novo.avatar_url, avatarCustomizado: 0 };
    } else {
        // Login em conta já existente: a foto do Google pode ter mudado
        // desde o último login — atualiza pra manter em sincronia (é só
        // uma URL, sem custo de reprocessar/baixar nada). Não mexe em
        // avatar_customizado: se a pessoa já subiu uma foto própria, ela
        // continua valendo por cima da foto do Google até ser revertida
        // de propósito (DELETE /:id/avatar) — sincronizar avatar_url aqui
        // só mantém o "fallback" atualizado por baixo, não muda o que
        // está sendo exibido de fato.
        db.prepare("UPDATE usuarios SET avatar_url = ? WHERE id = ?").run(avatarUrl, usuario.id);
        usuario.avatarUrl = avatarUrl;
    }

    const token = assinarTokenSessao(usuario.id);
    res.json({ ...usuario, token });
});

// GET /api/usuarios/:id
router.get("/:id", (req, res) => {
    const usuario = db.prepare(SELECT_USUARIO).get(req.params.id);
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
    const atualizado = db.prepare(SELECT_USUARIO).get(req.params.id);
    res.json(atualizado);
});

// POST /api/usuarios/:id/avatar — sobe uma foto própria pra conta, que
// passa a valer no lugar da foto do Google em TUDO que mostra esse
// usuário (inclusive o nome/avatar herdado pelos prestadores dele, ver
// formatarPrestador.js). Cortado em quadrado (fit:"cover") — mesmo
// motivo do antigo avatar de prestador: é sempre exibido dentro de um
// círculo, sem crop no servidor um retrato alto ficaria espremido.
router.post("/:id/avatar", receberAvatarUsuario, exigirUsuario, async (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra trocar a foto da própria conta." });
    }
    if (!req.file) return res.status(400).json({ erro: "Envie uma imagem no campo 'foto'." });

    try {
        const destino = path.join(UPLOADS_DIR_AVATAR_USUARIO, `${req.params.id}.webp`);
        await sharp(req.file.buffer)
            .rotate()
            .resize(500, 500, { fit: "cover", position: "centre" })
            .webp({ quality: 85 })
            .toFile(destino);

        // Date.now() (não 1): esse valor dobra como "versão" da foto pra
        // cache-bust no front (?v=..., ver avatarUrlEfetivo em
        // 00-script.js) — precisa mudar a cada upload, senão a URL fica
        // idêntica à de antes e o navegador nunca busca a versão nova.
        const versao = Date.now();
        db.prepare("UPDATE usuarios SET avatar_customizado = ? WHERE id = ?").run(versao, req.params.id);
        res.json({ avatarCustomizado: versao });
    } catch (erro) {
        console.error("Falha ao processar avatar da conta:", erro);
        res.status(400).json({ erro: "Não foi possível processar a imagem enviada. Tente outra foto." });
    }
});

// DELETE /api/usuarios/:id/avatar — volta a usar a foto do Google (que
// continua sincronizada em avatar_url a cada login, ver /entrar-google).
// Não precisa reenviar nada: só desliga a flag; o arquivo customizado
// fica órfão em disco (mesmo tratamento de baixo risco já usado nas
// outras fotos do app — é só espaço, sem custo de exibir nada errado).
router.delete("/:id/avatar", exigirUsuario, (req, res) => {
    if (req.usuario.id !== req.params.id) {
        return res.status(403).json({ erro: "Só dá pra trocar a foto da própria conta." });
    }

    db.prepare("UPDATE usuarios SET avatar_customizado = 0 WHERE id = ?").run(req.params.id);
    fs.rm(path.join(UPLOADS_DIR_AVATAR_USUARIO, `${req.params.id}.webp`), { force: true }, () => {});
    res.status(204).end();
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