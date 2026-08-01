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

// foto_url2/foto_url3: a tela de avaliação passou a ter 3 slots de foto
// (nenhum obrigatório), não só 1 — ver routes/avaliacoes.js
// (salvarFotosAvaliacao) e abrirAvaliarPrestador no front. 3 colunas
// nomeadas em vez de uma tabela separada (avaliacoes_fotos) de propósito:
// é um número FIXO e pequeno de slots (não uma lista de tamanho
// variável), então uma tabela própria só pra 3 linhas por avaliação seria
// complexidade sem ganho real aqui — mesmo raciocínio que já levou a
// foto_url ser coluna direta em vez de tabela desde o início.
if (!colunasAvaliacoes.some(c => c.name === "foto_url2")) {
    db.exec("ALTER TABLE avaliacoes ADD COLUMN foto_url2 TEXT");
    console.log("[db] migração aplicada: avaliacoes.foto_url2");
}
if (!colunasAvaliacoes.some(c => c.name === "foto_url3")) {
    db.exec("ALTER TABLE avaliacoes ADD COLUMN foto_url3 TEXT");
    console.log("[db] migração aplicada: avaliacoes.foto_url3");
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

// ==========================================================================
// SEED — os mesmos 6 prestadores fictícios que hoje vivem no array
// PRESTADORES do script.js. Roda só se a tabela estiver vazia, então dar
// restart no servidor não duplica nem reseta o que já foi cadastrado de
// verdade por cima disso.
// ==========================================================================
const jaTemPrestadores = db.prepare("SELECT COUNT(*) AS total FROM prestadores").get().total > 0;

if (!jaTemPrestadores) {
    const inserir = db.prepare(`
        INSERT INTO prestadores (id, nome, categoria, telefone, cor, lat, lng, horario_abre, horario_fecha, tags, dono_usuario_id, criado_em)
        VALUES (@id, @nome, @categoria, @telefone, @cor, @lat, @lng, @horario_abre, @horario_fecha, @tags, NULL, @criado_em)
    `);

    const demo = [
        { id: "1", nome: "Carlos Mendes", categoria: "Mecânico", tags: ["/all", "mecanico", "motor", "cambio", "carro"], telefone: "(86) 99911-2233", cor: "#2f6fed", lat: -6.4931, lng: -43.7042, horario_abre: 8, horario_fecha: 18 },
        { id: "2", nome: "Fernanda Duarte", categoria: "Arquiteta", tags: ["/all", "Moveis", "Designer", "Casa", "fachada"], telefone: "(86) 99822-1145", cor: "#2f6fed", lat: -6.4968, lng: -43.6998, horario_abre: 9, horario_fecha: 17 },
        { id: "3", nome: "Roberto Silva", categoria: "Borracheiro", tags: ["/all", "mecanico", "Pneu", "peneu"], telefone: "(86) 99733-5566", cor: "#2f6fed", lat: -6.4915, lng: -43.7055, horario_abre: 0, horario_fecha: 24 },
        { id: "4", nome: "Caio Cézar", categoria: "Eletricista Automotivo", tags: ["/all", "eletricista", "eletrica", "bateria", "carro"], telefone: "(86) 99644-7788", cor: "#e0a52f", lat: -6.4990, lng: -43.7010, horario_abre: 7.5, horario_fecha: 19 },
        { id: "5", nome: "Erik Mendes", categoria: "Carpinador de mato", tags: ["/all", "lote", "carpinador", "capinador"], telefone: "(99) 98540-9470", cor: "var(--paper)", lat: -6.4960, lng: -43.7060, horario_abre: 6, horario_fecha: 16 },
        { id: "6", nome: "Marcos Lima", categoria: "Programador", tags: ["/all", "software", "dev", "developer"], telefone: "(86) 99466-2200", cor: "#2f6fed", lat: -6.4900, lng: -43.6995, horario_abre: 10, horario_fecha: 22 }
    ];

    const agora = Date.now();
    const inserirTodos = db.transaction((lista) => {
        lista.forEach(p => inserir.run({ ...p, tags: JSON.stringify(p.tags), criado_em: agora }));
    });
    inserirTodos(demo);

    console.log(`[db] semeados ${demo.length} prestadores de demonstração.`);
}

module.exports = db;