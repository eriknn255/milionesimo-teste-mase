require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

require("./db"); // aplica schema + semeia demo antes de tudo

const { identificarUsuario } = require("./middleware/identidade");
const rotasUsuarios = require("./routes/usuarios");
const rotasPrestadores = require("./routes/prestadores");
const rotasAvaliacoes = require("./routes/avaliacoes");
const { iniciarJobExpiracao } = require("./jobs/expirarAvaliacoes");

const app = express();

app.use(cors());
app.use(express.json());
app.use(identificarUsuario); // anexa req.usuario (ou null) em toda request

// Fotos servidas do mesmo jeito que fotoPerfilPrestador/fotoCapaPrestador/
// fotoServicoPrestador já esperam: /mase/img/prestadores/... — então o
// front nem muda essas 3 funções quando o backend entrar no ar, só passa
// a apontar pra esse servidor em vez de um arquivo estático solto.
const IMG_DIR = process.env.IMG_DIR || path.join(__dirname, "..", "public", "img");
app.use("/uploads", express.static(path.join(__dirname, "public/uploads")));

app.use("/api/usuarios", rotasUsuarios);
app.use("/api/prestadores", rotasPrestadores);
app.use("/api", rotasAvaliacoes); // /api/prestadores/:id/avaliacoes*, /api/avaliacoes/:id/*

app.get("/api/saude", (req, res) => res.json({ ok: true }));

app.use((req, res) => res.status(404).json({ erro: "Rota não encontrada." }));

// Handler de erro genérico — evita vazar stack trace pro cliente em
// produção, mas loga completo no servidor pra debugar.
app.use((erro, req, res, next) => {
    console.error(erro);
    res.status(500).json({ erro: "Erro interno." });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`[mase-backend] rodando em http://localhost:${PORT}`);
    iniciarJobExpiracao();
});
