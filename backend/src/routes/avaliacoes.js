const express = require("express");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");
const db = require("../db");
const { sanitizarTexto } = require("../utils/sanitizar");
const { exigirUsuario } = require("../middleware/identidade");

const router = express.Router();

// ==========================================================================
// UPLOAD DE FOTO NA AVALIAÇÃO ("Fotos dos clientes" no perfil)
// Fecha a implementação que estava marcada como parcial no front
// (fotosClientesExemplo). Segue a MESMA regra da fila cega: a foto só
// aparece pra qualquer pessoa quando a avaliação for aceita pelo dono
// (status = 'publicada') — antes disso ela existe em disco, mas nenhuma
// rota pública devolve o caminho dela. Convertida sempre pra .webp
// (mesmo padrão dos outros diretórios de foto do app) via sharp, com
// redimensionamento pra não deixar o disco/servidor reféns de uma foto
// de 12MB direto do celular do cliente.
//
// Requer duas dependências novas: `npm install multer sharp`.
// ==========================================================================
const UPLOADS_DIR = path.join(__dirname, "../public/uploads/avaliacoes");
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const TAMANHO_MAXIMO_BYTES = 6 * 1024 * 1024; // 6MB — folga pra foto de celular sem exagero

const upload = multer({
    storage: multer.memoryStorage(), // não grava o arquivo cru; passa pelo sharp antes
    limits: { fileSize: TAMANHO_MAXIMO_BYTES },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) {
            return cb(new Error("TIPO_INVALIDO"));
        }
        cb(null, true);
    }
});

// Envolve upload.single("foto") pra transformar os erros do multer (arquivo
// grande demais, tipo inválido) em JSON 400 igual ao resto da API, em vez
// de deixar cair no handler de erro genérico do Express (que devolveria
// HTML/500). A rota em si só roda se isso chamar next() sem erro.
function receberFotoOpcional(req, res, next) {
    upload.single("foto")(req, res, (erro) => {
        if (!erro) return next();

        if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ erro: `Foto muito grande (máximo ${TAMANHO_MAXIMO_BYTES / 1024 / 1024}MB).` });
        }
        if (erro.message === "TIPO_INVALIDO") {
            return res.status(400).json({ erro: "O arquivo enviado precisa ser uma imagem." });
        }
        return res.status(400).json({ erro: "Não foi possível receber a foto enviada." });
    });
}

// Recebe o buffer em memória, normaliza orientação (fotos de celular vêm
// com EXIF de rotação), redimensiona mantendo proporção e grava como
// .webp com nome próprio (uuid, não amarrado a prestador+índice como os
// exemplos antigos eram — cada avaliação tem no máximo uma foto sua).
// Retorna o caminho público (servido estático, ver server.js) ou null se
// não veio arquivo nenhum (foto é opcional).
async function salvarFotoAvaliacao(file) {
    if (!file) return null;

    const nomeArquivo = `${uuidv4()}.webp`;
    const caminhoAbsoluto = path.join(UPLOADS_DIR, nomeArquivo);

    await sharp(file.buffer)
        .rotate() // aplica a orientação do EXIF e descarta o campo, evita foto "deitada"
        .resize(1600, 1600, { fit: "inside", withoutEnlargement: true })
        .webp({ quality: 82 })
        .toFile(caminhoAbsoluto);

    return `/uploads/avaliacoes/${nomeArquivo}`;
}

// Mesma janela do front (JANELA_TAG_WHATSAPP_MS) — clique muito antigo não
// deveria "endossar" uma avaliação completamente distante no tempo dele.
const JANELA_TAG_WHATSAPP_MS = 60 * 24 * 60 * 60 * 1000;

// POST /api/prestadores/:id/whatsapp-clique
// Substitui registrarCliqueWhatsapp(). Igual ao front hoje, funciona sem
// login (o botão de WhatsApp no perfil não exige estar logado) — sem
// usuário identificado, só não grava nada (não prova contratação mesmo,
// é só uma pista pro prestador lembrar quem é quem na fila cega).
router.post("/prestadores/:id/whatsapp-clique", (req, res) => {
    if (req.usuario) {
        db.prepare(`
            INSERT INTO cliques_whatsapp (prestador_id, usuario_id, criado_em)
            VALUES (?, ?, ?)
            ON CONFLICT(prestador_id, usuario_id) DO UPDATE SET criado_em = excluded.criado_em
        `).run(req.params.id, req.usuario.id, Date.now());
    }
    res.status(204).end();
});

// POST /api/prestadores/:id/avaliacoes — cliente avalia.
// Exige login (mesma regra do front: sem usuarioLogado, nem abre o
// formulário) pra ter uma identidade de verdade por trás, tanto pra fila
// cega quanto pra tag de WhatsApp.
// receberFotoOpcional vem antes de exigirUsuario de propósito: assim, se
// vier um arquivo grande demais ou de tipo errado, o multer já barra com
// 400 antes de gastar uma checagem de auth — mas exigirUsuario continua
// rodando normalmente pros outros casos (não afeta quem já estava
// mandando avaliação sem foto, já que ela é opcional).
router.post("/prestadores/:id/avaliacoes", receberFotoOpcional, exigirUsuario, async (req, res) => {
    const prestador = db.prepare("SELECT id FROM prestadores WHERE id = ?").get(req.params.id);
    if (!prestador) return res.status(404).json({ erro: "Prestador não encontrado." });

    const autorNome = sanitizarTexto(req.body.autorNome, 80) || req.usuario.nome;
    const comentario = sanitizarTexto(req.body.comentario, 500);
    const nota = Number(req.body.nota);

    if (!comentario || !Number.isInteger(nota) || nota < 1 || nota > 5) {
        return res.status(400).json({ erro: "comentario é obrigatório e nota precisa ser um inteiro de 1 a 5." });
    }

    let fotoUrl;
    try {
        fotoUrl = await salvarFotoAvaliacao(req.file);
    } catch (erro) {
        console.error("Falha ao processar foto da avaliação:", erro);
        return res.status(400).json({ erro: "Não foi possível processar a foto enviada. Tente outra imagem." });
    }

    const clique = db.prepare("SELECT criado_em FROM cliques_whatsapp WHERE prestador_id = ? AND usuario_id = ?")
        .get(req.params.id, req.usuario.id);
    const viaWhatsapp = !!clique && (Date.now() - clique.criado_em) < JANELA_TAG_WHATSAPP_MS;

    const avaliacao = {
        id: uuidv4(),
        prestador_id: req.params.id,
        autor_nome: autorNome,
        autor_usuario_id: req.usuario.id,
        nota,
        comentario,
        foto_url: fotoUrl,
        status: "pendente",
        via_whatsapp: viaWhatsapp ? 1 : 0,
        criado_em: Date.now()
    };

    db.prepare(`
        INSERT INTO avaliacoes (id, prestador_id, autor_nome, autor_usuario_id, nota, comentario, foto_url, status, via_whatsapp, criado_em)
        VALUES (@id, @prestador_id, @autor_nome, @autor_usuario_id, @nota, @comentario, @foto_url, @status, @via_whatsapp, @criado_em)
    `).run(avaliacao);

    res.status(201).json({ id: avaliacao.id, status: "pendente", fotoUrl });
});

// GET /api/prestadores/:id/avaliacoes/pendentes — fila cega, só o dono vê.
// Igual renderizarAvaliacoesPendentes(): nunca devolve nota/comentário
// aqui, só o que ajuda a decidir (nome, data, tag de WhatsApp).
router.get("/prestadores/:id/avaliacoes/pendentes", exigirUsuario, (req, res) => {
    const prestador = db.prepare("SELECT dono_usuario_id FROM prestadores WHERE id = ?").get(req.params.id);
    if (!prestador) return res.status(404).json({ erro: "Prestador não encontrado." });
    if (prestador.dono_usuario_id !== req.usuario.id) {
        return res.status(403).json({ erro: "Só o dono do prestador vê a fila de avaliações pendentes." });
    }

    // JOIN com usuarios pra pegar id/avatarUrl/avatarCustomizado de quem
    // avaliou (mesma foto de conta usada no resto do app, ver
    // avatarUrlEfetivo no front) — não muda o que a fila cega já mostra
    // (nota/comentário continuam de fora, só ganhou uma foto ao lado do
    // nome). autorUsuarioId vai junto pro front conseguir tanto aplicar
    // avatarUrlEfetivo (considerar foto própria, não só a do Google)
    // quanto sortear o MESMO placeholder ilustrado que aparece em "Meu
    // perfil"/"Preferências da conta" dessa pessoa quando não há foto
    // nenhuma — sem o id, cada tela sorteava um desenho diferente pra a
    // mesma conta. LEFT JOIN porque autor_usuario_id sempre existe (login
    // obrigatório pra avaliar), mas o usuário pode não ter avatar_url
    // preenchido.
    const pendentes = db.prepare(`
        SELECT a.id, a.autor_nome AS autorNome, a.autor_usuario_id AS autorUsuarioId,
               u.avatar_url AS autorAvatarUrl, u.avatar_customizado AS autorAvatarCustomizado,
               a.via_whatsapp AS viaWhatsapp, a.criado_em AS criadoEm
        FROM avaliacoes a
        LEFT JOIN usuarios u ON u.id = a.autor_usuario_id
        WHERE a.prestador_id = ? AND a.status = 'pendente'
        ORDER BY a.criado_em ASC
    `).all(req.params.id);

    res.json(pendentes.map(p => ({ ...p, viaWhatsapp: !!p.viaWhatsapp, autorAvatarCustomizado: p.autorAvatarCustomizado || 0 })));
});

// POST /api/avaliacoes/:id/aceitar — dono publica.
router.post("/avaliacoes/:id/aceitar", exigirUsuario, (req, res) => {
    const decisao = decidirComoDeOwner(req, res, "publicada");
    if (decisao) res.status(204).end();
});

// POST /api/avaliacoes/:id/rejeitar — dono rejeita, motivo obrigatório
// (mesmo padrão do front: rejeitar exige escolher um motivo, não some sem mais).
router.post("/avaliacoes/:id/rejeitar", exigirUsuario, (req, res) => {
    const motivo = sanitizarTexto(req.body.motivo, 120);
    if (!motivo) return res.status(400).json({ erro: "motivo é obrigatório pra rejeitar." });

    const decisao = decidirComoDeOwner(req, res, "rejeitada", motivo);
    if (decisao) res.status(204).end();
});

// Confere posse e aplica a mudança de status — usado por aceitar/rejeitar
// acima. Retorna true se aplicou (e quem chamou deve responder 204),
// false se já respondeu com erro (404/403/409).
function decidirComoDeOwner(req, res, novoStatus, motivo = null) {
    const avaliacao = db.prepare(`
        SELECT a.status, p.dono_usuario_id
        FROM avaliacoes a
        JOIN prestadores p ON p.id = a.prestador_id
        WHERE a.id = ?
    `).get(req.params.id);

    if (!avaliacao) {
        res.status(404).json({ erro: "Avaliação não encontrada." });
        return false;
    }
    if (avaliacao.dono_usuario_id !== req.usuario.id) {
        res.status(403).json({ erro: "Só o dono do prestador decide essa avaliação." });
        return false;
    }
    if (avaliacao.status !== "pendente") {
        res.status(409).json({ erro: `Essa avaliação já foi decidida (status: ${avaliacao.status}).` });
        return false;
    }

    db.prepare("UPDATE avaliacoes SET status = ?, motivo_rejeicao = ? WHERE id = ?")
        .run(novoStatus, motivo, req.params.id);
    return true;
}

// Caminho salvo no banco é sempre relativo ("/uploads/avaliacoes/x.webp").
// Isso é o que faz sentido guardar (não amarra o registro a um host).
// Mas devolver relativo pro front quebra em qualquer setup onde a página
// não é servida pelo mesmo host:porta do backend (ex: front aberto via
// Live Server/porta 5500, backend rodando na 3000) — o navegador resolve
// "/uploads/..." contra a origem da PÁGINA, não do backend, e a imagem
// nunca carrega. Por isso monta a URL absoluta aqui, na borda da API,
// usando o host que a própria requisição chegou (funciona local e em
// produção, atrás de proxy reverso incluso, sem precisar de env var nova).
function urlAbsolutaFoto(req, caminhoRelativo) {
    if (!caminhoRelativo) return null;
    return `${req.protocol}://${req.get("host")}${caminhoRelativo}`;
}

// GET /api/prestadores/:id/avaliacoes/ultima — a review real mais recente
// publicada (substitui avaliacaoParaExibir). null quando não há nenhuma.
router.get("/prestadores/:id/avaliacoes/ultima", (req, res) => {
    // Mesmo LEFT JOIN da fila de pendentes, pra devolver id/avatarUrl/
    // avatarCustomizado de quem avaliou junto com a review em si (ver
    // avatarUrlEfetivo + ProviderProfileReviewAvatar no front).
    const ultima = db.prepare(`
        SELECT a.autor_nome AS nome, a.autor_usuario_id AS usuarioId,
               u.avatar_url AS avatarUrl, u.avatar_customizado AS avatarCustomizado,
               a.comentario, a.nota, a.foto_url AS fotoUrl
        FROM avaliacoes a
        LEFT JOIN usuarios u ON u.id = a.autor_usuario_id
        WHERE a.prestador_id = ? AND a.status = 'publicada'
        ORDER BY a.criado_em DESC
        LIMIT 1
    `).get(req.params.id);

    if (!ultima) return res.json(null);
    res.json({ ...ultima, avatarCustomizado: ultima.avatarCustomizado || 0, fotoUrl: urlAbsolutaFoto(req, ultima.fotoUrl) });
});

// GET /api/prestadores/:id/fotos-clientes — galeria de fotos reais
// (substitui fotosClientesExemplo do front). Só avaliação PUBLICADA
// entra aqui — mesma regra da fila cega, a foto não vaza antes do dono
// decidir. Nem toda avaliação tem foto (é opcional), por isso o filtro
// foto_url IS NOT NULL. Limita a 12 pra não virar uma grade infinita no
// perfil; mais que isso, a galeria já cumpriu o papel de dar confiança.
router.get("/prestadores/:id/fotos-clientes", (req, res) => {
    const fotos = db.prepare(`
        SELECT foto_url AS src, autor_nome AS autor
        FROM avaliacoes
        WHERE prestador_id = ? AND status = 'publicada' AND foto_url IS NOT NULL
        ORDER BY criado_em DESC
        LIMIT 12
    `).all(req.params.id);

    res.json(fotos.map(f => ({ ...f, src: urlAbsolutaFoto(req, f.src) })));
});

module.exports = router;