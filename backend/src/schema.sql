-- ==========================================================================
-- SCHEMA — espelha as chaves que hoje vivem em localStorage no script.js
-- (ver CHAVE_PRESTADORES_CADASTRADOS, CHAVE_PERFIL_USUARIO, CHAVE_CONFIG_APP,
-- CHAVE_AVALIACOES_PENDENTES, CHAVE_CLIQUES_WHATSAPP e o array PRESTADORES).
-- CHAVE_CONFIG_APP NÃO tem tabela aqui — é preferência de aparelho (tema,
-- notificação), não faz sentido morar no servidor. Continua 100% local.
-- ==========================================================================

-- Identidade agora é Google OAuth (google_sub + email) em vez de telefone
-- auto-declarado — ver routes/usuarios.js (POST /entrar-google) e a
-- conversa sobre WebView bloquear OAuth (por isso isso só faz sentido
-- rodando como site normal por enquanto, não dentro do WebView do app).
-- telefone vira opcional: continua podendo ser preenchido no perfil, mas
-- não é mais o que identifica a conta.
CREATE TABLE IF NOT EXISTS usuarios (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    email TEXT UNIQUE,
    google_sub TEXT UNIQUE,
    telefone TEXT,
    criado_em INTEGER NOT NULL
);

-- id em TEXT (não autoincrement) pra poder semear os 6 prestadores de
-- demonstração com ids "1".."6" — mesmos ids que o script.js já usa hoje,
-- então quem já tinha algo salvo (ex: em "salvos") continua batendo.
CREATE TABLE IF NOT EXISTS prestadores (
    id TEXT PRIMARY KEY,
    nome TEXT NOT NULL,
    categoria TEXT NOT NULL,
    telefone TEXT NOT NULL,
    cor TEXT NOT NULL,
    lat REAL NOT NULL,
    lng REAL NOT NULL,
    horario_abre REAL,
    horario_fecha REAL,
    tags TEXT NOT NULL,              -- JSON.stringify(array) — mesma forma que o front já usa
    dono_usuario_id TEXT,            -- quem cadastrou; NULL nos 6 demos (não têm dono real)
    criado_em INTEGER NOT NULL,
    FOREIGN KEY (dono_usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS avaliacoes (
    id TEXT PRIMARY KEY,
    prestador_id TEXT NOT NULL,
    autor_nome TEXT NOT NULL,
    autor_usuario_id TEXT,
    nota INTEGER NOT NULL CHECK (nota BETWEEN 1 AND 5),
    comentario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente', 'publicada', 'rejeitada')),
    via_whatsapp INTEGER NOT NULL DEFAULT 0,
    motivo_rejeicao TEXT,
    expirou_automaticamente INTEGER NOT NULL DEFAULT 0,
    criado_em INTEGER NOT NULL,
    FOREIGN KEY (prestador_id) REFERENCES prestadores(id) ON DELETE CASCADE,
    FOREIGN KEY (autor_usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS cliques_whatsapp (
    prestador_id TEXT NOT NULL,
    usuario_id TEXT NOT NULL,
    criado_em INTEGER NOT NULL,
    PRIMARY KEY (prestador_id, usuario_id),
    FOREIGN KEY (prestador_id) REFERENCES prestadores(id) ON DELETE CASCADE,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE IF NOT EXISTS salvos (
    usuario_id TEXT NOT NULL,
    prestador_id TEXT NOT NULL,
    criado_em INTEGER NOT NULL,
    PRIMARY KEY (usuario_id, prestador_id),
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id),
    FOREIGN KEY (prestador_id) REFERENCES prestadores(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_avaliacoes_prestador ON avaliacoes(prestador_id, status);
CREATE INDEX IF NOT EXISTS idx_salvos_usuario ON salvos(usuario_id);
