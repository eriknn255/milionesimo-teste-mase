require("dotenv").config();
const path = require("path");
const express = require("express");
const cors = require("cors");

require("./db"); // aplica schema + semeia demo antes de tudo

const { identificarUsuario } = require("./middleware/identidade");
const rotasUsuarios = require("./routes/usuarios");
const rotasPrestadores = require("./routes/prestadores");
const rotasAvaliacoes = require("./routes/avaliacoes");
const rotasNotificacoes = require("./routes/notificacoes");
const { iniciarJobExpiracao } = require("./jobs/expirarAvaliacoes");

const app = express();
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());
app.use(identificarUsuario); // anexa req.usuario (ou null) em toda request

// Fotos/vídeos servidos direto da raiz de public/<id>/... (capa, avatar,
// reviews — ver "PASTA POR PRESTADOR"/"PASTA POR USUÁRIO" em
// routes/prestadores.js e routes/usuarios.js). Sem segmento "/uploads"
// no meio: quanto menos nível fixo precisa bater igual entre o caminho
// que o front monta e o que o back grava, menor a chance de os dois
// dessincronizarem de novo (foi exatamente isso que quebrou antes — front
// e back concordavam em tudo, MENOS na ordem de "capa" vs "<id>").
app.use(express.static(path.join(__dirname, "public")));

app.use("/api/usuarios", rotasUsuarios);
app.use("/api/prestadores", rotasPrestadores);
app.use("/api", rotasAvaliacoes); // /api/prestadores/:id/avaliacoes*, /api/avaliacoes/:id/*
app.use("/api/notificacoes", rotasNotificacoes);

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