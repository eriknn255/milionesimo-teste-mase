const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");
require("dotenv").config();

const DB_PATH = process.env.DB_PATH || "./data/mase.db";
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const db = new Database(DB_PATH);
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

const schema = fs.readFileSync(path.join(__dirname, "schema.sql"), "utf8");
db.exec(schema);

// ==========================================================================
// MIGRAÇÕES — mudanças de estrutura em bancos que já existiam antes da
// coluna ser criada (dev local, banco de alguém que já tinha dado
// `npm run dev` antes desta mudança). NÃO fica no schema.sql porque
// SQLite não aceita "ALTER TABLE ... ADD COLUMN IF NOT EXISTS" (só
// CREATE TABLE aceita IF NOT EXISTS) — reexecutar um ALTER TABLE puro a
// cada start quebra com "duplicate column name". Por isso cada migração
// aqui se guarda checando antes se já foi aplicada.
//
// foto_url: caminho da foto opcional enviada junto da avaliação (galeria
// "Fotos dos clientes" no perfil — ver routes/avaliacoes.js).
// ==========================================================================
const colunasAvaliacoes = db.prepare("PRAGMA table_info(avaliacoes)").all();
if (!colunasAvaliacoes.some(c => c.name === "foto_url")) {
    db.exec("ALTER TABLE avaliacoes ADD COLUMN foto_url TEXT");
    console.log("[db] migração aplicada: avaliacoes.foto_url");
}

// avatar_url: foto de perfil do Google (payload.picture do ID token),
// guardada no login — ver routes/usuarios.js. É só uma URL do CDN do
// Google (lh3.googleusercontent.com), não um arquivo nosso; guardamos
// pra não precisar chamar o Google de novo a cada carregamento de perfil.
const colunasUsuarios = db.prepare("PRAGMA table_info(usuarios)").all();
if (!colunasUsuarios.some(c => c.name === "avatar_url")) {
    db.exec("ALTER TABLE usuarios ADD COLUMN avatar_url TEXT");
    console.log("[db] migração aplicada: usuarios.avatar_url");
}

// cpf_cnpj: número declarado pela própria conta (ver POST /entrar-google
// não mexe nisso — só PATCH /:id, editável em "Preferências da conta").
// NÃO é validado contra a Receita Federal nem confere identidade — é só
// dígitos armazenados como texto (com formatação aplicada na hora de
// exibir, não na hora de salvar). Guardado como TEXT (não INTEGER) por
// dois motivos: CPF pode começar com zero (perderia o dígito num campo
// numérico) e o valor nunca é usado em conta matemática, só comparação/
// exibição. NULL = não informado (selo não aparece — ver
// SELECT_PRESTADORES_COM_NOTA em formatarPrestador.js).
if (!colunasUsuarios.some(c => c.name === "cpf_cnpj")) {
    db.exec("ALTER TABLE usuarios ADD COLUMN cpf_cnpj TEXT");
    console.log("[db] migração aplicada: usuarios.cpf_cnpj");
}

// dias_semana: array JSON de dias em que o prestador funciona (ver
// routes/prestadores.js e formatarPrestador.js) — NULL/coluna ausente
// continua se comportando como "todos os dias", igual sempre foi.
const colunasPrestadores = db.prepare("PRAGMA table_info(prestadores)").all();
if (!colunasPrestadores.some(c => c.name === "dias_semana")) {
    db.exec("ALTER TABLE prestadores ADD COLUMN dias_semana TEXT");
    console.log("[db] migração aplicada: prestadores.dias_semana");
}

// descricao: texto livre opcional do prestador, exibido na seção "Sobre"
// do perfil público (ver routes/prestadores.js e formatarPrestador.js) —
// NULL/coluna ausente vira estado vazio no front (perfil mostra "Este
// prestador ainda não escreveu uma descrição."), nunca um erro.
if (!colunasPrestadores.some(c => c.name === "descricao")) {
    db.exec("ALTER TABLE prestadores ADD COLUMN descricao TEXT");
    console.log("[db] migração aplicada: prestadores.descricao");
}

module.exports = db;