const express = require("express");
const { v4: uuidv4 } = require("uuid");
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
// LIMITE DE CADASTROS + VALIDAÇÃO DE TELEFONE + DUPLICATA
// Sem isso, uma única conta Google (livre pra criar quantas quiser) podia
// encher o mapa de cadastros — inclusive com telefone em qualquer formato,
// nem que fosse "abc". Três camadas, cada uma barrando um abuso diferente:
//   1) LIMITE_PRESTADORES_POR_CONTA — teto por conta (spam grosseiro).
//   2) validarTelefone — recusa string que não é um telefone BR de verdade.
//   3) checagem de duplicata — recusa nome+telefone repetido entre
//      QUALQUER prestador (não só os desta conta), pega tanto o duplo
//      clique quanto tentativa de reclonar um anúncio com conta nova.
// Nenhuma das três impede alguém disposto a criar 3 contas Google
// diferentes pra ter 9 cadastros — isso só uma verificação de telefone
// por SMS resolveria de verdade, e é bem mais trabalho. Isto aqui é a
// barreira barata contra o abuso casual.
// ==========================================================================
const LIMITE_PRESTADORES_POR_CONTA = 3;

// diasSemana vem do front como array de números 0-6 (0=domingo...6=sábado,
// igual Date.getDay()). Filtra qualquer lixo (string, fora de faixa,
// duplicata) e cai em "todos os dias" se sobrar vazio ou não vier nada —
// mesmo fallback que "sem horário = sempre aberto" já usava, estendido
// pra dia da semana.
function normalizarDiasSemana(diasSemana) {
    if (!Array.isArray(diasSemana)) return [0, 1, 2, 3, 4, 5, 6];
    const validos = [...new Set(diasSemana.filter(d => Number.isInteger(d) && d >= 0 && d <= 6))];
    return validos.length > 0 ? validos : [0, 1, 2, 3, 4, 5, 6];
}

function digitosTelefone(telefone) {
    return String(telefone || "").replace(/\D/g, "");
}

// Telefone BR: 10 dígitos (fixo, DDD + 8) ou 11 (celular, DDD + 9), com
// DDD válido (11 a 99 — não existe DDD começando em 0 ou "00"). Não
// valida se o número existe de verdade (só um SMS faria isso), só barra
// o caso óbvio de string aleatória no campo.
function validarTelefone(telefone) {
    const digitos = digitosTelefone(telefone);
    if (digitos.length !== 10 && digitos.length !== 11) return false;
    const ddd = Number(digitos.slice(0, 2));
    return ddd >= 11 && ddd <= 99;
}

// GET /api/prestadores
// Substitui o array PRESTADORES inteiro (demo + cadastrados, já que no
// front os cadastrados eram simplesmente empurrados pro mesmo array).
// A busca por texto/tag/raio continua sendo feita no cliente, igual hoje
// (buscarPrestadores em script.js) — aqui só devolve a lista completa.
router.get("/", (req, res) => {
    const linhas = db.prepare(`${SELECT_PRESTADORES_COM_NOTA} GROUP BY p.id`).all();
    res.json(linhas.map(formatarPrestador));
});

// GET /api/prestadores/meus — cadastrados por ESTE usuário (substitui
// lerPrestadoresCadastrados(), que hoje é "por aparelho" via localStorage;
// com conta real, vira "por usuário" de verdade).
router.get("/meus", exigirUsuario, (req, res) => {
    const linhas = db.prepare(`
        ${SELECT_PRESTADORES_COM_NOTA}
        WHERE p.dono_usuario_id = ?
        GROUP BY p.id
    `).all(req.usuario.id);

    res.json(linhas.map(formatarPrestador));
});

// GET /api/prestadores/:id
router.get("/:id", (req, res) => {
    const linha = db.prepare(`${SELECT_PRESTADORES_COM_NOTA} WHERE p.id = ? GROUP BY p.id`).get(req.params.id);
    if (!linha) return res.status(404).json({ erro: "Prestador não encontrado." });
    res.json(formatarPrestador(linha));
});

// POST /api/prestadores — cadastro de novo prestador.
// Body: { nome, categoria, telefone, tagsTexto (string separada por vírgula,
// igual o campo do form hoje), cor, lat, lng, horarioAbre, horarioFecha }
// horarioAbre/horarioFecha já vêm em hora decimal (ver horaParaDecimal no
// front) — decisão de converter "08:30" pra 8.5 continua no cliente.
router.post("/", exigirUsuario, (req, res) => {
    const nome = sanitizarTexto(req.body.nome, 80);
    const categoria = sanitizarTexto(req.body.categoria, 60);
    const descricao = sanitizarTexto(req.body.descricao, 300) || null;
    const telefone = sanitizarTexto(req.body.telefone, 30);
    const cor = sanitizarTexto(req.body.cor, 30) || "#2f6fed";
    const { lat, lng, horarioAbre, horarioFecha } = req.body;

    if (!nome || !categoria || !telefone || typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ erro: "nome, categoria, telefone, lat e lng são obrigatórios." });
    }

    if (!validarTelefone(telefone)) {
        return res.status(400).json({ erro: "Telefone inválido. Use um número com DDD, ex: (86) 99999-9999." });
    }

    const totalDoUsuario = db.prepare("SELECT COUNT(*) AS total FROM prestadores WHERE dono_usuario_id = ?")
        .get(req.usuario.id).total;
    if (totalDoUsuario >= LIMITE_PRESTADORES_POR_CONTA) {
        return res.status(400).json({ erro: `Você atingiu o limite de ${LIMITE_PRESTADORES_POR_CONTA} cadastros por conta.` });
    }

    // Duplicata checada em memória (não amarrado a índice/coluna
    // normalizada no banco) — a tabela de prestadores é pequena o
    // bastante pra isso não pesar; se crescer muito, vale criar colunas
    // normalizadas e mover pra WHERE do SQL.
    const nomeNormalizado = normalizarTag(nome);
    const telefoneNormalizado = digitosTelefone(telefone);
    const jaExiste = db.prepare("SELECT nome, telefone FROM prestadores").all()
        .some(p => normalizarTag(p.nome) === nomeNormalizado && digitosTelefone(p.telefone) === telefoneNormalizado);
    if (jaExiste) {
        return res.status(409).json({ erro: "Já existe um prestador cadastrado com esse nome e telefone." });
    }

    const tags = ["/all", normalizarTag(categoria)]
        .concat(String(req.body.tagsTexto || "").split(",").map(t => sanitizarTexto(t, 30)).filter(Boolean));

    const prestador = {
        id: uuidv4(),
        nome, categoria, descricao, telefone, cor, lat, lng,
        horario_abre: typeof horarioAbre === "number" ? horarioAbre : null,
        horario_fecha: typeof horarioFecha === "number" ? horarioFecha : null,
        dias_semana: JSON.stringify(normalizarDiasSemana(req.body.diasSemana)),
        tags: JSON.stringify(tags),
        dono_usuario_id: req.usuario.id,
        criado_em: Date.now()
    };

    db.prepare(`
        INSERT INTO prestadores (id, nome, categoria, descricao, telefone, cor, lat, lng, horario_abre, horario_fecha, dias_semana, tags, dono_usuario_id, criado_em)
        VALUES (@id, @nome, @categoria, @descricao, @telefone, @cor, @lat, @lng, @horario_abre, @horario_fecha, @dias_semana, @tags, @dono_usuario_id, @criado_em)
    `).run(prestador);

    const linha = db.prepare(`${SELECT_PRESTADORES_COM_NOTA} WHERE p.id = ? GROUP BY p.id`).get(prestador.id);
    res.status(201).json(formatarPrestador(linha));
});

// DELETE /api/prestadores/:id — só o dono remove (equivalente a
// removerPrestadorCadastrado, mas checando posse de verdade em vez de
// "este aparelho cadastrou").
router.delete("/:id", exigirUsuario, (req, res) => {
    const linha = db.prepare("SELECT dono_usuario_id FROM prestadores WHERE id = ?").get(req.params.id);
    if (!linha) return res.status(404).json({ erro: "Prestador não encontrado." });
    if (linha.dono_usuario_id !== req.usuario.id) {
        return res.status(403).json({ erro: "Só quem cadastrou pode remover." });
    }

    db.prepare("DELETE FROM prestadores WHERE id = ?").run(req.params.id);
    res.status(204).end();
});

// PATCH /api/prestadores/:id — edição pelo dono (tela "Editar" no front,
// mesmo formulário do cadastro reaproveitado com os dados já preenchidos).
// Aceita os mesmos campos do POST; qualquer campo omitido no corpo mantém
// o valor atual. Fotos continuam nas rotas próprias (foto-perfil/
// foto-capa) — esta rota não mexe nelas. Usa exigirDono (definida mais
// abaixo, mas function declaration é hoisted no escopo do módulo) em vez
// de repetir a checagem de posse inline feita no DELETE acima.
router.patch("/:id", exigirUsuario, exigirDono, (req, res) => {
    const atual = db.prepare("SELECT * FROM prestadores WHERE id = ?").get(req.params.id);
    if (!atual) return res.status(404).json({ erro: "Prestador não encontrado." });

    const nome = req.body.nome !== undefined ? sanitizarTexto(req.body.nome, 80) : atual.nome;
    const categoria = req.body.categoria !== undefined ? sanitizarTexto(req.body.categoria, 60) : atual.categoria;
    const descricao = req.body.descricao !== undefined ? (sanitizarTexto(req.body.descricao, 300) || null) : atual.descricao;
    const telefone = req.body.telefone !== undefined ? sanitizarTexto(req.body.telefone, 30) : atual.telefone;
    const lat = typeof req.body.lat === "number" ? req.body.lat : atual.lat;
    const lng = typeof req.body.lng === "number" ? req.body.lng : atual.lng;
    const horarioAbre = typeof req.body.horarioAbre === "number" ? req.body.horarioAbre : atual.horario_abre;
    const horarioFecha = typeof req.body.horarioFecha === "number" ? req.body.horarioFecha : atual.horario_fecha;
    const diasSemana = req.body.diasSemana !== undefined
        ? normalizarDiasSemana(req.body.diasSemana)
        : (atual.dias_semana ? JSON.parse(atual.dias_semana) : [0, 1, 2, 3, 4, 5, 6]);

    if (!nome || !categoria || !telefone || typeof lat !== "number" || typeof lng !== "number") {
        return res.status(400).json({ erro: "nome, categoria, telefone, lat e lng são obrigatórios." });
    }
    if (!validarTelefone(telefone)) {
        return res.status(400).json({ erro: "Telefone inválido. Use um número com DDD, ex: (86) 99999-9999." });
    }

    // mesma checagem de duplicata do POST, mas ignorando o próprio
    // registro — senão editar sem trocar nome/telefone já acusaria
    // "duplicata" dele mesmo.
    const nomeNormalizado = normalizarTag(nome);
    const telefoneNormalizado = digitosTelefone(telefone);
    const duplicado = db.prepare("SELECT nome, telefone FROM prestadores WHERE id != ?").all(req.params.id)
        .some(p => normalizarTag(p.nome) === nomeNormalizado && digitosTelefone(p.telefone) === telefoneNormalizado);
    if (duplicado) {
        return res.status(409).json({ erro: "Já existe um prestador cadastrado com esse nome e telefone." });
    }

    // tagsTexto: se não veio no corpo, preserva as tags extras que já
    // existiam (tudo que não é "/all" nem a tag da categoria antiga); se
    // veio (mesmo vazia), recalcula do zero a partir do texto novo — igual
    // o POST faz na criação.
    let tags;
    if (req.body.tagsTexto !== undefined) {
        tags = ["/all", normalizarTag(categoria)]
            .concat(String(req.body.tagsTexto || "").split(",").map(t => sanitizarTexto(t, 30)).filter(Boolean));
    } else {
        const tagsAtuais = JSON.parse(atual.tags || "[]");
        const categoriaAntigaNormalizada = normalizarTag(atual.categoria);
        const extras = tagsAtuais.filter(t => t !== "/all" && t !== categoriaAntigaNormalizada);
        tags = ["/all", normalizarTag(categoria), ...extras];
    }

    db.prepare(`
        UPDATE prestadores
        SET nome = @nome, categoria = @categoria, descricao = @descricao, telefone = @telefone, lat = @lat, lng = @lng,
            horario_abre = @horario_abre, horario_fecha = @horario_fecha, dias_semana = @dias_semana, tags = @tags
        WHERE id = @id
    `).run({
        id: req.params.id, nome, categoria, descricao, telefone, lat, lng,
        horario_abre: horarioAbre, horario_fecha: horarioFecha,
        dias_semana: JSON.stringify(diasSemana),
        tags: JSON.stringify(tags)
    });

    const linha = db.prepare(`${SELECT_PRESTADORES_COM_NOTA} WHERE p.id = ? GROUP BY p.id`).get(req.params.id);
    res.json(formatarPrestador(linha));
});

// mesma lógica de normalizar() no front (remove acento/caixa pra virar tag)
function normalizarTag(texto) {
    return texto
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .trim();
}

// ==========================================================================
// FOTOS DO PRESTADOR (perfil + até 4 de capa)
// Diferente da foto de avaliação (avaliacoes.js, nome uuid), essas usam
// nome DETERMINÍSTICO a partir do id do prestador — o front monta a URL
// só com o id (fotoPerfilPrestador/fotosCapaPrestador em script.js), sem
// precisar de coluna nova no banco. Subir de novo simplesmente substitui
// o arquivo anterior (mesmo nome).
// Requer duas dependências novas: `npm install multer sharp` (mesmas já
// usadas em avaliacoes.js — se já rodou aquela migração, já estão instaladas).
// ==========================================================================
const UPLOADS_DIR_PERFIL = path.join(__dirname, "../public/uploads/prestadores/perfil");
const UPLOADS_DIR_CAPA = path.join(__dirname, "../public/uploads/prestadores/capa");
fs.mkdirSync(UPLOADS_DIR_PERFIL, { recursive: true });
fs.mkdirSync(UPLOADS_DIR_CAPA, { recursive: true });

const TAMANHO_MAXIMO_FOTO_PRESTADOR = 6 * 1024 * 1024; // 6MB, mesma folga da foto de avaliação

const uploadFotoPrestador = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: TAMANHO_MAXIMO_FOTO_PRESTADOR },
    fileFilter: (req, file, cb) => {
        if (!file.mimetype.startsWith("image/")) return cb(new Error("TIPO_INVALIDO"));
        cb(null, true);
    }
});

// Mesmo padrão de receberFotoOpcional em avaliacoes.js: roda ANTES de
// exigirUsuario de propósito, pra barrar arquivo grande/tipo errado com
// 400 sem gastar uma checagem de auth à toa.
function receberFotoPrestador(req, res, next) {
    uploadFotoPrestador.single("foto")(req, res, (erro) => {
        if (!erro) return next();

        if (erro instanceof multer.MulterError && erro.code === "LIMIT_FILE_SIZE") {
            return res.status(400).json({ erro: `Foto muito grande (máximo ${TAMANHO_MAXIMO_FOTO_PRESTADOR / 1024 / 1024}MB).` });
        }
        if (erro.message === "TIPO_INVALIDO") {
            return res.status(400).json({ erro: "O arquivo enviado precisa ser uma imagem." });
        }
        return res.status(400).json({ erro: "Não foi possível receber a foto enviada." });
    });
}

// Confere que quem está mandando é o dono do prestador — as duas rotas de
// foto abaixo precisam disso além de exigirUsuario (que só confirma QUEM
// está logado, não que essa pessoa é dona DESTE prestador específico).
function exigirDono(req, res, next) {
    const linha = db.prepare("SELECT dono_usuario_id FROM prestadores WHERE id = ?").get(req.params.id);
    if (!linha) return res.status(404).json({ erro: "Prestador não encontrado." });
    if (linha.dono_usuario_id !== req.usuario.id) {
        return res.status(403).json({ erro: "Só quem cadastrou pode alterar as fotos." });
    }
    next();
}

// POST /api/prestadores/:id/foto-perfil — avatar circular do prestador.
// Cortado em quadrado (fit:"cover") porque é sempre exibido dentro de um
// círculo — sem crop no servidor, um retrato alto ficaria espremido/
// cortado errado dependendo de onde o CSS decidisse focar.
router.post("/:id/foto-perfil", receberFotoPrestador, exigirUsuario, exigirDono, async (req, res) => {
    if (!req.file) return res.status(400).json({ erro: "Envie uma imagem no campo 'foto'." });

    try {
        const destino = path.join(UPLOADS_DIR_PERFIL, `${req.params.id}.webp`);
        await sharp(req.file.buffer)
            .rotate()
            .resize(500, 500, { fit: "cover", position: "centre" })
            .webp({ quality: 85 })
            .toFile(destino);
        res.status(204).end();
    } catch (erro) {
        console.error("Falha ao processar foto de perfil do prestador:", erro);
        res.status(400).json({ erro: "Não foi possível processar a foto enviada. Tente outra imagem." });
    }
});

// POST /api/prestadores/:id/foto-capa/:indice — carrossel de até 4 fotos
// (índice 1 a 4; ver fotosCapaPrestador em script.js). Sem crop forçado
// (fit:"inside") porque a capa já é exibida com object-fit:cover no
// front, que resolve o enquadramento na hora de mostrar — aqui só limita
// o tamanho do arquivo guardado.
router.post("/:id/foto-capa/:indice", receberFotoPrestador, exigirUsuario, exigirDono, async (req, res) => {
    const indice = Number(req.params.indice);
    if (!Number.isInteger(indice) || indice < 1 || indice > 4) {
        return res.status(400).json({ erro: "índice precisa ser um número de 1 a 4." });
    }
    if (!req.file) return res.status(400).json({ erro: "Envie uma imagem no campo 'foto'." });

    try {
        const sufixo = indice === 1 ? "" : `-${indice}`;
        const destino = path.join(UPLOADS_DIR_CAPA, `${req.params.id}${sufixo}.webp`);
        await sharp(req.file.buffer)
            .rotate()
            .resize(1200, 900, { fit: "inside", withoutEnlargement: true })
            .webp({ quality: 82 })
            .toFile(destino);
        res.status(204).end();
    } catch (erro) {
        console.error("Falha ao processar foto de capa do prestador:", erro);
        res.status(400).json({ erro: "Não foi possível processar a foto enviada. Tente outra imagem." });
    }
});

module.exports = router;