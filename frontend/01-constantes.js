/* ==========================================================================
   CONSTANTES E CONFIGURAÇÃO GLOBAL
   Tudo aqui é dado estático/config, sem lógica. Precisa carregar ANTES de
   00-script.js e 03-init-app.js, que usam essas constantes.
   ========================================================================== */

// --- Dias da semana / horário de funcionamento ---
const NOMES_DIAS_ABREV = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const HORARIOS_OPCOES = Array.from({ length: 48 }, (_, i) => {
    const h = String(Math.floor(i / 2)).padStart(2, "0");
    const m = i % 2 === 0 ? "00" : "30";
    return `${h}:${m}`;
});

// --- Categorias / chips de busca ---
const CATEGORIAS_CHIPS = [
    { label: "Todos", query: "/all" },
    { label: "Aberto agora", filtro: "aberto" },
    { label: "Mecânico", query: "mecânico" },
    { label: "Borracheiro", query: "borracheiro" },
    { label: "Eletricista", query: "eletricista" },
    { label: "Arquiteta", query: "arquiteta" },
    { label: "Jardinagem", query: "carpinador" },
    { label: "Programador", query: "programador" }
];
const QUERIES_SUGESTAO_VAZIO = ["mecânico", "eletricista", "borracheiro"];

// --- Mapa ---
const TIPO_MAPA_INICIAL = "hybrid"; // pra trocar o tipo inicial do mapa, mude só aqui

// --- Cadastro de prestador ---
const PALETA_CORES_CADASTRO = ["#2f6fed", "#e0a52f", "#1c7a5e", "#8a4fd1"];
const MAP_ID_CADASTRO = "11668dd49e3ef62fd70c9df8";

// --- API / backend ---
const API_BASE = "https://mase-ec2.ruexinternet/api";
const UPLOADS_BASE = API_BASE.replace(/\/api$/, "");
const LIMITE_PRESTADORES_POR_CONTA = 3;
const GOOGLE_CLIENT_ID = "131029563564-25fb10maaduh4ki6nu8pspqohp8kg49c.apps.googleusercontent.com";

// --- Configurações do app (localStorage) ---
const CHAVE_CONFIG_APP = "mase_config_app";
const CONFIG_APP_PADRAO = { notifPush: true, temaControles: "dinamico", raioMaximoKm: null };

// --- Sessão do usuário (localStorage) ---
const CHAVE_USUARIO_ID = "mase_usuario_id";
const CHAVE_TOKEN_SESSAO = "mase_token_sessao"; // JWT assinado pelo servidor, ver middleware/identidade.js

// --- Busca ---
const ATRASO_BUSCA_MS = 300;

// --- Notificações (sino) ---
// Intervalo do polling de "há notificação nova?" enquanto o app está
// aberto e a conta está logada (ver 07-notificacoes.js). 30s é frequente
// o bastante pra parecer "quase em tempo real" sem virar um efeito
// DDoS-caseiro no próprio servidor — nada aqui precisa de WebSocket ainda.
const ATRASO_POLLING_NOTIFICACOES_MS = 30 * 1000;

// --- Placeholders de imagem ---
const CAPA_PLACEHOLDER = "/img/placeholders/capa-placeholder.webp";
const AVATAR_PLACEHOLDER = [
    "/img/placeholders/avatar-placeholder-1.webp",
    "/img/placeholders/avatar-placeholder-2.webp",
    "/img/placeholders/avatar-placeholder-3.webp",
    "/img/placeholders/avatar-placeholder-4.webp",
    "/img/placeholders/avatar-placeholder-5.webp",
    "/img/placeholders/avatar-placeholder-6.webp",
];


// --- Perfil do prestador ---
const INTERVALO_ROTACAO_CAPA_MS = 2500;

// --- Avaliações ---
const PRAZO_AVALIACAO_DIAS = 1;
const PRAZO_AVALIACAO_MS = PRAZO_AVALIACAO_DIAS * 24 * 60 * 60 * 1000;
