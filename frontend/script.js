console.log("[maps.js] versão carregada: cone-svg-v2");

(g => { var h, a, k, p = "The Google Maps JavaScript API", c = "google", l = "importLibrary", q = "__ib__", m = document, b = window; b = b[c] || (b[c] = {}); var d = b.maps || (b.maps = {}), r = new Set, e = new URLSearchParams, u = () => h || (h = new Promise(async (f, n) => { await (a = m.createElement("script")); e.set("libraries", [...r] + ""); for (k in g) e.set(k.replace(/[A-Z]/g, t => "_" + t[0].toLowerCase()), g[k]); e.set("callback", c + ".maps." + q); a.src = `https://maps.${c}apis.com/maps/api/js?` + e; d[q] = f; a.onerror = () => h = n(Error(p + " could not load.")); a.nonce = m.querySelector("script[nonce]")?.nonce || ""; m.head.append(a) })); d[l] ? console.warn(p + " only loads once. Ignoring:", g) : d[l] = (f, ...n) => r.add(f) && u().then(() => d[l](f, ...n)) })({
    key: "AIzaSyDkEjDu9Ke6GPJN2Lw95Nk4JBRN6OcNVEU",
    v: "weekly",
});

/* Dados fictícios de demonstração antigos ficavam fixos aqui — agora vêm
   do backend (ver "LISTA DE PRESTADORES" logo abaixo, carregarPrestadores()),
   semeados no banco por backend/src/db.js com esses mesmos 6 registros. */

/* ==========================================================================
   HORÁRIO DE FUNCIONAMENTO / "ABERTO AGORA"
   horario.abre / horario.fecha em horas decimais (0–24, ex: 7.5 = 07:30).
   estaAberto() compara com a hora local do dispositivo do usuário — sem
   dado de fuso próprio, assume-se o mesmo fuso de quem está usando o app.
   Prestador sem campo "horario" é tratado como sempre aberto (fallback).
   ========================================================================== */
function estaAberto(prestador) {
    if (!prestador.horario) return true;
    const agora = new Date();
    const horaAtual = agora.getHours() + agora.getMinutes() / 60;
    const { abre, fecha } = prestador.horario;
    // suporta virada de dia (ex: abre 22, fecha 6 → aberto durante a madrugada)
    if (abre <= fecha) {
        return horaAtual >= abre && horaAtual < fecha;
    }
    return horaAtual >= abre || horaAtual < fecha;
}

function formatarHora(horaDecimal) {
    const h = Math.floor(horaDecimal);
    const m = Math.round((horaDecimal % 1) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function horarioTextoPrestador(prestador) {
    if (!prestador.horario) return "";
    if (prestador.horario.abre === 0 && prestador.horario.fecha === 24) return "Aberto 24h";
    return `${formatarHora(prestador.horario.abre)} – ${formatarHora(prestador.horario.fecha)}`;
}

/* Badge reaproveitado no popup do mapa, no perfil e na lista de resultados.
   Cor segue o mesmo sistema do resto do app: esmeralda = positivo/aberto,
   tom neutro (--muted) = fechado, sem soar como erro. */
function badgeHorarioHTML(prestador) {
    const aberto = estaAberto(prestador);
    const classe = aberto ? "StatusBadge StatusBadge--aberto" : "StatusBadge StatusBadge--fechado";
    const texto = aberto ? "Aberto agora" : "Fechado agora";
    const horarioTexto = horarioTextoPrestador(prestador);
    return `<span class="${classe}">${texto}</span>${horarioTexto ? `<span class="StatusBadgeHorario">${horarioTexto}</span>` : ""}`;
}

/* ==========================================================================
   CATEGORIAS — fonte única de verdade. Alimenta os chips do ChipsRow
   (renderizarChips) e as sugestões do estado vazio (subconjunto, ver
   QUERIES_SUGESTAO_VAZIO) — mudar aqui reflete nos dois lugares. O chip
   "Todos" usa a tag "/all", presente em todo prestador só pra isso.
   ========================================================================== */
const CATEGORIAS_CHIPS = [
    { label: "Todos", query: "/all" },
    { label: "Aberto agora", query: "/aberto" },
    { label: "Mecânico", query: "mecânico" },
    { label: "Borracheiro", query: "borracheiro" },
    { label: "Eletricista", query: "eletricista" },
    { label: "Arquiteta", query: "arquiteta" },
    { label: "Jardinagem", query: "carpinador" },
    { label: "Programador", query: "programador" }
];

// Query especial: "/aberto" não é um texto de busca normal, é resolvida à
// parte em buscarPrestadores() checando estaAberto(prestador) em vez de
// comparar contra nome/categoria/tags (igual "/all" já fazia via tag, mas
// "aberto agora" muda com o relógio, não dá pra guardar como tag fixa).
const QUERY_ABERTO_AGORA = "/aberto";

const QUERIES_SUGESTAO_VAZIO = ["mecânico", "eletricista", "borracheiro"];

/* Gera os botões do ChipsRow a partir de CATEGORIAS_CHIPS. Roda em
   iniciarUI() — antes do Maps carregar — pra já aparecer no primeiro
   paint; os cliques só são vinculados depois de renderizar. */
function renderizarChips() {
    const container = document.getElementById("chipsRow");
    if (!container) return;
    container.innerHTML = CATEGORIAS_CHIPS
        .map(cat => `<button type="button" class="Chip ThemedControl" data-query="${cat.query}">${cat.label}</button>`)
        .join("");
}

/* ==========================================================================
   TEMA CLARO/ESCURO DOS CONTROLES (.ThemedControl)
   Roda fora do initApp() de propósito: se dependesse do Maps carregar, os
   ícones ficariam invisíveis (escuro sobre o Dock escuro) até a API
   responder. "Dinâmico" segue o tipo de mapa (satélite → claro, roadmap →
   escuro); "Claro"/"Escuro" (Configurações → Aparência) fixam o estilo.
   ========================================================================== */
const TIPO_MAPA_INICIAL = "roadmap"; // pra trocar o tipo inicial do mapa, mude só aqui

let preferenciaTemaControles = "dinamico"; // "dinamico" | "claro" | "escuro" — carregado de mase_config_app

function ehTipoSatelite(tipo) {
    return tipo === "hybrid" || tipo === "satellite";
}

// Decide se os controles devem ficar no estilo "escuro" (fundo --ink,
// classe .theme-vector) dado o tipo de mapa atual e a preferência salva.
function resolverTemaEscuro(satelite) {
    if (preferenciaTemaControles === "claro") return false;
    if (preferenciaTemaControles === "escuro") return true;
    return !satelite; // dinâmico: comportamento original
}

function aplicarTemaControles(escuro) {
    document.querySelectorAll(".ThemedControl").forEach(el => {
        el.classList.toggle("theme-vector", escuro);
    });
}

// Reaplica o tema pro estado atual do mapa (ou o inicial, se o mapa ainda
// não carregou) — chamada tanto ao trocar a preferência em Configurações
// quanto quando o próprio mapa muda de tipo.
function aplicarTemaPreferencia() {
    const satelite = map ? ehTipoSatelite(map.getMapTypeId()) : ehTipoSatelite(TIPO_MAPA_INICIAL);
    aplicarTemaControles(resolverTemaEscuro(satelite));
}

function sincronizarTemaComMapa() {
    if (!map) return;
    aplicarTemaControles(resolverTemaEscuro(ehTipoSatelite(map.getMapTypeId())));
}

/* ==========================================================================
   NAVEGAÇÃO ENTRE ABAS (Home / Perfil / Menu)
   Só a Home tem conteúdo de verdade (mapa, busca etc.) por enquanto — as
   outras duas são páginas vazias, e a troca do Dock (ícone oco → cheio)
   já basta pra indicar qual está selecionada. Isso roda por fora do
   initApp() de propósito: não depende do Google Maps carregar pra
   funcionar, e o Dock já responde ao toque mesmo se a API estiver lenta.
   ========================================================================== */
function trocarAba(pagina) {
    document.querySelectorAll(".Dock button[data-page]").forEach(botao => {
        botao.classList.toggle("is-active", botao.dataset.page === pagina);
    });

    document.querySelectorAll(".Page").forEach(pagina_el => {
        pagina_el.classList.toggle("is-active", pagina_el.id === `page-${pagina}`);
    });

    // A Home fica com display:none enquanto outra aba está ativa; ao voltar,
    // o mapa precisa recalcular o próprio tamanho, senão alguns componentes
    // internos do Google Maps ficam com a noção errada das dimensões.
    if (pagina === "home" && typeof map !== "undefined" && map) {
        google.maps.event.trigger(map, "resize");
    }

    // A lista de salvos é reconstruída toda vez que a aba abre, não só uma
    // vez — assim ela sempre reflete o estado mais recente (ex: usuário
    // salvou/removeu um prestador no perfil e voltou pra cá).
    if (pagina === "List") {
        renderizarPaginaSalvos();
    }
}

// Tudo aqui depende do <body> já existir (querySelectorAll teria que achar
// os botões do Dock). Como script.js é carregado no <head> sem defer, ele
// executa ANTES do body ser parseado — então isso só pode rodar depois do
// DOMContentLoaded (ou direto, se por algum motivo o DOM já estiver pronto).
/* ==========================================================================
   CADASTRO DE PRESTADOR — agora via API (POST/DELETE /api/prestadores)
   Exige estar logado (usuarioId), igual o backend exige o header
   x-usuario-id — ver middleware/identidade.js. O prestador criado já
   nasce com dono_usuario_id = usuarioId, então "meus cadastros" (ver
   renderizarMeusCadastros) é uma pergunta real ao servidor agora
   (GET /prestadores/meus), não mais um filtro em localStorage.
   ========================================================================== */
const PALETA_CORES_CADASTRO = ["#2f6fed", "#e0a52f", "#1c7a5e", "#8a4fd1"];

function horaParaDecimal(horaTexto) {
    const [h, m] = horaTexto.split(":").map(Number);
    return h + (m || 0) / 60;
}

/* Posição usada pro novo cadastro: a localização real do usuário quando já
   disponível (mesma referência usada no cálculo de distância da busca),
   com fallback pro centro do mapa se o GPS ainda não respondeu. */
function posicaoParaCadastro() {
    if (usuarioLat !== null && usuarioLng !== null) {
        return { lat: usuarioLat, lng: usuarioLng };
    }
    if (map) {
        const centro = map.getCenter();
        return { lat: centro.lat(), lng: centro.lng() };
    }
    return { lat: -6.4947435, lng: -43.7023851 }; // fallback: centro fixo original do mapa
}

/* ==========================================================================
   MAPA SELETOR DE LOCALIZAÇÃO (formulário de cadastro de prestador)
   Antes, todo cadastro nascia na posição atual do usuário no mapa
   principal — sem chance de ajustar. Agora cada cadastro tem seu próprio
   mini-mapa com um pino arrastável, iniciado na posição atual só como
   ponto de partida (toca ou arrasta pra mudar). Usa o mesmo mapId do
   mapa principal (ver <gmp-map id="map"> no index.html) — precisa ser
   um mapId com Advanced Markers habilitado no Google Cloud Console.
   Instância única reaproveitada entre aberturas do formulário dentro da
   mesma sessão do overlay (criar um google.maps.Map novo a cada abertura
   vaza memória e é desnecessário).
   ========================================================================== */
const MAP_ID_CADASTRO = "11668dd49e3ef62f968278aa";

let cadastroMapPickerMap = null;
let cadastroMapPickerMarker = null;
let cadastroPontoEscolhido = null;

async function inicializarMapaCadastro(pontoInicial) {
    const container = document.getElementById("cadastroMapPicker");
    if (!container) return;

    cadastroPontoEscolhido = pontoInicial;

    if (!cadastroMapPickerMap) {
        await Promise.all([
            google.maps.importLibrary("maps"),
            google.maps.importLibrary("marker")
        ]);

        container.innerHTML = `<gmp-map id="cadastroMapPickerEl" center="${pontoInicial.lat},${pontoInicial.lng}" zoom="16" map-id="${MAP_ID_CADASTRO}"></gmp-map>`;
        await customElements.whenDefined("gmp-map");
        cadastroMapPickerMap = document.getElementById("cadastroMapPickerEl").innerMap;

        // "cooperative" (padrão) em vez de "greedy": arrastar o MAPA em si
        // pede 2 dedos, então 1 dedo continua rolando a tela do formulário
        // normalmente. Arrastar o PINO (marker) é uma interação à parte,
        // funciona com 1 dedo de qualquer jeito — só tocar no mapa (sem
        // arrastar) também sempre conta como clique, mesmo em "cooperative".
        cadastroMapPickerMap.setOptions({ disableDefaultUI: true, zoomControl: true });

        cadastroMapPickerMarker = new google.maps.marker.AdvancedMarkerElement({
            map: cadastroMapPickerMap,
            position: pontoInicial,
            gmpDraggable: true
        });

        cadastroMapPickerMarker.addListener("dragend", () => {
            const pos = cadastroMapPickerMarker.position;
            cadastroPontoEscolhido = { lat: pos.lat, lng: pos.lng };
        });

        cadastroMapPickerMap.addListener("click", (evento) => {
            const pos = { lat: evento.latLng.lat(), lng: evento.latLng.lng() };
            cadastroMapPickerMarker.position = pos;
            cadastroPontoEscolhido = pos;
        });
    } else {
        // Reabrindo o formulário (novo cadastro ou depois de cancelar):
        // reposiciona em vez de recriar, e força o mapa a remedir o
        // tamanho do container — ele estava com display:none até agora,
        // e o Google Maps mede 0x0 nesse estado se não for avisado.
        cadastroMapPickerMap.setCenter(pontoInicial);
        cadastroMapPickerMarker.position = pontoInicial;
        google.maps.event.trigger(cadastroMapPickerMap, "resize");
    }
}

async function salvarPrestadorCadastrado(dados, posicao = posicaoParaCadastro()) {
    const corpo = {
        nome: dados.nome,
        categoria: dados.categoria,
        telefone: dados.telefone,
        tagsTexto: dados.tags, // texto cru "fiação, curto, instalação" — o backend que separa e normaliza
        cor: PALETA_CORES_CADASTRO[Math.floor(Math.random() * PALETA_CORES_CADASTRO.length)],
        lat: posicao.lat,
        lng: posicao.lng,
        horarioAbre: horaParaDecimal(dados.horarioAbre),
        horarioFecha: horaParaDecimal(dados.horarioFecha)
    };

    const resp = await fetch(`${API_BASE}/prestadores`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-usuario-id": usuarioId },
        body: JSON.stringify(corpo)
    });

    if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.erro || `Não foi possível cadastrar (HTTP ${resp.status}).`);
    }

    const novoPrestador = mapearPrestadorDoBackend(await resp.json());
    PRESTADORES.push(novoPrestador); // já aparece nas buscas nesta mesma sessão, sem precisar recarregar a lista inteira
    return novoPrestador;
}

// Mesmo formato de corpo do POST acima — o backend aceita os dois campos
// de novo (PATCH), só que como edição de um prestador já existente. Usada
// pela tela "Editar" (abrirCadastroPrestador → mesmo wizard, pré-preenchido).
async function atualizarPrestadorCadastrado(id, dados, posicao = posicaoParaCadastro()) {
    const corpo = {
        nome: dados.nome,
        categoria: dados.categoria,
        telefone: dados.telefone,
        tagsTexto: dados.tags,
        lat: posicao.lat,
        lng: posicao.lng,
        horarioAbre: horaParaDecimal(dados.horarioAbre),
        horarioFecha: horaParaDecimal(dados.horarioFecha)
    };

    const resp = await fetch(`${API_BASE}/prestadores/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", "x-usuario-id": usuarioId },
        body: JSON.stringify(corpo)
    });

    if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.erro || `Não foi possível salvar (HTTP ${resp.status}).`);
    }

    const atualizado = mapearPrestadorDoBackend(await resp.json());
    const idx = PRESTADORES.findIndex(p => p.id === id);
    if (idx !== -1) PRESTADORES[idx] = atualizado; // reflete a edição nesta sessão sem recarregar a lista inteira
    return atualizado;
}

async function removerPrestadorCadastrado(id) {
    const resp = await fetch(`${API_BASE}/prestadores/${id}`, {
        method: "DELETE",
        headers: { "x-usuario-id": usuarioId }
    });

    if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.erro || `Não foi possível remover (HTTP ${resp.status}).`);
    }

    const indice = PRESTADORES.findIndex(p => String(p.id) === String(id));
    if (indice !== -1) PRESTADORES.splice(indice, 1);
}

/* ==========================================================================
   BACKEND — base da API
   Ajuste aqui quando o backend for pra produção (hoje aponta pro servidor
   local rodando via `npm run dev`, ver backend/README.md).
   ========================================================================== */
const API_BASE = "https://mase-ec2.ruexinternet.com/api";

// Mesma origem do backend, sem o "/api" — usada pra montar URL de imagem
// estática servida por ele (ver fotoPerfilPrestador etc.). Caminho
// relativo tipo "/uploads/..." resolve contra a origem da PÁGINA, não do
// backend — se o front for servido numa porta/domínio diferente do
// backend, a imagem nunca carrega, por isso monta absoluta com
// UPLOADS_BASE.
const UPLOADS_BASE = API_BASE.replace(/\/api$/, "");

// Mesmo teto do backend (LIMITE_PRESTADORES_POR_CONTA em prestadores.js) —
// usado só pra UI (desabilitar/avisar antes de tentar); quem barra de
// verdade é o servidor, isso aqui é só feedback antecipado.
const LIMITE_PRESTADORES_POR_CONTA = 3;

// Client ID do OAuth do Google (tipo "Web application"), criado em
// https://console.cloud.google.com/apis/credentials. PRECISA bater com o
// GOOGLE_CLIENT_ID do backend (.env) — é a audiência que o servidor
// confere ao validar o token. Só funciona rodando como site normal (fora
// do WebView do app) — ver conversa sobre o Google bloquear OAuth em
// WebView embutida.
const GOOGLE_CLIENT_ID = "131029563564-25fb10maaduh4ki6nu8pspqohp8kg49c.apps.googleusercontent.com";

/* ==========================================================================
   LISTA DE PRESTADORES — agora vem do backend (GET /api/prestadores) em vez
   de um array fixo. Fica "let" (não mais "const") porque é substituída por
   inteiro quando a resposta chega — funções em outros pontos do arquivo
   continuam lendo a variável global PRESTADORES normalmente, sem precisar
   saber se ela já foi populada ou ainda está no array vazio inicial.

   O backend devolve nota como objeto ({quantidade, media}) — mantido assim
   aqui de propósito (não achatado pra um número). "Sem avaliação" (quantidade
   0, media null) é um estado real que a UI precisa distinguir de "nota
   0.0" — achatar pra `nota.media ?? 0` faz um prestador sem review nenhum
   mostrar "★ 0.0 (0 avaliações)", que parece uma nota ruim de verdade e
   não é. Ver textoNotaPrestador() logo abaixo, usado em todo lugar que
   exibe nota.
   ========================================================================== */
let PRESTADORES = [];

function mapearPrestadorDoBackend(p) {
    return {
        id: p.id,
        nome: p.nome,
        categoria: p.categoria,
        telefone: p.telefone,
        cor: p.cor,
        lat: p.lat,
        lng: p.lng,
        tags: p.tags,
        horario: p.horario,
        donoUsuarioId: p.donoUsuarioId,
        nota: p.nota
    };
}

// Texto pronto pra qualquer card (lista, salvos, popup do mapa, perfil).
// temNota=false quando não há avaliação real — quem chama decide a marcação
// (classe CSS is-empty, omitir contagem, etc.), aqui só o texto.
function textoNotaPrestador(nota) {
    if (!nota || nota.quantidade === 0) {
        return { temNota: false, estrelas: "Nenhuma avaliação", contagem: "" };
    }

    return {
        temNota: true,
        estrelas: `★ ${nota.media.toFixed(1)}`,
        contagem: `${nota.quantidade} avaliaç${nota.quantidade === 1 ? "ão" : "ões"}`
    };
}

async function carregarPrestadores() {
    try {
        const resp = await fetch(`${API_BASE}/prestadores`);
        if (!resp.ok) throw new Error(`GET /prestadores respondeu ${resp.status}`);

        const dados = await resp.json();
        PRESTADORES = dados.map(mapearPrestadorDoBackend);
    } catch (erro) {
        // Backend fora do ar (ex: esqueceu de rodar `npm run dev`) não pode
        // travar o app inteiro — cai pra lista vazia e loga o motivo. Busca
        // simplesmente não vai encontrar ninguém até o backend voltar.
        console.warn("Não foi possível carregar prestadores do backend:", erro);
        PRESTADORES = [];
    }
}

// Dispara assim que o script carrega (fora de iniciarUI/initApp de
// propósito) — corre em paralelo com o carregamento do Maps, então na
// prática já está pronto bem antes do usuário conseguir digitar algo.
carregarPrestadores();

/* ==========================================================================
   LISTA DE SALVOS — agora via API (GET/POST/DELETE /api/usuarios/:id/salvos)
   idsSalvosSet é um cache local (Set de ids em string) sincronizado com o
   backend: carregado no login/restaurarSessao e sempre que a aba Salvos é
   aberta (renderizarPaginaSalvos busca a lista fresca e realinha o Set).
   Serve pra prestadorEstaSalvo() responder na hora (síncrono) sem precisar
   de um fetch a cada perfil aberto — o toggle em si (alternarPrestadorSalvo)
   é que fala com o servidor de verdade.
   ========================================================================== */
let idsSalvosSet = new Set();

async function carregarIdsSalvos() {
    if (!usuarioLogado) {
        idsSalvosSet = new Set();
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}/salvos`, {
            headers: { "x-usuario-id": usuarioId }
        });
        if (!resp.ok) throw new Error(`GET /usuarios/${usuarioId}/salvos respondeu ${resp.status}`);

        const salvos = await resp.json();
        idsSalvosSet = new Set(salvos.map(p => String(p.id)));
    } catch (erro) {
        console.warn("Não foi possível carregar a lista de salvos:", erro);
        idsSalvosSet = new Set();
    }
}

function prestadorEstaSalvo(id) {
    return idsSalvosSet.has(String(id));
}

// Alterna salvo/não-salvo no servidor e só então atualiza o cache local —
// devolve o novo estado, pra quem chamou não precisar checar de novo.
async function alternarPrestadorSalvo(id) {
    const estavaSalvo = prestadorEstaSalvo(id);

    const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}/salvos/${id}`, {
        method: estavaSalvo ? "DELETE" : "POST",
        headers: { "x-usuario-id": usuarioId }
    });

    if (!resp.ok) {
        const erro = await resp.json().catch(() => ({}));
        throw new Error(erro.erro || `Não foi possível atualizar (HTTP ${resp.status}).`);
    }

    if (estavaSalvo) idsSalvosSet.delete(String(id));
    else idsSalvosSet.add(String(id));

    return !estavaSalvo;
}

/* ==========================================================================
   CONTA (login com Google — POST /api/usuarios/entrar-google)
   Identidade agora é de verdade: o servidor confere a assinatura do ID
   token do Google (verifyIdToken), então ninguém consegue se passar por
   outra conta só sabendo um id (diferente da versão anterior, por
   telefone auto-declarado). Isso só funciona rodando como site normal —
   dentro do WebView do app o Google recusa o login de propósito (ver
   conversa sobre isso); quando o REFLEXO virar app de novo, essa tela
   precisa abrir numa Custom Tab, não dentro da WebView.

   A sessão é persistida entre visitas — só o ID vai pro localStorage;
   nome/email/telefone ficam em perfilUsuarioCache, atualizados a cada
   entrarComGoogle()/restaurarSessao().
   ========================================================================== */
const CHAVE_USUARIO_ID = "mase_usuario_id";

let usuarioLogado = false;
let usuarioId = null;
let perfilUsuarioCache = { nome: "Você", email: "", telefone: "", avatarUrl: null };

function renderizarPaginaPerfil() {
    const deslogado = document.getElementById("profileLoggedOut");
    const logado = document.getElementById("profileLoggedIn");
    if (!deslogado || !logado) return;
    deslogado.hidden = usuarioLogado;
    logado.hidden = !usuarioLogado;

    if (usuarioLogado) {
        const nomeEl = document.getElementById("profileNomeExibido");
        const emailEl = document.getElementById("profileEmailExibido");
        const avatarEl = document.getElementById("profileAvatarInicial");
        if (nomeEl) nomeEl.textContent = perfilUsuarioCache.nome || "Você";
        if (emailEl) emailEl.textContent = perfilUsuarioCache.email || "Conta Google";
        if (avatarEl) {
            const inicial = (perfilUsuarioCache.nome || "V").trim().charAt(0).toUpperCase();
            // Mesmo padrão de avatarHTML() (letra + foto por cima, cai de
            // volta pra letra se a foto falhar) — mas aqui a foto vem
            // direto do Google (payload.picture, ver POST /entrar-google
            // no backend), não de um upload nosso. referrerpolicy é
          // necessário: o CDN do Google (lh3.googleusercontent.com) às
            // vezes recusa a imagem se enviarmos a URL completa da nossa
            // página como referrer.
            avatarEl.style.position = "relative";
            avatarEl.style.overflow = "hidden";
            avatarEl.innerHTML = perfilUsuarioCache.avatarUrl
                ? `<span>${inicial}</span>
                   <img src="${perfilUsuarioCache.avatarUrl}" alt="" referrerpolicy="no-referrer"
                        style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                        onload="this.previousElementSibling.style.display='none';"
                        onerror="this.remove();">`
                : inicial;
        }
        atualizarRotuloBotaoCadastro();
    }
}

// "Cadastre-se como prestador" vira "Gerenciar meu perfil de prestador"
// assim que a conta tem pelo menos 1 cadastro — o botão deixa de ser um
// convite pra criar e passa a ser a porta de entrada do gerenciamento
// (que é a mesma tela/overlay nos dois casos, só muda o texto de entrada).
async function atualizarRotuloBotaoCadastro() {
    const label = document.getElementById("btnAbrirCadastroLabel");
    if (!label || !usuarioLogado) return;

    try {
        const resp = await fetch(`${API_BASE}/prestadores/meus`, {
            headers: { "x-usuario-id": usuarioId }
        });
        if (!resp.ok) throw new Error(`GET /prestadores/meus respondeu ${resp.status}`);
        const cadastrados = await resp.json();
        label.textContent = cadastrados.length > 0 ? "Gerenciar meu perfil de prestador" : "Cadastre-se como prestador";
    } catch (erro) {
        console.warn("Não foi possível atualizar o rótulo do botão de cadastro:", erro);
    }
}

// Carrega o botão "Sign in with Google" (Google Identity Services). A lib
// (accounts.google.com/gsi/client) carrega async no <head> — pode não
// estar pronta ainda quando iniciarPaginaPerfil roda, então espera em
// pequenos intervalos em vez de assumir que já existe.
function iniciarGoogleSignIn() {
    if (!window.google || !window.google.accounts || !window.google.accounts.id) {
        setTimeout(iniciarGoogleSignIn, 100);
        return;
    }

    google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: aoReceberCredencialGoogle
    });

    const container = document.getElementById("googleSignInBtn");
    if (container) {
        google.accounts.id.renderButton(container, { theme: "filled_black", shape: "pill", size: "large", text: "continue_with", width: 280, height: 140, locale: "pt-BR" });
    }
}

// Callback do GIS quando o login termina no lado do Google — response.credential
// é o ID token (JWT) assinado pelo Google, o servidor confere a assinatura
// dele em POST /entrar-google (nunca confiamos em nada que venha só do
// cliente pra decidir identidade).
async function aoReceberCredencialGoogle(response) {
    const loginErro = document.getElementById("profileLoginErro");
    if (loginErro) loginErro.hidden = true;

    try {
        await entrarComGoogle(response.credential);
    } catch (erro) {
        if (loginErro) {
            loginErro.textContent = erro.message;
            loginErro.hidden = false;
        }
    }
}

async function entrarComGoogle(credential) {
    const resp = await fetch(`${API_BASE}/usuarios/entrar-google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ credential })
    });

    if (!resp.ok) {
        const corpo = await resp.json().catch(() => ({}));
        throw new Error(corpo.erro || `Não foi possível entrar (HTTP ${resp.status}).`);
    }

    const usuario = await resp.json();
    usuarioId = usuario.id;
    usuarioLogado = true;
    perfilUsuarioCache = { nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, avatarUrl: usuario.avatarUrl };
    localStorage.setItem(CHAVE_USUARIO_ID, usuarioId);
    renderizarPaginaPerfil();
    carregarIdsSalvos(); // não bloqueia o login — completa em segundo plano
}

function sair() {
    usuarioLogado = false;
    usuarioId = null;
    idsSalvosSet = new Set();
    localStorage.removeItem(CHAVE_USUARIO_ID);
    renderizarPaginaPerfil();
    fecharCadastroPrestador(); // por segurança, se a tela de cadastro estiver aberta ao deslogar

    // GIS lembra a última conta escolhida e tenta logar sozinho de novo
    // (One Tap) se não avisarmos que o usuário saiu de propósito.
    if (window.google && window.google.accounts && window.google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
}

// Roda uma vez na subida do app (ver iniciarPaginaPerfil): se já existe um
// id salvo de uma visita anterior, confirma com o backend que ele ainda é
// válido antes de considerar a pessoa logada — evita ficar "logado" com um
// id que não existe mais (ex: banco foi resetado em dev).
async function restaurarSessao() {
    const idSalvo = localStorage.getItem(CHAVE_USUARIO_ID);
    if (!idSalvo) return;

    try {
        const resp = await fetch(`${API_BASE}/usuarios/${idSalvo}`);
        if (!resp.ok) throw new Error(`GET /usuarios/${idSalvo} respondeu ${resp.status}`);

        const usuario = await resp.json();
        usuarioId = usuario.id;
        usuarioLogado = true;
        perfilUsuarioCache = { nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, avatarUrl: usuario.avatarUrl };
        carregarIdsSalvos(); // idem: não bloqueia, completa em segundo plano
    } catch (erro) {
        console.warn("Sessão salva não é mais válida, saindo:", erro);
        localStorage.removeItem(CHAVE_USUARIO_ID);
    }

    renderizarPaginaPerfil();
}

/* Overlay simples de tela cheia — mesmo chrome do CadastroOverlay, mas
   usado tanto pra "Editar perfil" quanto pra Termos/Privacidade (textos
   estáticos), então recebe o conteúdo do miolo por parâmetro. */
let overlayGenericoEl = null;

function fecharOverlayGenerico(viaPopstate) {
    registrarFechamentoOverlay(fecharOverlayGenerico, viaPopstate);
    if (overlayGenericoEl) {
        overlayGenericoEl.remove();
        overlayGenericoEl = null;
    }
}

function abrirOverlayGenerico(titulo, corpoHTML) {
    fecharOverlayGenerico();
    const overlay = document.createElement("div");
    overlay.className = "ProviderProfile CadastroOverlay";
    overlay.innerHTML = `
        <div class="CadastroOverlayHeader">
            <div class="CadastroOverlayTitle">${titulo}</div>
            <button type="button" class="CadastroOverlayClose" aria-label="Fechar">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </button>
        </div>
        <div class="ProviderProfileBody"><div class="CadastroWrap">${corpoHTML}</div></div>
    `;
    overlay.querySelector(".CadastroOverlayClose").addEventListener("click", () => fecharOverlayGenerico());
    document.body.appendChild(overlay);
    overlayGenericoEl = overlay;
    registrarAberturaOverlay(fecharOverlayGenerico);
    return overlay;
}

function abrirEditarPerfil() {
    const overlay = abrirOverlayGenerico("Preferências da conta", `
        <form class="CadastroForm" id="editarPerfilForm">
            <label class="CadastroField">
                <span class="CadastroLabel">Nome</span>
                <input type="text" name="nome" class="CadastroInput" value="${perfilUsuarioCache.nome.replace(/"/g, "&quot;")}" required>
            </label>
            <div class="CadastroHint">O e-mail (${perfilUsuarioCache.email || "—"}) não pode ser trocado por aqui — é ele quem identifica sua conta, direto da sua conta Google.</div>
            <div class="CadastroErro" id="editarPerfilErro" hidden></div>
            <button type="submit" class="CadastroSubmit">Salvar</button>
        </form>
    `);

    const form = overlay.querySelector("#editarPerfilForm");
    const erroEl = overlay.querySelector("#editarPerfilErro");
    const botao = form.querySelector(".CadastroSubmit");

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { nome } = Object.fromEntries(new FormData(form).entries());

        erroEl.hidden = true;
        botao.disabled = true;
        botao.textContent = "Salvando...";

        try {
            const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}`, {
                method: "PATCH",
                headers: { "Content-Type": "application/json", "x-usuario-id": usuarioId },
                body: JSON.stringify({ nome })
            });
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => ({}));
                throw new Error(corpo.erro || `Não foi possível salvar (HTTP ${resp.status}).`);
            }

            const atualizado = await resp.json();
            perfilUsuarioCache.nome = atualizado.nome;
            renderizarPaginaPerfil();
            fecharOverlayGenerico();
        } catch (erro) {
            erroEl.textContent = erro.message;
            erroEl.hidden = false;
            botao.disabled = false;
            botao.textContent = "Salvar";
        }
    });
}

/* ==========================================================================
   CONFIGURAÇÕES (página Menu)
   Preferências salvas em localStorage — ainda sem efeito real (não existe
   backend pra enviar push/whatsapp de verdade, nem lógica de precisão de
   localização usando esse valor), mas a UI e a persistência já ficam
   prontas. Termos/Privacidade são texto estático por enquanto.
   ========================================================================== */
const CHAVE_CONFIG_APP = "mase_config_app";
const CONFIG_APP_PADRAO = { notifPush: true, notifWhatsapp: false, localExata: true, temaControles: "dinamico", raioMaximoKm: null };

function lerConfigApp() {
    try {
        const bruto = localStorage.getItem(CHAVE_CONFIG_APP);
        return bruto ? { ...CONFIG_APP_PADRAO, ...JSON.parse(bruto) } : { ...CONFIG_APP_PADRAO };
    } catch (erro) {
        console.warn("Não foi possível ler configurações salvas:", erro);
        return { ...CONFIG_APP_PADRAO };
    }
}

function gravarConfigApp(config) {
    try {
        localStorage.setItem(CHAVE_CONFIG_APP, JSON.stringify(config));
    } catch (erro) {
        console.warn("Não foi possível salvar configurações:", erro);
    }
}

function aplicarEstadoToggle(botao, ligado) {
    botao.setAttribute("aria-checked", String(ligado));
    botao.classList.toggle("is-on", ligado);
}

function iniciarConfiguracoes() {
    const config = lerConfigApp();

    preferenciaTemaControles = config.temaControles || "dinamico";
    const segmentedBotoes = document.querySelectorAll("#temaControlesSegmented .SettingsSegmentedOption");
    const atualizarSegmentedUI = () => {
        segmentedBotoes.forEach(botao => {
            botao.classList.toggle("is-active", botao.dataset.valor === preferenciaTemaControles);
        });
    };
    atualizarSegmentedUI();
    segmentedBotoes.forEach(botao => {
        botao.addEventListener("click", () => {
            preferenciaTemaControles = botao.dataset.valor;
            config.temaControles = preferenciaTemaControles;
            gravarConfigApp(config);
            atualizarSegmentedUI();
            aplicarTemaPreferencia();
        });
    });

    const mapaToggles = {
        toggleNotifPush: "notifPush",
        toggleNotifWhatsapp: "notifWhatsapp",
        toggleLocalExata: "localExata"
    };

    Object.entries(mapaToggles).forEach(([idBotao, chave]) => {
        const botao = document.getElementById(idBotao);
        if (!botao) return;
        aplicarEstadoToggle(botao, config[chave]);
        botao.addEventListener("click", () => {
            config[chave] = !config[chave];
            aplicarEstadoToggle(botao, config[chave]);
            gravarConfigApp(config);
        });
    });

    const linkTermos = document.getElementById("linkTermos");
    if (linkTermos) linkTermos.addEventListener("click", () => {
        abrirOverlayGenerico("Termos de uso", `
            <div class="CadastroSubtitle">Versão provisória, só pra preencher o espaço até o texto definitivo entrar — não use como termo válido ainda.</div>
        `);
    });

    const linkPrivacidade = document.getElementById("linkPrivacidade");
    if (linkPrivacidade) linkPrivacidade.addEventListener("click", () => {
        abrirOverlayGenerico("Política de privacidade", `
            <div class="CadastroSubtitle">Versão provisória, só pra preencher o espaço até o texto definitivo entrar — não use como termo válido ainda.</div>
        `);
    });

    const btnExcluir = document.getElementById("btnExcluirDados");
    if (btnExcluir) btnExcluir.addEventListener("click", () => {
        const confirmado = window.confirm("Isso desconecta sua conta neste aparelho e apaga preferências salvas neste navegador. Seus cadastros de prestador continuam no servidor, e você pode entrar de novo a qualquer momento com o mesmo telefone. Continuar?");
        if (!confirmado) return;

        [CHAVE_USUARIO_ID, CHAVE_CONFIG_APP].forEach(chave => localStorage.removeItem(chave));

        sair();
        iniciarConfiguracoes(); // reaplica os toggles pro estado padrão
        aplicarTemaPreferencia(); // e o estilo dos botões, já que a preferência voltou a "dinâmico"

        raioMaximoKm = null;
        atualizarBadgeRaio();
        atualizarPainelRaioUI();
        refazerBuscaAtual();
    });
}

/* Overlay de tela cheia, aberto a partir do Perfil ("Cadastre-se como
   prestador") — mesmo padrão de abrirPerfilPrestador()/fecharPerfilPrestador
   (criado/destruído sob demanda, cobre o Dock por cima). Reaproveita o
   chrome visual de .ProviderProfile (ver style.css), só sem a foto de capa. */
/* ==========================================================================
   CONFIRMAÇÃO GENÉRICA — modal pequeno de "tem certeza?" (usado hoje pra
   remover cadastro de prestador). Sempre some no "Cancelar", no X, ou no
   clique fora do modal — só chama onConfirmar mesmo se a pessoa tocar
   explicitamente no botão de confirmar.
   ========================================================================== */
let confirmarAcaoEl = null;

function fecharConfirmarAcao(viaPopstate) {
    registrarFechamentoOverlay(fecharConfirmarAcao, viaPopstate);
    if (confirmarAcaoEl) {
        confirmarAcaoEl.remove();
        confirmarAcaoEl = null;
    }
}

function abrirConfirmarAcao({ titulo, mensagem, textoConfirmar = "Remover", onConfirmar }) {
    fecharConfirmarAcao();

    const overlay = document.createElement("div");
    overlay.className = "ConfirmOverlay";
    overlay.innerHTML = `
        <div class="ConfirmModal" role="alertdialog" aria-modal="true">
            <div class="ConfirmModalTitle">${titulo}</div>
            <div class="ConfirmModalText">${mensagem}</div>
            <div class="ConfirmModalActions">
                <button type="button" class="ConfirmModalBtn ConfirmModalBtn--cancelar">Cancelar</button>
                <button type="button" class="ConfirmModalBtn ConfirmModalBtn--confirmar">${textoConfirmar}</button>
            </div>
        </div>
    `;

    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) fecharConfirmarAcao(); // clicar fora fecha, igual cancelar
    });
    overlay.querySelector(".ConfirmModalBtn--cancelar").addEventListener("click", () => fecharConfirmarAcao());
    overlay.querySelector(".ConfirmModalBtn--confirmar").addEventListener("click", () => {
        fecharConfirmarAcao();
        onConfirmar();
    });

    document.body.appendChild(overlay);
    confirmarAcaoEl = overlay;
    registrarAberturaOverlay(fecharConfirmarAcao);
}

/* ==========================================================================
   HISTÓRICO DE TELAS SOBREPOSTAS — botão "voltar" fecha em vez de sair do app
   Como o app roda só como site (sem instalar), o botão "voltar" do
   celular por padrão sairia da página assim que qualquer tela sobreposta
   (cadastro, avaliar, popup do mapa, perfil do prestador, lightbox de
   foto, corte de imagem...) estivesse aberta — nada surpreendente pra um
   site comum, mas quebra a sensação de app que o resto do design já passa.

   Em vez de empilhar uma entrada de histórico POR CAMADA (cadastro →
   corte de imagem, cada um exigindo um "voltar" separado), a solução
   aqui é mais simples e mais robusta: só existe UMA entrada de histórico
   "extra", criada quando a PRIMEIRA tela sobreposta abre (profundidade 0
   → 1) e consumida só quando a ÚLTIMA fecha (profundidade 1 → 0).
   Abrir/fechar camadas adicionais por cima (ex: corte de imagem em cima
   do cadastro) só ajusta a contagem, sem mexer no histórico.

   O consumo da entrada é ADIADO com setTimeout(0) de propósito: sem
   isso, trocar rapidamente de pino no mapa (fechar popup A, abrir popup
   B na mesma função) faria a profundidade cair pra 0 e voltar pra 1 no
   mesmo instante — chamar history.back() (assíncrono) e history.pushState()
   (síncrono) um logo depois do outro tem resultado imprevisível entre
   navegadores. Adiar dá tempo do "abrir B" cancelar o "fechar A" antes
   da checagem rodar.

   Efeito prático: com qualquer coisa nossa aberta, o primeiro "voltar"
   fecha tudo de uma vez (volta pro mapa). Só o SEGUNDO "voltar" (com
   nada nosso mais aberto) sai do site de verdade — o comportamento
   correto e esperado do navegador.
   ========================================================================== */
const pilhaFecharOverlays = [];
let overlayHistoryFlag = false; // já existe uma entrada de histórico "nossa" pendente?

// Toda função abrirX() chama isso depois de criar/mostrar sua tela.
function registrarAberturaOverlay(fecharFn) {
    pilhaFecharOverlays.push(fecharFn);
    if (pilhaFecharOverlays.length !== 1) return; // já tinha algo nosso aberto — não é a "primeira camada"

    if (overlayHistoryFlag) {
        // trocou rápido (ex: outro pino do mapa) — a entrada antiga
        // ainda nem foi consumida, reaproveita em vez de empilhar mais uma
        history.replaceState({ claudeOverlay: true }, "");
    } else {
        history.pushState({ claudeOverlay: true }, "");
        overlayHistoryFlag = true;
    }
}

// Toda função fecharX(viaPopstate) chama isso ANTES de mexer no DOM.
// viaPopstate=true só quando for o próprio handler de popstate chamando
// (o navegador já processou a navegação sozinho nesse caso).
function registrarFechamentoOverlay(fecharFn, viaPopstate) {
    const indice = pilhaFecharOverlays.lastIndexOf(fecharFn);
    if (indice === -1) return;
    pilhaFecharOverlays.splice(indice, 1);

    if (viaPopstate) { overlayHistoryFlag = false; return; }
    if (pilhaFecharOverlays.length > 0) return; // ainda tem outra camada nossa aberta

    setTimeout(() => {
        if (pilhaFecharOverlays.length === 0 && overlayHistoryFlag) {
            overlayHistoryFlag = false;
            history.back();
        }
    }, 0);
}

window.addEventListener("popstate", () => {
    // um só "voltar" fecha TODAS as camadas nossas abertas de uma vez
    // (ver explicação acima) — do topo pra base.
    while (pilhaFecharOverlays.length > 0) {
        const topo = pilhaFecharOverlays[pilhaFecharOverlays.length - 1];
        topo(true);
    }
});

let cadastroOverlayEl = null;

// Ponte pro clique de "Editar" em renderizarMeusCadastros conseguir abrir o
// formulário já em modo edição — abrirCadastroPrestador() atribui isso à
// sua função interna abrirFormulario antes de terminar. Mesmo padrão que
// cadastroPontoEscolhido/cadastroMapPickerMap acima: estado que precisa
// atravessar funções que não compartilham o mesmo closure.
let abrirFormularioEdicaoRef = null;

function fecharCadastroPrestador(viaPopstate) {
    registrarFechamentoOverlay(fecharCadastroPrestador, viaPopstate);
    if (cadastroOverlayEl) {
        cadastroOverlayEl.remove();
        cadastroOverlayEl = null;
    }
}

async function renderizarMeusCadastros() {
    const lista = document.getElementById("cadastroMeusList");
    const contador = document.getElementById("cadastroMeusContador");
    const vazio = document.getElementById("cadastroMeusVazio");
    const novoBtn = document.getElementById("cadastroNovoBtn");
    const limiteHint = document.getElementById("cadastroLimiteHint");
    if (!lista || !contador || !novoBtn) return;

    let cadastrados;
    try {
        const resp = await fetch(`${API_BASE}/prestadores/meus`, {
            headers: { "x-usuario-id": usuarioId }
        });
        if (!resp.ok) throw new Error(`GET /prestadores/meus respondeu ${resp.status}`);
        cadastrados = await resp.json();
    } catch (erro) {
        console.warn("Não foi possível carregar seus cadastros:", erro);
        lista.innerHTML = `<div class="CadastroHint">Não foi possível carregar seus cadastros agora. Tente reabrir esta tela.</div>`;
        return;
    }

    contador.textContent = `${cadastrados.length} de ${LIMITE_PRESTADORES_POR_CONTA} cadastros usados`;

    const atingiuLimite = cadastrados.length >= LIMITE_PRESTADORES_POR_CONTA;
    novoBtn.hidden = atingiuLimite;
    limiteHint.hidden = !atingiuLimite;

    if (vazio) vazio.hidden = cadastrados.length > 0;
    lista.hidden = cadastrados.length === 0;

    lista.innerHTML = cadastrados.map(p => `
        <div class="CadastroMeusCard" data-id="${p.id}">
            <div class="CadastroMeusCardTopo">
                <div class="CadastroMeusCardNome">${p.nome}</div>
                <div class="CadastroMeusCardAcoes">
                    <button type="button" class="CadastroMeusCardEditar" aria-label="Editar ${p.nome}">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 20h4L18.5 9.5a2.1 2.1 0 0 0-3-3L5 17v3Z"
                                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                        </svg>
                        Editar
                    </button>
                    <button type="button" class="CadastroMeusCardRemover" aria-label="Remover cadastro de ${p.nome}">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0-1 13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1L6 7"
                                stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                        Remover
                    </button>
                </div>
            </div>
            <div class="CadastroMeusCardCategoria">${p.categoria}</div>
            <div class="CadastroMeusCardTelefone">${p.telefone}</div>
            <div class="CadastroMeusCardStatus">${badgeHorarioHTML(p)}</div>
        </div>
    `).join("");

    lista.querySelectorAll(".CadastroMeusCardEditar").forEach(botao => {
        botao.addEventListener("click", () => {
            const card = botao.closest(".CadastroMeusCard");
            const prestador = cadastrados.find(p => String(p.id) === card.dataset.id);
            if (prestador && abrirFormularioEdicaoRef) abrirFormularioEdicaoRef(prestador);
        });
    });

    lista.querySelectorAll(".CadastroMeusCardRemover").forEach(botao => {
        botao.addEventListener("click", () => {
            const card = botao.closest(".CadastroMeusCard");
            const nome = card.querySelector(".CadastroMeusCardNome").textContent;

            abrirConfirmarAcao({
                titulo: "Remover cadastro?",
                mensagem: `Isso remove ${nome} do mapa e das buscas. Essa ação não pode ser desfeita.`,
                textoConfirmar: "Remover",
                onConfirmar: async () => {
                    botao.disabled = true;
                    try {
                        await removerPrestadorCadastrado(card.dataset.id);
                        renderizarMeusCadastros();
                        atualizarRotuloBotaoCadastro();
                    } catch (erro) {
                        console.warn("Não foi possível remover:", erro);
                        alert(erro.message);
                        botao.disabled = false;
                    }
                }
            });
        });
    });
}

/* ==========================================================================
   GERENCIAR FOTOS DO PRESTADOR (perfil + até 4 de capa)
   Nome do arquivo salvo pelo backend é determinístico (id do prestador,
   ver routes/prestadores.js) — por isso o preview aqui usa exatamente as
   mesmas URLs que o resto do app (fotoPerfilPrestador/fotosCapaPrestador),
   só com um "?t=" no fim depois do upload pra forçar o navegador a
   recarregar em vez de servir a versão antiga do cache (mesmo nome de
   arquivo = mesma URL de antes, sem o cache-bust o navegador nunca
   pediria a nova).
   ========================================================================== */
/* ==========================================================================
   UPLOAD DE FOTOS — envio com progresso real via XHR (fetch não expõe
   progress de upload de forma nativa) + corte de imagem antes de mandar
   qualquer coisa pro servidor (ver abrirCropImagem logo abaixo).
   ========================================================================== */
function enviarFotoPrestadorComProgresso(prestadorId, rota, blob, aoProgredir) {
    return new Promise((resolve, reject) => {
        const dados = new FormData();
        dados.append("foto", blob, "foto.jpg");

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/prestadores/${prestadorId}/${rota}`);
        xhr.setRequestHeader("x-usuario-id", usuarioId);

        xhr.upload.addEventListener("progress", (evento) => {
            if (evento.lengthComputable && aoProgredir) aoProgredir(evento.loaded / evento.total);
        });

        xhr.addEventListener("load", () => {
            if (xhr.status >= 200 && xhr.status < 300) { resolve(); return; }
            let mensagem = `Não foi possível enviar a foto (HTTP ${xhr.status}).`;
            try {
                const corpo = JSON.parse(xhr.responseText);
                if (corpo.erro) mensagem = corpo.erro;
            } catch { /* resposta não era JSON, mantém a mensagem genérica */ }
            reject(new Error(mensagem));
        });

        xhr.addEventListener("error", () => reject(new Error("Falha de rede ao enviar a foto.")));
        xhr.send(dados);
    });
}

// mantido pra qualquer chamador que não precise acompanhar progresso
async function enviarFotoPrestador(prestadorId, rota, arquivo) {
    return enviarFotoPrestadorComProgresso(prestadorId, rota, arquivo, null);
}

// Comprime uma imagem no navegador antes de subir pro servidor — sem
// isso, uma foto de celular sem edição (8-15MB fácil) passa do teto de
// ~4.5MB de corpo de requisição que a Vercel aplica nas serverless
// functions ANTES até de chegar no multer/sharp do backend; quando isso
// acontece o fetch falha com "Failed to fetch" (erro de rede genérico,
// sem status HTTP, porque a plataforma corta a requisição antes de
// qualquer resposta). Redimensiona pro maior lado ficar em no máximo
// maxDimensao e recodifica como JPEG na qualidade pedida — de sobra já
// que o backend ainda vai reprocessar (resize + webp) em cima disso de
// qualquer forma. Usada hoje só no upload de foto de avaliação (o fluxo
// de foto de prestador já passa por abrirCropImagem, que já gera um
// blob pequeno via canvas antes de enviar).
function comprimirImagemParaUpload(arquivo, maxDimensao = 1600, qualidade = 0.82) {
    return new Promise((resolve, reject) => {
        const img = new Image();
        const urlObjeto = URL.createObjectURL(arquivo);

        img.onload = () => {
            URL.revokeObjectURL(urlObjeto);

            const escala = Math.min(1, maxDimensao / Math.max(img.width, img.height));
            const largura = Math.round(img.width * escala);
            const altura = Math.round(img.height * escala);

            const canvas = document.createElement("canvas");
            canvas.width = largura;
            canvas.height = altura;
            canvas.getContext("2d").drawImage(img, 0, 0, largura, altura);

            canvas.toBlob(
                (blob) => blob ? resolve(blob) : reject(new Error("Não foi possível comprimir a imagem.")),
                "image/jpeg",
                qualidade
            );
        };
        img.onerror = () => {
            URL.revokeObjectURL(urlObjeto);
            reject(new Error("Não foi possível ler a imagem selecionada."));
        };
        img.src = urlObjeto;
    });
}

/* ==========================================================================
   CROP DE IMAGEM — pan (arrastar) e zoom (roda do mouse ou pinça com dois
   dedos) dentro de uma janela de proporção fixa, sem depender de nenhuma
   lib externa. Devolve uma Promise<Blob|null>: null quando a pessoa
   cancela. O corte final vira um canvas no tamanho de saída pedido, então
   quem chama decide a resolução (avatar quadrado, capa 4:3 etc).
   Pointer Events unificam mouse e toque de propósito — isso roda dentro
   da WebView do app, então touch precisa funcionar igual ao mouse no
   navegador de teste.
   ========================================================================== */
let cropOverlayEl = null;
let cropFinalizarAtual = null; // referência ao finalizar() da instância aberta agora — ver fecharCropImagem

// Ponte pro popstate conseguir fechar o crop de fora (ele não tem uma
// função fecharX própria como os outros overlays, porque é baseado em
// Promise/closure — cancela como se a pessoa tivesse tocado em "Cancelar").
function fecharCropImagem(viaPopstate) {
    if (cropFinalizarAtual) cropFinalizarAtual(null, viaPopstate);
}

function abrirCropImagem({ arquivo, circular = false, larguraSaida, alturaSaida, titulo = "Ajustar foto" }) {
    return new Promise((resolve) => {
        if (cropOverlayEl) cropOverlayEl.remove();

        const overlay = document.createElement("div");
        overlay.className = "CropOverlay";
        overlay.innerHTML = `
            <div class="CropHeader">
                <div class="CropTitle">${titulo}</div>
                <div class="CropHint">Arraste pra posicionar · belisque ou role pra dar zoom</div>
            </div>
            <div class="CropStage">
                <div class="CropViewport ${circular ? "is-circular" : ""}" id="cropViewport">
                    <img class="CropImg" id="cropImg" alt="" draggable="false">
                </div>
            </div>
            <div class="CropActions">
                <button type="button" class="FotosPrestadorCancelarBtn" id="cropCancelar">Cancelar</button>
                <button type="button" class="FotosPrestadorSalvarBtn" id="cropConfirmar">Usar foto</button>
            </div>
        `;
        document.body.appendChild(overlay);
        cropOverlayEl = overlay;
        registrarAberturaOverlay(fecharCropImagem);

        const viewport = overlay.querySelector("#cropViewport");
        const img = overlay.querySelector("#cropImg");
        const objectUrl = URL.createObjectURL(arquivo);

        let scale = 1, minScale = 1, offsetX = 0, offsetY = 0;
        let naturalW = 0, naturalH = 0;

        function aplicarTransform() {
            img.style.transform = `translate(-50%, -50%) translate(${offsetX}px, ${offsetY}px) scale(${scale})`;
        }

        // trava o pan/zoom pra imagem nunca deixar borda vazia dentro
        // da janela de corte, nem em qualquer combinação de zoom/posição
        function limitar() {
            const vpRect = viewport.getBoundingClientRect();
            const dispW = naturalW * scale, dispH = naturalH * scale;
            const maxX = Math.max(0, (dispW - vpRect.width) / 2);
            const maxY = Math.max(0, (dispH - vpRect.height) / 2);
            offsetX = Math.min(maxX, Math.max(-maxX, offsetX));
            offsetY = Math.min(maxY, Math.max(-maxY, offsetY));
        }

        img.addEventListener("load", () => {
            naturalW = img.naturalWidth;
            naturalH = img.naturalHeight;
            img.style.width = `${naturalW}px`;
            img.style.height = `${naturalH}px`;
            const vpRect = viewport.getBoundingClientRect();
            // escala mínima = a que cobre a janela inteira (equivalente a object-fit: cover)
            minScale = Math.max(vpRect.width / naturalW, vpRect.height / naturalH);
            scale = minScale;
            offsetX = 0;
            offsetY = 0;
            aplicarTransform();
        });
        img.src = objectUrl;

        const ponteiros = new Map();
        let distanciaInicial = 0;
        let escalaInicial = 1;
        let ultimoPonto = null;

        viewport.addEventListener("pointerdown", (evento) => {
            viewport.setPointerCapture(evento.pointerId);
            ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });
            if (ponteiros.size === 1) {
                ultimoPonto = { x: evento.clientX, y: evento.clientY };
            } else if (ponteiros.size === 2) {
                const pts = [...ponteiros.values()];
                distanciaInicial = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                escalaInicial = scale;
            }
        });

        viewport.addEventListener("pointermove", (evento) => {
            if (!ponteiros.has(evento.pointerId)) return;
            ponteiros.set(evento.pointerId, { x: evento.clientX, y: evento.clientY });

            if (ponteiros.size === 1 && ultimoPonto) {
                offsetX += evento.clientX - ultimoPonto.x;
                offsetY += evento.clientY - ultimoPonto.y;
                ultimoPonto = { x: evento.clientX, y: evento.clientY };
                limitar();
                aplicarTransform();
            } else if (ponteiros.size === 2) {
                const pts = [...ponteiros.values()];
                const distancia = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
                if (distanciaInicial > 0) {
                    scale = Math.min(minScale * 4, Math.max(minScale, escalaInicial * (distancia / distanciaInicial)));
                    limitar();
                    aplicarTransform();
                }
            }
        });

        function soltarPonteiro(evento) {
            ponteiros.delete(evento.pointerId);
            ultimoPonto = ponteiros.size === 1 ? [...ponteiros.values()][0] : null;
        }
        viewport.addEventListener("pointerup", soltarPonteiro);
        viewport.addEventListener("pointercancel", soltarPonteiro);

        viewport.addEventListener("wheel", (evento) => {
            evento.preventDefault();
            const delta = evento.deltaY > 0 ? -0.08 : 0.08;
            scale = Math.min(minScale * 4, Math.max(minScale, scale + delta * scale));
            limitar();
            aplicarTransform();
        }, { passive: false });

        function finalizar(resultado, viaPopstate) {
            registrarFechamentoOverlay(fecharCropImagem, viaPopstate);
            URL.revokeObjectURL(objectUrl);
            overlay.remove();
            cropOverlayEl = null;
            cropFinalizarAtual = null;
            resolve(resultado);
        }
        cropFinalizarAtual = finalizar;

        overlay.querySelector("#cropCancelar").addEventListener("click", () => finalizar(null));
        overlay.querySelector("#cropConfirmar").addEventListener("click", () => {
            const vpRect = viewport.getBoundingClientRect();
            const dispW = naturalW * scale, dispH = naturalH * scale;
            // topo-esquerdo da imagem exibida, relativo à janela de corte
            const imgLeft = vpRect.width / 2 - dispW / 2 + offsetX;
            const imgTop = vpRect.height / 2 - dispH / 2 + offsetY;
            // mesma janela, convertida pra coordenadas de pixel da imagem original
            const sx = -imgLeft / scale;
            const sy = -imgTop / scale;
            const sw = vpRect.width / scale;
            const sh = vpRect.height / scale;

            const canvas = document.createElement("canvas");
            canvas.width = larguraSaida;
            canvas.height = alturaSaida;
            canvas.getContext("2d").drawImage(img, sx, sy, sw, sh, 0, 0, larguraSaida, alturaSaida);
            canvas.toBlob((blob) => finalizar(blob), "image/jpeg", 0.9);
        });
    });
}

// atualiza o anel de progresso (SVG) e o texto de porcentagem de uma miniatura
function atualizarAnelProgresso(barEl, pctEl, fracao) {
    const CIRCUNFERENCIA = 97.39; // 2 * PI * 15.5, raio fixo do círculo no SVG (ver CSS)
    barEl.style.strokeDashoffset = `${CIRCUNFERENCIA * (1 - fracao)}`;
    pctEl.textContent = `${Math.round(fracao * 100)}%`;
}

/* ==========================================================================
   PAINEL "AVALIAÇÕES PENDENTES" (dentro do overlay de Cadastro)
   Busca a fila cega de cada prestador que o usuário logado é dono de
   verdade (GET /prestadores/meus + GET .../avaliacoes/pendentes por
   prestador). O prazo de expiração é resolvido por um job de verdade no
   servidor (backend/src/jobs/expirarAvaliacoes.js) — não precisa rodar
   nada aqui antes de listar, só mostrar a contagem regressiva informativa.
   ========================================================================== */
async function renderizarAvaliacoesPendentes() {
    const section = document.getElementById("avaliacoesPendentesSection");
    const lista = document.getElementById("avaliacoesPendentesList");
    if (!section || !lista) return;

    let meusCadastros;
    try {
        const resp = await fetch(`${API_BASE}/prestadores/meus`, {
            headers: { "x-usuario-id": usuarioId }
        });
        if (!resp.ok) throw new Error(`GET /prestadores/meus respondeu ${resp.status}`);
        meusCadastros = await resp.json();
    } catch (erro) {
        console.warn("Não foi possível carregar seus cadastros pra checar pendências:", erro);
        return;
    }

    let pendentes = [];
    try {
        const porPrestador = await Promise.all(meusCadastros.map(async p => {
            const respFila = await fetch(`${API_BASE}/prestadores/${p.id}/avaliacoes/pendentes`, {
                headers: { "x-usuario-id": usuarioId }
            });
            if (!respFila.ok) throw new Error(`GET .../avaliacoes/pendentes respondeu ${respFila.status}`);
            const fila = await respFila.json();
            return fila.map(av => ({ ...av, prestadorId: p.id, prestadorNome: p.nome, prestadorCategoria: p.categoria }));
        }));
        pendentes = porPrestador.flat().sort((a, b) => a.criadoEm - b.criadoEm);
    } catch (erro) {
        console.warn("Não foi possível carregar as avaliações pendentes:", erro);
    }

    if (pendentes.length === 0) {
        section.hidden = true;
        return;
    }

    section.hidden = false;

    lista.innerHTML = pendentes.map(av => {
        const diasRestantes = Math.max(0, Math.ceil((av.criadoEm + PRAZO_AVALIACAO_MS - Date.now()) / (24 * 60 * 60 * 1000)));
        const dataFormatada = new Date(av.criadoEm).toLocaleDateString("pt-BR");
        const sobreQuem = meusCadastros.length > 1 ? ` · sobre ${av.prestadorNome}` : "";

        return `
            <div class="AvaliacaoPendenteItem" data-id="${av.id}">
                <div class="AvaliacaoPendenteHeader">
                    <div class="AvaliacaoPendenteAutorRow">
                        ${avatarClienteHTML(av.autorNome, av.autorAvatarUrl, "AvaliacaoPendenteAvatar")}
                        <div class="AvaliacaoPendenteAutor">${av.autorNome}</div>
                    </div>
                    <div class="AvaliacaoPendentePrazo">expira em ${diasRestantes}d</div>
                </div>
                <div class="AvaliacaoPendenteMeta">${dataFormatada} · ${av.prestadorCategoria}${sobreQuem}</div>
                ${av.viaWhatsapp ? `<span class="AvaliacaoPendenteTag">Contatou pelo WhatsApp</span>` : ""}
                <div class="AvaliacaoPendenteMotivo" hidden>
                    <select class="AvaliacaoPendenteMotivoSelect">
                        <option value="Não reconheço este cliente">Não reconheço este cliente</option>
                        <option value="Suspeito de avaliação falsa">Suspeito de avaliação falsa</option>
                        <option value="Outro motivo">Outro motivo</option>
                    </select>
                    <div class="AvaliacaoPendenteMotivoActions">
                        <button type="button" class="AvaliacaoPendenteMotivoConfirmar">Confirmar rejeição</button>
                        <button type="button" class="AvaliacaoPendenteMotivoCancelar">Cancelar</button>
                    </div>
                </div>
                <div class="AvaliacaoPendenteActions">
                    <button type="button" class="AvaliacaoPendenteAceitar">Aceitar</button>
                    <button type="button" class="AvaliacaoPendenteRejeitar">Rejeitar</button>
                </div>
            </div>
        `;
    }).join("");

    lista.querySelectorAll(".AvaliacaoPendenteItem").forEach(item => {
        const id = item.dataset.id;

        item.querySelector(".AvaliacaoPendenteAceitar").addEventListener("click", async (event) => {
            event.target.disabled = true;
            try {
                const resp = await fetch(`${API_BASE}/avaliacoes/${id}/aceitar`, {
                    method: "POST",
                    headers: { "x-usuario-id": usuarioId }
                });
                if (!resp.ok) throw new Error(`POST .../aceitar respondeu ${resp.status}`);

                await carregarPrestadores(); // nota do prestador mudou, recarrega
                renderizarAvaliacoesPendentes();
            } catch (erro) {
                console.warn("Não foi possível aceitar a avaliação:", erro);
                event.target.disabled = false;
            }
        });

        const painelMotivo = item.querySelector(".AvaliacaoPendenteMotivo");

        // Rejeitar não some na hora: exige motivo (evita rejeição em massa
        // por impulso) — clicar só revela o seletor.
        item.querySelector(".AvaliacaoPendenteRejeitar").addEventListener("click", () => {
            painelMotivo.hidden = false;
        });

        item.querySelector(".AvaliacaoPendenteMotivoCancelar").addEventListener("click", () => {
            painelMotivo.hidden = true;
        });

        item.querySelector(".AvaliacaoPendenteMotivoConfirmar").addEventListener("click", async (event) => {
            const motivo = item.querySelector(".AvaliacaoPendenteMotivoSelect").value;
            event.target.disabled = true;
            try {
                const resp = await fetch(`${API_BASE}/avaliacoes/${id}/rejeitar`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json", "x-usuario-id": usuarioId },
                    body: JSON.stringify({ motivo })
                });
                if (!resp.ok) throw new Error(`POST .../rejeitar respondeu ${resp.status}`);

                renderizarAvaliacoesPendentes();
            } catch (erro) {
                console.warn("Não foi possível rejeitar a avaliação:", erro);
                event.target.disabled = false;
            }
        });
    });
}

function abrirCadastroPrestador() {
    // Guarda de segurança: mesmo que o botão só apareça pra quem está
    // "logado", a função em si também checa — não depende só da UI escondida.
    if (!usuarioLogado) return;

    fecharCadastroPrestador();

    const overlay = document.createElement("div");
    overlay.className = "ProviderProfile CadastroOverlay";
    overlay.innerHTML = `
        <div class="CadastroOverlayHeader">
            <div class="CadastroOverlayTitle">Meu perfil de prestador</div>
            <button type="button" class="CadastroOverlayClose" aria-label="Fechar cadastro">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </button>
        </div>
        <div class="ProviderProfileBody">
            <div class="CadastroWrap">

                <div class="CadastroMeusSection" id="cadastroMeusSection">
                    <div class="CadastroMeusHeader">
                        <div class="CadastroMeusTitle">Seus cadastros</div>
                        <div class="CadastroMeusContador" id="cadastroMeusContador">0 de ${LIMITE_PRESTADORES_POR_CONTA} cadastros usados</div>
                    </div>

                    <div class="CadastroMeusVazio" id="cadastroMeusVazio" hidden>
                        Apareça no mapa pra quem procura o seu serviço perto daqui — cadastre seu primeiro prestador.
                    </div>

                    <div class="CadastroMeusList" id="cadastroMeusList" hidden></div>

                    <button type="button" class="CadastroNovoBtn" id="cadastroNovoBtn">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"></path>
                        </svg>
                        Cadastrar novo prestador
                    </button>
                    <div class="CadastroHint" id="cadastroLimiteHint" hidden>Limite de ${LIMITE_PRESTADORES_POR_CONTA} cadastros por conta atingido — remova um pra cadastrar outro.</div>
                </div>

                <div class="CadastroFormSection" id="cadastroFormSection" hidden>
                    <div class="CadastroFormTitulo" id="cadastroFormTitulo">Cadastrar novo prestador</div>
                    <div class="CadastroStepsHeader">
                        <div class="CadastroStepsDots" id="cadastroStepsDots">
                            <span class="CadastroStepDot" data-passo="1"></span>
                            <span class="CadastroStepDot" data-passo="2"></span>
                            <span class="CadastroStepDot" data-passo="3"></span>
                            <span class="CadastroStepDot" data-passo="4"></span>
                        </div>
                        <div class="CadastroStepsLabel" id="cadastroStepsLabel">Passo 1 de 4 · Dados básicos</div>
                    </div>

                    <form class="CadastroForm" id="cadastroForm">
                        <div class="CadastroStep" data-passo="1">
                            <label class="CadastroField">
                                <span class="CadastroLabel">Nome</span>
                                <input type="text" name="nome" class="CadastroInput" placeholder="Seu nome completo" required>
                            </label>

                            <label class="CadastroField">
                                <span class="CadastroLabel">Categoria / serviço</span>
                                <input type="text" name="categoria" class="CadastroInput" placeholder="Ex: Eletricista, Mecânico..." required>
                            </label>
                        </div>

                        <div class="CadastroStep" data-passo="2" hidden>
                            <label class="CadastroField">
                                <span class="CadastroLabel">Telefone (WhatsApp)</span>
                                <input type="tel" name="telefone" class="CadastroInput" placeholder="(86) 99999-9999" required>
                            </label>

                            <label class="CadastroField">
                                <span class="CadastroLabel">Palavras-chave (separadas por vírgula)</span>
                                <input type="text" name="tags" class="CadastroInput" placeholder="Ex: fiação, curto, instalação">
                            </label>
                        </div>

                        <div class="CadastroStep" data-passo="3" hidden>
                            <div class="CadastroFieldRow">
                                <label class="CadastroField">
                                    <span class="CadastroLabel">Abre às</span>
                                    <input type="time" name="horarioAbre" class="CadastroInput" value="08:00" required>
                                </label>
                                <label class="CadastroField">
                                    <span class="CadastroLabel">Fecha às</span>
                                    <input type="time" name="horarioFecha" class="CadastroInput" value="18:00" required>
                                </label>
                            </div>

                            <label class="CadastroField">
                                <span class="CadastroLabel">Localização no mapa</span>
                                <div class="CadastroMapPicker" id="cadastroMapPicker"></div>
                            </label>
                            <div class="CadastroHint">Toque no mapa ou arraste o pino pra ajustar onde este prestador aparece.</div>
                        </div>

                        <div class="CadastroStep" data-passo="4" hidden>
                            <div class="FotosPrestadorSection" style="margin-top:0; padding-top:0; border-top:none;">
                                <div class="CadastroMeusTitle">Foto de perfil</div>
                                <div class="FotosPrestadorAvatarRow">
                                    <div class="FotosPrestadorAvatarPreview" id="cadastroFotosAvatarPreview">
                                        <label class="FotosPrestadorAvatarLabel">
                                            <input type="file" accept="image/*" id="cadastroFotosAvatarInput" hidden>
                                            <img id="cadastroFotosAvatarImg" src="" alt="" hidden onerror="this.hidden=true;">
                                        </label>
                                        <span class="FotosPrestadorAvatarBadge">
                                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="14" height="14">
                                                <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                                                <circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"></circle>
                                            </svg>
                                        </span>
                                        <div class="FotosPrestadorUploadProgress" id="cadastroFotosAvatarProgress" hidden>
                                            <svg viewBox="0 0 36 36" class="FotosPrestadorProgressRing">
                                                <circle cx="18" cy="18" r="15.5" class="FotosPrestadorProgressTrack"></circle>
                                                <circle cx="18" cy="18" r="15.5" class="FotosPrestadorProgressBar" id="cadastroFotosAvatarProgressBar"></circle>
                                            </svg>
                                            <span class="FotosPrestadorProgressPct" id="cadastroFotosAvatarProgressPct">0%</span>
                                        </div>
                                    </div>
                                    <div class="CadastroHint">Toque na foto pra trocar. Aparece em círculo — enquadre o rosto/logo no centro.</div>
                                </div>
                            </div>

                            <div class="FotosPrestadorSection">
                                <div class="CadastroMeusTitle">Fotos de capa (até 4)</div>
                                <div class="FotosPrestadorCapaGrid" id="cadastroFotosCapaGrid">
                                    ${[1, 2, 3, 4].map(i => `
                                        <div class="FotosPrestadorCapaItem" data-indice="${i}">
                                            <div class="FotosPrestadorCapaTile is-empty">
                                                <label class="FotosPrestadorCapaTileLabel">
                                                    <input type="file" accept="image/*" hidden>
                                                    <img src="" alt="" hidden
                                                        onerror="this.hidden=true; this.closest('.FotosPrestadorCapaTile').classList.add('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=true;"
                                                        onload="this.hidden=false; this.closest('.FotosPrestadorCapaTile').classList.remove('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=false;">
                                                    <span class="FotosPrestadorCapaTileAdd">+</span>
                                                </label>
                                                ${i === 1 ? `<span class="FotosPrestadorCapaBadge">Principal</span>` : ""}
                                                <button type="button" class="FotosPrestadorCapaGrip" aria-label="Arrastar pra reordenar" hidden>
                                                    <svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor">
                                                        <circle cx="8" cy="6" r="1.6"></circle><circle cx="16" cy="6" r="1.6"></circle>
                                                        <circle cx="8" cy="12" r="1.6"></circle><circle cx="16" cy="12" r="1.6"></circle>
                                                        <circle cx="8" cy="18" r="1.6"></circle><circle cx="16" cy="18" r="1.6"></circle>
                                                    </svg>
                                                </button>
                                                <div class="FotosPrestadorUploadProgress" hidden>
                                                    <svg viewBox="0 0 36 36" class="FotosPrestadorProgressRing">
                                                        <circle cx="18" cy="18" r="15.5" class="FotosPrestadorProgressTrack"></circle>
                                                        <circle cx="18" cy="18" r="15.5" class="FotosPrestadorProgressBar"></circle>
                                                    </svg>
                                                    <span class="FotosPrestadorProgressPct">0%</span>
                                                </div>
                                            </div>
                                        </div>
                                    `).join("")}
                                </div>
                                <div class="CadastroHint">A primeira é a que aparece no popup do mapa; as outras giram no carrossel do perfil. Fotos são opcionais — dá pra concluir sem nenhuma e adicionar depois em "Editar". Segure a alça (⠿) pra reordenar entre fotos já enviadas.</div>
                                <div class="CadastroErro" id="cadastroFotosErro" hidden></div>
                            </div>
                        </div>

                        <div class="CadastroErro" id="cadastroErro" hidden></div>

                        <div class="CadastroFormAcoes">
                            <button type="button" class="CadastroCancelarBtn" id="cadastroVoltarBtn">Cancelar</button>
                            <button type="button" class="CadastroSubmit" id="cadastroAvancarBtn">Próximo</button>
                        </div>
                    </form>

                    <div class="CadastroSuccess" id="cadastroSuccess" hidden>
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                        <div>
                            <div class="CadastroSuccessTitle" id="cadastroSuccessTitulo">Cadastro salvo!</div>
                            <div class="CadastroSuccessText">Você já aparece nas buscas do mapa.</div>
                        </div>
                    </div>
                </div>

                <div class="AvaliacoesPendentesSection" id="avaliacoesPendentesSection" hidden>
                    <div class="CadastroMeusTitle">Avaliações pendentes</div>
                    <div class="AvaliacoesPendentesHint">Você não vê a nota nem o comentário até decidir — só quem avaliou, quando, e se contatou pelo WhatsApp.</div>
                    <div class="AvaliacoesPendentesList" id="avaliacoesPendentesList"></div>
                </div>
            </div>
        </div>
    `;

    overlay.querySelector(".CadastroOverlayClose").addEventListener("click", () => fecharCadastroPrestador());

    const formSection = overlay.querySelector("#cadastroFormSection");
    const formTitulo = overlay.querySelector("#cadastroFormTitulo");
    const novoBtn = overlay.querySelector("#cadastroNovoBtn");
    const form = overlay.querySelector("#cadastroForm");
    const sucesso = overlay.querySelector("#cadastroSuccess");
    const sucessoTitulo = overlay.querySelector("#cadastroSuccessTitulo");
    const erroEl = overlay.querySelector("#cadastroErro");
    const voltarBtn = overlay.querySelector("#cadastroVoltarBtn");
    const avancarBtn = overlay.querySelector("#cadastroAvancarBtn");
    const stepsLabel = overlay.querySelector("#cadastroStepsLabel");
    const stepEls = [...overlay.querySelectorAll(".CadastroStep")];
    const dotEls = [...overlay.querySelectorAll(".CadastroStepDot")];

    const TOTAL_PASSOS = stepEls.length; // 4 (Dados, Contato, Horário/local, Fotos)
    const TITULOS_PASSO = { 1: "Dados básicos", 2: "Contato", 3: "Horário e localização", 4: "Fotos" };
    let passoAtual = 1;

    // null = cadastrando um prestador novo; um objeto = editando um já
    // existente (veio de "Editar" na lista). É essa variável que decide,
    // no passo 3, se a gente faz POST (criar) ou PATCH (atualizar) — e,
    // a partir do momento que existe (seja por já vir preenchida na
    // edição, seja por acabar de ser criada), o passo 4 sabe pra qual id
    // mandar as fotos.
    let prestadorEmEdicao = null;

    // Wizard de 4 passos por tema em vez de um formulário longo de uma vez
    // só — pedir uma coisa de cada vez reduz a sensação de "trabalho" de
    // preencher, e permite validar cada grupo antes de deixar avançar
    // (ex: telefone só é checado quando a pessoa termina o passo dele,
    // não antes). Os 4 <div class="CadastroStep"> convivem no MESMO
    // <form>, só alternando "hidden" — assim o FormData final já pega os
    // campos de todos os passos de dados de uma vez, sem precisar
    // remontar um objeto de estado à parte. O passo 4 (fotos) fica fora
    // desse FormData de propósito — fotos sobem por rota própria
    // (multipart), não em JSON junto com o resto.
    function irParaPasso(passo) {
        passoAtual = passo;
        stepEls.forEach(el => { el.hidden = Number(el.dataset.passo) !== passo; });
        dotEls.forEach(dot => dot.classList.toggle("is-ativo", Number(dot.dataset.passo) <= passo));
        stepsLabel.textContent = `Passo ${passo} de ${TOTAL_PASSOS} · ${TITULOS_PASSO[passo]}`;
        voltarBtn.textContent = passo === 1 ? "Cancelar" : "Voltar";
        if (passo <= 2) avancarBtn.textContent = "Próximo";
        else if (passo === 3) avancarBtn.textContent = prestadorEmEdicao ? "Salvar" : "Cadastrar";
        else avancarBtn.textContent = "Concluir";
        // avancarBtn.type fica sempre "button" de propósito — ver o clique
        // dele mais abaixo. Já tentamos "submit" só no último passo, mas
        // mudar o type DENTRO do próprio handler de clique que leva até
        // esse passo é o que causava o cadastro salvar sozinho: o
        // navegador decide se aquele clique deve submeter o form depois
        // que o handler termina de rodar, então ele via o type já como
        // "submit" e completava o envio — mesmo clique, passo errado.
        erroEl.hidden = true;

        if (passo === 3) inicializarMapaCadastro(cadastroPontoEscolhido || posicaoParaCadastro());
        if (passo === 4) atualizarFontesFotos();

        const primeiroCampo = stepEls[passo - 1].querySelector("input");
        if (primeiroCampo) primeiroCampo.focus();
    }

    // Mesma regra do backend (validarTelefone em prestadores.js) — só pra
    // avisar sem esperar a rede; quem decide de verdade continua sendo o
    // servidor (nunca confiar só na validação do cliente).
    function telefoneValido(telefone) {
        const digitos = String(telefone || "").replace(/\D/g, "");
        if (digitos.length !== 10 && digitos.length !== 11) return false;
        const ddd = Number(digitos.slice(0, 2));
        return ddd >= 11 && ddd <= 99;
    }

    // Valida só os campos do passo atual antes de deixar avançar — o
    // required do HTML já barra vazio; reportValidity() mostra o balão
    // nativo do navegador apontando pro campo certo. Telefone tem uma
    // checagem extra (formato), só quando esse é o passo em questão. O
    // passo 4 (fotos) não tem input nenhum pra validar — sempre passa.
    function passoValido(passo) {
        const stepEl = stepEls[passo - 1];
        const invalido = [...stepEl.querySelectorAll("input")].find(input => !input.checkValidity());
        if (invalido) {
            invalido.reportValidity();
            return false;
        }
        if (passo === 2) {
            const telefone = stepEl.querySelector('[name="telefone"]').value;
            if (!telefoneValido(telefone)) {
                erroEl.textContent = "Telefone inválido. Use um número com DDD, ex: (86) 99999-9999.";
                erroEl.hidden = false;
                return false;
            }
        }
        return true;
    }

    // Pré-preenche os passos 1 a 3 com os dados de um prestador já
    // existente (modo edição). As tags voltam já normalizadas (sem
    // acento/caixa) porque é assim que o backend guarda — não temos como
    // recuperar a grafia original digitada.
    function preencherFormulario(p) {
        form.querySelector('[name="nome"]').value = p.nome;
        form.querySelector('[name="categoria"]').value = p.categoria;
        form.querySelector('[name="telefone"]').value = p.telefone;
        const categoriaNormalizada = normalizar(p.categoria);
        const tagsExtras = (p.tags || []).filter(t => t !== "/all" && t !== categoriaNormalizada);
        form.querySelector('[name="tags"]').value = tagsExtras.join(", ");
        if (p.horario) {
            form.querySelector('[name="horarioAbre"]').value = formatarHora(p.horario.abre);
            form.querySelector('[name="horarioFecha"]').value = formatarHora(p.horario.fecha);
        }
        cadastroPontoEscolhido = { lat: p.lat, lng: p.lng };
    }

    // O formulário só aparece quando pedido — "Seus cadastros" é a tela
    // principal agora (ver abrirConfirmarAcao/renderizarMeusCadastros),
    // o formulário é uma etapa à parte, não fica sempre visível junto.
    // Sem argumento = cadastrar um prestador novo; com um prestador =
    // modo edição (chamado via abrirFormularioEdicaoRef, ver o final
    // desta função).
    function abrirFormulario(prestador = null) {
        resetarPassoFotos();
        form.reset();
        form.querySelector('[name="horarioAbre"]').value = "08:00";
        form.querySelector('[name="horarioFecha"]').value = "18:00";
        cadastroPontoEscolhido = null;
        prestadorEmEdicao = prestador;
        formTitulo.textContent = prestador ? `Editar ${prestador.nome}` : "Cadastrar novo prestador";
        sucessoTitulo.textContent = prestador ? "Alterações salvas!" : "Cadastro salvo!";

        if (prestador) {
            preencherFormulario(prestador);
            atualizarFontesFotos();
        } else {
            usarAvatarGoogleComoPadrao();
        }

        formSection.hidden = false;
        sucesso.hidden = true;
        form.hidden = false;
        irParaPasso(1);
    }

    function fecharFormulario() {
        formSection.hidden = true;
        form.reset();
        form.querySelector('[name="horarioAbre"]').value = "08:00";
        form.querySelector('[name="horarioFecha"]').value = "18:00";
        cadastroPontoEscolhido = null;
        prestadorEmEdicao = null;
        resetarPassoFotos();
        irParaPasso(1);
    }

    novoBtn.addEventListener("click", () => abrirFormulario());

    // Bloqueia o "submit implícito" do HTML: sem isso, apertar Enter (ou o
    // "Concluído"/"Ir" do teclado do celular) num input dispara o submit
    // do form sozinho. O botão em si já não depende mais disso (ver
    // avancarBtn abaixo), mas é uma rede de segurança barata.
    form.addEventListener("keydown", (event) => {
        if (event.key === "Enter" && event.target.tagName !== "TEXTAREA") {
            event.preventDefault();
        }
    });

    voltarBtn.addEventListener("click", () => {
        if (passoAtual === 1) {
            fecharFormulario();
        } else {
            irParaPasso(passoAtual - 1);
        }
    });

    // Único ponto de decisão do botão principal: avança passo, cria/
    // atualiza o cadastro (passo 3→4) ou conclui mandando as fotos
    // pendentes (passo 4). Botão fica sempre type="button" — nunca depende
    // do submit nativo do form (ver comentário em irParaPasso).
    async function avancar() {
        if (passoAtual < 3) {
            if (passoValido(passoAtual)) irParaPasso(passoAtual + 1);
            return;
        }
        if (passoAtual === 3) {
            if (!passoValido(3)) return;
            await salvarDadosBasicos();
            return;
        }
        await concluirFormulario();
    }

    avancarBtn.addEventListener("click", avancar);

    // Rede de segurança equivalente à do keydown acima — mesma função,
    // caminho nenhum depende dela pra funcionar no caso normal.
    form.addEventListener("submit", (event) => {
        event.preventDefault();
        avancar();
    });

    async function salvarDadosBasicos() {
        const dados = Object.fromEntries(new FormData(form).entries());
        erroEl.hidden = true;
        avancarBtn.disabled = true;
        avancarBtn.textContent = prestadorEmEdicao ? "Salvando..." : "Cadastrando...";

        try {
            const posicao = cadastroPontoEscolhido || posicaoParaCadastro();
            prestadorEmEdicao = prestadorEmEdicao
                ? await atualizarPrestadorCadastrado(prestadorEmEdicao.id, dados, posicao)
                : await salvarPrestadorCadastrado(dados, posicao);

            irParaPasso(4);
            renderizarMeusCadastros();
            atualizarRotuloBotaoCadastro();
        } catch (erro) {
            erroEl.textContent = erro.message;
            erroEl.hidden = false;
        } finally {
            avancarBtn.disabled = false;
            avancarBtn.textContent = passoAtual === 3 ? (prestadorEmEdicao ? "Salvar" : "Cadastrar") : "Concluir";
        }
    }

    async function concluirFormulario() {
        // Sobe qualquer foto que já foi cortada mas ainda não confirmada
        // antes de fechar — evita perder silenciosamente uma foto que a
        // pessoa já ajustou e achava que tinha "ficado pronta". Fica no
        // passo 4 se alguma falhar, pra pessoa tentar de novo sem refazer
        // o corte.
        if (fotosPendentes.size > 0) {
            avancarBtn.disabled = true;
            avancarBtn.textContent = "Enviando fotos...";
            const houveFalha = await enviarFotosPendentes();
            avancarBtn.disabled = false;
            avancarBtn.textContent = "Concluir";
            if (houveFalha) return;
        }

        form.hidden = true;
        sucesso.hidden = false;
        setTimeout(() => {
            fecharFormulario();
            form.hidden = false;
        }, 2200);

        renderizarMeusCadastros();
        renderizarAvaliacoesPendentes();
        atualizarRotuloBotaoCadastro();
    }

    /* ==========================================================================
       PASSO 4 · FOTOS — mesmo mecanismo de corte+progresso usado antes num
       overlay à parte, agora embutido como último passo do wizard. Escolher
       (e cortar) uma foto só guarda o resultado em memória, em
       "fotosPendentes" — nada sobe pro servidor até "Concluir" (ver
       concluirFormulario acima). Isso também é o que faz o upload
       acontecer "no ato do cadastro": a pessoa nunca precisa lembrar de
       voltar depois numa tela separada.
       ========================================================================== */
    const fotosPendentes = new Map();
    // Token incrementado a cada abertura/fechamento do form — invalida um
    // fetch do avatar do Google ainda em andamento se a pessoa fechar e
    // reabrir o wizard antes dele terminar (ver usarAvatarGoogleComoPadrao).
    let sessaoFotoAtual = 0;

    const avatarInput = overlay.querySelector("#cadastroFotosAvatarInput");
    const avatarImg = overlay.querySelector("#cadastroFotosAvatarImg");
    const avatarProgressWrap = overlay.querySelector("#cadastroFotosAvatarProgress");
    const avatarProgressBar = overlay.querySelector("#cadastroFotosAvatarProgressBar");
    const avatarProgressPct = overlay.querySelector("#cadastroFotosAvatarProgressPct");
    const fotosErro = overlay.querySelector("#cadastroFotosErro");
    const capaItens = [...overlay.querySelectorAll("#cadastroFotosCapaGrid .FotosPrestadorCapaItem")];

    // Preenche avatar + capas com as fotos já salvas do prestador atual
    // (chamado ao entrar no passo 4, e logo depois de criar/editar) — só
    // faz sentido quando já existe um id de verdade pra montar as URLs.
    // Pula qualquer slot que já tenha uma prévia pendente (foto escolhida
    // na mão, ou o avatar do Google pré-preenchido) — senão isso aqui
    // sobrescreveria a prévia local com a URL definitiva, que ainda nem
    // existe no servidor (a foto só sobe de verdade em "Concluir").
    function atualizarFontesFotos() {
        if (!prestadorEmEdicao) return;
        if (!fotosPendentes.has("foto-perfil")) {
            avatarImg.src = fotoPerfilPrestador(prestadorEmEdicao.id);
        }
        const capasUrls = fotosCapaPrestador(prestadorEmEdicao.id);
        capaItens.forEach((item, i) => {
            if (!fotosPendentes.has(`foto-capa/${i + 1}`)) {
                item.querySelector("img").src = capasUrls[i];
            }
        });
    }

    // Cadastro novo (nunca em edição, que já tem foto própria): usa a
    // foto de perfil do Google como ponto de partida do avatar, sem
    // precisar a pessoa escolher nada — só fica pendente igual uma foto
    // cortada na mão, então "Concluir" sobe ela do mesmo jeito, e trocar
    // o avatar depois substitui essa pendência normalmente.
    async function usarAvatarGoogleComoPadrao() {
        if (!perfilUsuarioCache.avatarUrl) return;
        const minhaSessao = sessaoFotoAtual;

        try {
            // URLs do Google costumam vir como "...=s96-c" (miniatura); troca
            // pro tamanho que a gente de fato usa — o backend recorta pra
            // 500x500 de qualquer jeito, então pedir maior evita ampliar
            // uma miniatura pequena.
            const url = perfilUsuarioCache.avatarUrl.replace(/=s\d+-c$/, "=s480-c");
            const resp = await fetch(url, { referrerPolicy: "no-referrer" });
            if (!resp.ok) return;
            const blob = await resp.blob();

            // se o form fechou/reabriu ou a pessoa já escolheu a própria
            // foto enquanto isso rodava, não pisa em cima
            if (minhaSessao !== sessaoFotoAtual || fotosPendentes.has("foto-perfil")) return;

            fotosPendentes.set("foto-perfil", {
                blob,
                aplicar: (novaUrl) => { avatarImg.src = novaUrl; },
                progressWrap: avatarProgressWrap,
                progressBar: avatarProgressBar,
                progressPct: avatarProgressPct
            });
            avatarImg.src = URL.createObjectURL(blob);
            avatarImg.hidden = false;
        } catch {
            // silencioso — a foto do Google é só uma conveniência, não um
            // requisito; a pessoa ainda escolhe uma foto na mão se quiser
            // ou se isso falhar (CORS, offline etc.)
        }
    }

    // Limpa qualquer estado de fotos entre uma abertura do wizard e outra
    // (ex: cadastrar um prestador, depois abrir "Cadastrar novo" de novo,
    // ou abrir "Editar" de alguém diferente) — sem isso, sobrariam
    // prévias/pendências do prestador anterior.
    function resetarPassoFotos() {
        sessaoFotoAtual++;
        fotosPendentes.clear();
        fotosErro.hidden = true;
        avatarImg.src = "";
        avatarImg.hidden = true;
        capaItens.forEach((item) => {
            const img = item.querySelector("img");
            img.src = "";
            img.hidden = true;
            item.querySelector(".FotosPrestadorCapaTile").classList.add("is-empty");
            item.querySelector(".FotosPrestadorCapaGrip").hidden = true;
        });
    }

    avatarInput.addEventListener("change", async () => {
        const arquivo = avatarInput.files[0];
        avatarInput.value = "";
        if (!arquivo) return;
        fotosErro.hidden = true;

        const blob = await abrirCropImagem({
            arquivo, circular: true, larguraSaida: 480, alturaSaida: 480,
            titulo: "Ajustar foto de perfil"
        });
        if (!blob) return; // cancelou o corte, nada muda

        fotosPendentes.set("foto-perfil", {
            blob,
            aplicar: (novaUrl) => { avatarImg.src = novaUrl; },
            progressWrap: avatarProgressWrap,
            progressBar: avatarProgressBar,
            progressPct: avatarProgressPct
        });
        avatarImg.src = URL.createObjectURL(blob);
        avatarImg.hidden = false;
    });

    capaItens.forEach((item) => {
        const indice = Number(item.dataset.indice);
        const rota = `foto-capa/${indice}`;
        const input = item.querySelector("input");
        const img = item.querySelector("img");
        const tile = item.querySelector(".FotosPrestadorCapaTile");
        const grip = item.querySelector(".FotosPrestadorCapaGrip");
        const progressWrap = item.querySelector(".FotosPrestadorUploadProgress");
        const progressBar = item.querySelector(".FotosPrestadorProgressBar");
        const progressPct = item.querySelector(".FotosPrestadorProgressPct");

        input.addEventListener("change", async () => {
            const arquivo = input.files[0];
            input.value = "";
            if (!arquivo) return;
            fotosErro.hidden = true;

            const blob = await abrirCropImagem({
                arquivo, circular: false, larguraSaida: 800, alturaSaida: 600,
                titulo: indice === 1 ? "Ajustar foto de capa (principal)" : `Ajustar foto de capa ${indice}`
            });
            if (!blob) return;

            fotosPendentes.set(rota, {
                blob,
                aplicar: (novaUrl) => { img.src = novaUrl; },
                progressWrap,
                progressBar,
                progressPct
            });
            img.src = URL.createObjectURL(blob);
            img.hidden = false;
            tile.classList.remove("is-empty");
            grip.hidden = true; // some enquanto for só prévia local, ainda não é foto salva
        });
    });

    async function enviarFotosPendentes() {
        const entradas = [...fotosPendentes.entries()];
        const resultados = await Promise.allSettled(entradas.map(async ([rota, dados]) => {
            dados.progressWrap.hidden = false;
            atualizarAnelProgresso(dados.progressBar, dados.progressPct, 0);
            try {
                await enviarFotoPrestadorComProgresso(prestadorEmEdicao.id, rota, dados.blob, (fracao) => {
                    atualizarAnelProgresso(dados.progressBar, dados.progressPct, fracao);
                });
                const urlDefinitiva = rota === "foto-perfil"
                    ? fotoPerfilPrestador(prestadorEmEdicao.id)
                    : fotosCapaPrestador(prestadorEmEdicao.id)[Number(rota.split("/")[1]) - 1];
                dados.aplicar(`${urlDefinitiva}?t=${Date.now()}`);
                fotosPendentes.delete(rota);
            } finally {
                dados.progressWrap.hidden = true;
            }
        }));

        const falhas = resultados.filter((r) => r.status === "rejected");
        if (falhas.length > 0) {
            fotosErro.textContent = falhas.length === 1
                ? falhas[0].reason.message
                : `${falhas.length} fotos não foram enviadas. ${falhas[0].reason.message}`;
            fotosErro.hidden = false;
            return true;
        }
        return false;
    }

    /* ---- Reordenar: segura a alça (grip) e solta em cima de outra foto
       já enviada pra trocar as duas de posição. Só funciona entre dois
       slots com foto de verdade e já salva — não existe endpoint no
       backend pra apagar uma foto, só sobrescrever uma rota (ver
       enviarFotoPrestadorComProgresso), então soltar em cima de um slot
       vazio deixaria a origem "presa" com a mesma foto duplicada em duas
       posições. Por isso um slot vazio recusa o drop. Reordenar já é uma
       ação direta (arrastar e soltar), então troca na hora, sem passar
       pela confirmação de "Concluir" — diferente de escolher uma foto
       nova. Também não faz sentido pra prévia ainda pendente (grip fica
       escondido nesse caso, ver o "change" acima). ---- */
    let arrastando = null;

    function limparEstadosDrag() {
        capaItens.forEach((el) => {
            el.classList.remove("is-dragging", "is-drop-target", "is-drop-invalido");
        });
    }

    async function trocarFotosCapa(indiceA, indiceB) {
        const itemA = capaItens.find((el) => Number(el.dataset.indice) === indiceA);
        const itemB = capaItens.find((el) => Number(el.dataset.indice) === indiceB);
        const imgA = itemA.querySelector("img");
        const imgB = itemB.querySelector("img");
        const progA = itemA.querySelector(".FotosPrestadorUploadProgress");
        const progB = itemB.querySelector(".FotosPrestadorUploadProgress");

        progA.hidden = false;
        progB.hidden = false;
        fotosErro.hidden = true;

        try {
            const capasUrls = fotosCapaPrestador(prestadorEmEdicao.id);
            // busca as duas fotos atuais (mesmo servidor de uploads) antes de
            // sobrescrever — se UPLOADS_BASE for outra origem sem CORS
            // liberado pro static, esse fetch falha; nesse caso dá pra
            // servir os uploads com header Access-Control-Allow-Origin.
            const [blobA, blobB] = await Promise.all([
                fetch(`${capasUrls[indiceA - 1]}?t=${Date.now()}`).then((r) => r.blob()),
                fetch(`${capasUrls[indiceB - 1]}?t=${Date.now()}`).then((r) => r.blob())
            ]);
            await Promise.all([
                enviarFotoPrestadorComProgresso(prestadorEmEdicao.id, `foto-capa/${indiceA}`, blobB),
                enviarFotoPrestadorComProgresso(prestadorEmEdicao.id, `foto-capa/${indiceB}`, blobA)
            ]);
            imgA.src = `${capasUrls[indiceA - 1]}?t=${Date.now()}`;
            imgB.src = `${capasUrls[indiceB - 1]}?t=${Date.now()}`;
        } catch (erro) {
            fotosErro.textContent = `Não foi possível reordenar: ${erro.message}`;
            fotosErro.hidden = false;
        } finally {
            progA.hidden = true;
            progB.hidden = true;
        }
    }

    overlay.querySelectorAll("#cadastroFotosCapaGrid .FotosPrestadorCapaGrip").forEach((grip) => {
        grip.addEventListener("pointerdown", (evento) => {
            evento.preventDefault();
            const item = grip.closest(".FotosPrestadorCapaItem");
            arrastando = { item, indiceOrigem: Number(item.dataset.indice) };
            item.classList.add("is-dragging");
            grip.setPointerCapture(evento.pointerId);
        });

        grip.addEventListener("pointermove", (evento) => {
            if (!arrastando) return;
            const alvo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(".FotosPrestadorCapaItem");
            capaItens.forEach((el) => el.classList.remove("is-drop-target", "is-drop-invalido"));
            if (alvo && alvo !== arrastando.item && capaItens.includes(alvo)) {
                const vazio = alvo.querySelector(".FotosPrestadorCapaTile").classList.contains("is-empty");
                alvo.classList.add(vazio ? "is-drop-invalido" : "is-drop-target");
            }
        });

        grip.addEventListener("pointerup", async (evento) => {
            if (!arrastando) return;
            const indiceOrigem = arrastando.indiceOrigem;
            const origem = arrastando.item;
            arrastando = null;

            const alvo = document.elementFromPoint(evento.clientX, evento.clientY)?.closest(".FotosPrestadorCapaItem");
            limparEstadosDrag();
            if (!alvo || alvo === origem || !capaItens.includes(alvo)) return;
            if (alvo.querySelector(".FotosPrestadorCapaTile").classList.contains("is-empty")) return; // ver comentário acima

            await trocarFotosCapa(indiceOrigem, Number(alvo.dataset.indice));
        });

        grip.addEventListener("pointercancel", () => { arrastando = null; limparEstadosDrag(); });
    });

    document.body.appendChild(overlay);
    cadastroOverlayEl = overlay;
    abrirFormularioEdicaoRef = abrirFormulario;
    registrarAberturaOverlay(fecharCadastroPrestador);
    renderizarMeusCadastros();
    renderizarAvaliacoesPendentes();
}

function iniciarPaginaPerfil() {
    renderizarPaginaPerfil();
    restaurarSessao(); // se já tinha um id salvo de visita anterior, confirma com o backend e loga sozinho
    iniciarGoogleSignIn();

    const logoutBtn = document.getElementById("profileLogoutBtn");
    const abrirCadastroBtn = document.getElementById("btnAbrirCadastro");
    const editarPerfilBtn = document.getElementById("btnEditarPerfil");

    if (logoutBtn) logoutBtn.addEventListener("click", sair);
    if (abrirCadastroBtn) abrirCadastroBtn.addEventListener("click", abrirCadastroPrestador);
    if (editarPerfilBtn) editarPerfilBtn.addEventListener("click", abrirEditarPerfil);
}

/* ==========================================================================
   RAIO DE BUSCA (botão "km" nos controles do mapa)
   Preferência salva em mase_config_app.raioMaximoKm (null = sem limite),
   igual ao resto das configs. O filtro em si roda dentro de
   buscarPrestadores() — aqui é só a UI do botão/painel e o disparo de
   uma nova busca com o mesmo termo quando o raio muda.
   ========================================================================== */
function atualizarBadgeRaio() {
    const badge = document.getElementById("radiusToggleBadge");
    if (!badge) return;
    if (raioMaximoKm === null) {
        badge.hidden = true;
    } else {
        badge.hidden = false;
        badge.textContent = raioMaximoKm;
    }
}

function atualizarPainelRaioUI() {
    document.querySelectorAll("#radiusPanel .RadiusPanelOption").forEach(botao => {
        const valor = botao.dataset.valor === "todos" ? null : Number(botao.dataset.valor);
        botao.classList.toggle("is-active", valor === raioMaximoKm);
    });
}

function refazerBuscaAtual() {
    // Só reaplica se já existe uma busca em andamento — mudar o raio sem
    // nenhuma busca ativa não deve, sozinho, disparar uma busca nova.
    if (ultimaQueryBuscada) buscarPrestadores(ultimaQueryBuscada);
}

function abrirPainelRaio() {
    const painel = document.getElementById("radiusPanel");
    const botao = document.getElementById("radiusToggle");
    if (!painel || !botao) return;
    painel.hidden = false;
    botao.setAttribute("aria-expanded", "true");
}

function fecharPainelRaio() {
    const painel = document.getElementById("radiusPanel");
    const botao = document.getElementById("radiusToggle");
    if (!painel || !botao) return;
    painel.hidden = true;
    botao.setAttribute("aria-expanded", "false");
}

function iniciarRaioBusca() {
    const config = lerConfigApp();
    raioMaximoKm = config.raioMaximoKm ?? null;
    atualizarBadgeRaio();
    atualizarPainelRaioUI();

    const botao = document.getElementById("radiusToggle");
    const painel = document.getElementById("radiusPanel");
    if (!botao || !painel) return;

    botao.addEventListener("click", (event) => {
        event.stopPropagation(); // não deixa o listener de "clicar fora" (abaixo) fechar na hora
        if (painel.hidden) abrirPainelRaio(); else fecharPainelRaio();
    });

    painel.querySelectorAll(".RadiusPanelOption").forEach(opcao => {
        opcao.addEventListener("click", () => {
            raioMaximoKm = opcao.dataset.valor === "todos" ? null : Number(opcao.dataset.valor);

            const configAtual = lerConfigApp();
            configAtual.raioMaximoKm = raioMaximoKm;
            gravarConfigApp(configAtual);

            atualizarBadgeRaio();
            atualizarPainelRaioUI();
            fecharPainelRaio();
            refazerBuscaAtual();
        });
    });

    // Clicar fora do painel fecha, mesmo padrão leve de overlay dos
    // outros elementos flutuantes do app (ex: lista de resultados).
    document.addEventListener("click", (event) => {
        if (!painel.hidden && !painel.contains(event.target) && event.target !== botao) {
            fecharPainelRaio();
        }
    });
}

function iniciarUI() {
    // Chips de categoria (ver ChipsRow no HTML, vazio por padrão) precisam
    // existir no DOM ANTES de aplicarTemaControles() rodar — ela faz um
    // querySelectorAll(".ThemedControl") único, e se os chips ainda não
    // tiverem sido criados nesse momento, a classe de tema nunca é
    // escrita neles (só resolveria sozinho se o mapa mudasse de tipo
    // depois, disparando o listener maptypeid_changed).
    renderizarChips();
    iniciarPaginaPerfil();
    iniciarConfiguracoes();
    iniciarRaioBusca();


    // Tema inicial dos controles (.ThemedControl) — precisa rodar aqui e
    // não esperar o initApp()/Maps carregar, senão os ícones do Dock ficam
    // com a cor escura padrão sobre o fundo escuro do Dock (invisíveis)
    // até a API do Google Maps responder. iniciarConfiguracoes() (acima)
    // já carregou preferenciaTemaControles do localStorage antes daqui.
    aplicarTemaPreferencia();

    document.querySelectorAll(".Dock button[data-page]").forEach(botao => {
        botao.addEventListener("click", () => trocarAba(botao.dataset.page));
    });

    document.querySelectorAll(".Chip[data-query]").forEach(chip => {
        chip.addEventListener("click", () => {
            if (!map || !searchInput) return; // Maps ainda não carregou

            if (chip.classList.contains("is-active")) {
                // clicar de novo no chip já ativo desliga o filtro
                limparChipAtivo();
                if (buscaTimeoutId) {
                    clearTimeout(buscaTimeoutId);
                    buscaTimeoutId = null;
                }
                searchInput.value = "";
                atualizarVisibilidadeClearBtn();
                limparMarcadores();
                esconderLista();
                return;
            }

            ativarChipPorQuery(chip.dataset.query);
            buscarPorCategoria(chip.dataset.query, chip.textContent.trim());
        });
    });

    // Clicar fora da área de busca (fora do campo, dos chips e da própria
    // lista) fecha a lista de resultados — ex: tocar no mapa pra ver os
    // pins sem a lista por cima. Os marcadores continuam plotados, só a
    // lista some (mesmo comportamento do FindButton/Enter). Fica em
    // iniciarUI() porque não depende do Maps ter carregado: a lista pode
    // estar visível mesmo antes disso.
    document.addEventListener("click", (event) => {
        const searchWrap = document.querySelector(".SearchWrap");
        if (searchWrap && !searchWrap.contains(event.target)) {
            if (buscaTimeoutId) {
                clearTimeout(buscaTimeoutId);
                buscaTimeoutId = null;
            }
            esconderLista();
        }
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarUI);
} else {
    iniciarUI();
}

let map;
let markers = [];
let currentPopup = null;
let CustomPopup; // definida dentro de initApp(), depois que google.maps.OverlayView existir

// Instância única do agrupador de pins (biblioteca @googlemaps/markerclusterer,
// carregada via CDN no index.html — ver clusterRenderer mais abaixo). Criada
// na primeira busca com resultado; buscas seguintes só trocam os marcadores
// dela (clearMarkers/addMarkers), não recriam a instância.
let markerCluster = null;

let userLocationMarker = null;
let userConeElement = null;
let watchId = null;
let orientationHandlerAtivo = false;
let mapaCentralizadoNoUsuario = false;

// Última posição real do usuário (GPS), atualizada a cada leitura do
// watchPosition. Usada como base de cálculo de distância na busca —
// em vez do centro do mapa, que muda se o usuário arrastar a tela.
let usuarioLat = null;
let usuarioLng = null;

// Raio máximo de busca (km) — null = sem limite. Carregado de
// mase_config_app em iniciarConfiguracoes(), junto do resto das
// preferências. Guarda também a última query buscada, pra dar pra
// reaplicar a busca na hora quando o raio muda sem o usuário digitar
// de novo (ver refazerBuscaAtual/abrirPainelRaio).
let raioMaximoKm = null;
let ultimaQueryBuscada = "";

// Referência ao campo de busca, preenchida dentro de initApp() — fica
// como variável de topo (e não const local) pra que os chips de categoria
// (ligados fora do initApp(), em iniciarUI()) também consigam escrever
// nela sem precisar duplicar a busca do elemento.
let searchInput = null;

// Mostra o "x" só quando há texto no campo — chamado tanto ao digitar
// quanto ao preencher o campo programaticamente (chip de categoria).
function atualizarVisibilidadeClearBtn() {
    const clearBtn = document.getElementById("clearSearchBtn");
    if (!clearBtn || !searchInput) return;
    clearBtn.hidden = searchInput.value.trim() === "";
}

// Chip atualmente ativo (classe .is-active) — no máximo um por vez.
let chipAtivo = null;

// Controla o atraso simulado entre "usuário digitou" (ou clicou num chip)
// e o resultado aparecer — dá tempo do skeleton (placeholder animado)
// aparecer na lista antes dos resultados reais, e serve de debounce
// natural (evita recalcular a busca a cada tecla digitada).
let buscaTimeoutId = null;
const ATRASO_BUSCA_MS = 400;

/* ==========================================================================
   ROTAS DE IMAGEM — perfil (avatar) e capa (foto do local) são pastas
   diferentes dentro de public/uploads/prestadores no backend. A URL
   PÚBLICA é "/uploads/..." (o que o server.js expõe via
   express.static — ver app.use("/uploads", ...)), não o caminho de
   disco "backend/src/public/uploads/..." — usar o caminho de disco
   como URL dá 404 na certa. Absoluta (com UPLOADS_BASE) pelo mesmo
   motivo do urlAbsolutaFoto no backend: front e backend podem estar em
   portas diferentes.
   ========================================================================== */
function fotoPerfilPrestador(id) {
    return `${UPLOADS_BASE}/uploads/prestadores/perfil/${id}.webp`;
}

function fotoCapaPrestador(id) {
    return `${UPLOADS_BASE}/uploads/prestadores/capa/${id}.webp`;
}

// 4 fotos de capa por prestador (a primeira reaproveita fotoCapaPrestador,
// pra não quebrar o que já estava cadastrado) — usadas no carrossel que
// alterna sozinho no perfil (ver iniciarRotacaoCapa). Cada uma cai no
// placeholder individualmente se não existir, igual o resto do app.
function fotosCapaPrestador(id) {
    return [
        fotoCapaPrestador(id),
        `${UPLOADS_BASE}/uploads/prestadores/capa/${id}-2.webp`,
        `${UPLOADS_BASE}/uploads/prestadores/capa/${id}-3.webp`,
        `${UPLOADS_BASE}/uploads/prestadores/capa/${id}-4.webp`
    ];
}

// Diferente das fotos acima: o placeholder NÃO é um upload dinâmico do
// backend, é um asset fixo que já vem junto com o front (pasta img/ do
// próprio site) — por isso não leva UPLOADS_BASE nem "/uploads/". Não
// faz sentido esse arquivo morar no backend: ele existe pra cobrir
// justamente quando não há foto nenhuma salva ali.
const CAPA_PLACEHOLDER = "/img/placeholders/capa-placeholder.webp";
const AVATAR_PLACEHOLDER = [
    "/img/placeholders/avatar-placeholder-1.webp",
    "/img/placeholders/avatar-placeholder-2.webp",
    "/img/placeholders/avatar-placeholder-3.webp",
    "/img/placeholders/avatar-placeholder-4.webp",
    "/img/placeholders/avatar-placeholder-5.webp",
    "/img/placeholders/avatar-placeholder-6.webp",
];

/* ==========================================================================
   AVATAR (círculo com a inicial + foto de perfil por cima, quando existir)
   A foto cobre a letra quando carrega; se der 404, ela mesma se esconde
   (display:none) e a letra por baixo volta a aparecer sozinha.
   ========================================================================== */
/* ==========================================================================
   AVATAR (círculo com a inicial + foto de perfil por cima, quando existir)
   A foto cobre a letra quando carrega; se der 404, cai num placeholder
   ilustrado (ver placeholderAvatar) em vez de deixar a letra sozinha.
   className decide só o tamanho/contexto (perfil, lista, popup do mapa);
   position/overflow vêm inline pra não depender de cada classe CSS
   lembrar de declarar isso.
   ========================================================================== */
function avatarHTML(prestador, className) {
    return `
        <div class="${className}" style="background-color:${prestador.cor}; position:relative; overflow:hidden;">
            <span>${prestador.categoria.charAt(0)}</span>
            <img src="${fotoPerfilPrestador(prestador.id)}" alt="Foto de perfil de ${prestador.nome}"
                style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                onload="this.previousElementSibling.style.display='none';"
                onerror="this.onerror=null; this.src='${placeholderAvatar(prestador)}';">
        </div>
    `;
}

// Mesmo padrão de letra+foto usado em avatarHTML() (prestador) e no avatar
// do próprio usuário (renderizarPaginaPerfil) — aqui pra avatar de CLIENTE
// (quem avaliou), que não tem "categoria"/cor fixa, então cai pra letra do
// nome sobre --ink (cor já definida nas classes .ProviderProfileReviewAvatar
// / .AvaliacaoPendenteAvatar em style.css). avatarUrl vem de
// usuarios.avatar_url no backend — mesma foto de perfil do Google usada em
// perfilUsuarioCache, não upload nosso — por isso precisa de
// referrerpolicy="no-referrer" (o CDN lh3.googleusercontent.com às vezes
// recusa a imagem se a página mandar o referrer completo, mesmo problema
// já contornado em renderizarPaginaPerfil). avatarUrl pode vir
// null/undefined (usuário sem foto no Google) — nesse caso nem tenta a
// img, fica só na letra.
function avatarClienteHTML(nome, avatarUrl, className) {
    const inicial = (nome || "?").trim().charAt(0).toUpperCase();
    return `
        <div class="${className}" style="position:relative; overflow:hidden;">
            <span>${inicial}</span>
            ${avatarUrl ? `
            <img src="${avatarUrl}" alt="" referrerpolicy="no-referrer"
                style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                onload="this.previousElementSibling.style.display='none';"
                onerror="this.remove();">
            ` : ""}
        </div>
    `;
}

function fecharPopup(viaPopstate) {
    registrarFechamentoOverlay(fecharPopup, viaPopstate);
    if (currentPopup) {
        currentPopup.setMap(null);
        currentPopup = null;
    }
}

function abrirPopup(position, prestador) {
    fecharPopup();
    currentPopup = new CustomPopup(position, prestador);
    currentPopup.setMap(map);
    registrarAberturaOverlay(fecharPopup);
}

function normalizar(texto) {
    return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
}

function calcularDistanciaKm(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatarDistancia(km) {
    return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`;
}

/* ==========================================================================
   LINK DO WHATSAPP — wa.me exige número completo com código do país, só
   dígitos (daí o replace + prefixo "55"). O telefone continua nos dados,
   mas só aparece como link ("Chamar {nome} no WhatsApp"), não como texto.
   ========================================================================== */
function linkWhatsapp(prestador) {
    const digitos = prestador.telefone.replace(/\D/g, "");
    const numeroCompleto = `55${digitos}`;
    const primeiroNome = prestador.nome.split(" ")[0];
    const mensagem = `Olá, *${primeiroNome}*! 
Te encontrei no *Mase*, estou precisando de um ${prestador.categoria.toLowerCase()}.`;
    return `https://wa.me/${numeroCompleto}?text=${encodeURIComponent(mensagem)}`;
}

/* ==========================================================================
   TELA DE PERFIL DO PRESTADOR ("Ver perfil")
   Overlay de tela cheia, criado/destruído sob demanda (mesmo espírito do
   CustomPopup do mapa, só que cobrindo a tela toda). Reaproveita os dados
   do popup pequeno + uma bio de exemplo fixa (trocar quando existir bio
   real em PRESTADORES).
   ========================================================================== */
let perfilOverlayEl = null;
let perfilCapaIntervalId = null;

function fecharPerfilPrestador(viaPopstate) {
    registrarFechamentoOverlay(fecharPerfilPrestador, viaPopstate);
    if (perfilCapaIntervalId) {
        clearInterval(perfilCapaIntervalId);
        perfilCapaIntervalId = null;
    }
    if (perfilOverlayEl) {
        perfilOverlayEl.remove();
        perfilOverlayEl = null;
    }
}

// Alterna a classe is-active entre os slides da capa a cada 2s. Roda
// enquanto o perfil estiver aberto — a própria fecharPerfilPrestador()
// limpa o intervalo, então não fica rodando em segundo plano depois que
// o overlay já foi removido do DOM.
const INTERVALO_ROTACAO_CAPA_MS = 2000;

function iniciarRotacaoCapa(container) {
    const slides = container.querySelectorAll(".ProviderProfileCoverImg");
    if (slides.length <= 1) return;

    let indiceAtual = 0;
    perfilCapaIntervalId = setInterval(() => {
        slides[indiceAtual].classList.remove("is-active");
        indiceAtual = (indiceAtual + 1) % slides.length;
        slides[indiceAtual].classList.add("is-active");
    }, INTERVALO_ROTACAO_CAPA_MS);
}

// Mesmo prazo do backend (ver backend/src/jobs/expirarAvaliacoes.js) —
// usado só pra exibir "expira em Xd" na fila de pendentes; quem decide de
// verdade quando publicar sozinho é o job do servidor, isso aqui é só o
// texto informativo.
const PRAZO_AVALIACAO_DIAS = 7;
const PRAZO_AVALIACAO_MS = PRAZO_AVALIACAO_DIAS * 24 * 60 * 60 * 1000;

// Última avaliação real (publicada) de um prestador. Sem avaliação real
// ainda, retorna null — quem chama decide como representar esse estado
// vazio, sem fallback fictício.
async function avaliacaoParaExibir(prestador) {
    try {
        const resp = await fetch(`${API_BASE}/prestadores/${prestador.id}/avaliacoes/ultima`);
        if (!resp.ok) throw new Error(`GET .../avaliacoes/ultima respondeu ${resp.status}`);
        return resp.json();
    } catch (erro) {
        console.warn("Não foi possível carregar a última avaliação:", erro);
        return null;
    }
}

// Registra o clique no botão de WhatsApp (perfil e popup do mapa) — o
// backend usa isso pra aplicar a tag "Contatou pelo WhatsApp" numa
// avaliação subsequente do mesmo usuário (ver JANELA_TAG_WHATSAPP_MS em
// routes/avaliacoes.js). Funciona sem login (não manda x-usuario-id se
// não tiver usuarioId) — o servidor só não grava nada nesse caso.
function registrarCliqueWhatsapp(prestadorId) {
    fetch(`${API_BASE}/prestadores/${prestadorId}/whatsapp-clique`, {
        method: "POST",
        headers: usuarioId ? { "x-usuario-id": usuarioId } : {}
    }).catch(erro => console.warn("Não foi possível registrar o clique de WhatsApp:", erro));
}

/* ==========================================================================
   FOTOS DE CLIENTES ("Fotos dos clientes" no perfil)
   Agora vem do backend de verdade — GET /prestadores/:id/fotos-clientes,
   que só devolve foto de avaliação PUBLICADA (mesma regra da fila cega:
   nada vaza antes do dono decidir). Nem todo prestador tem foto ainda
   (é opcional no formulário de avaliação, ver abrirAvaliarPrestador),
   então pode voltar array vazio — quem chama trata esse estado vazio,
   sem inventar foto de exemplo pra preencher.
   ========================================================================== */
async function fotosClientesPrestador(prestadorId) {
    try {
        const resp = await fetch(`${API_BASE}/prestadores/${prestadorId}/fotos-clientes`);
        if (!resp.ok) throw new Error(`GET .../fotos-clientes respondeu ${resp.status}`);
        return await resp.json();
    } catch (erro) {
        console.warn("Não foi possível carregar as fotos de clientes:", erro);
        return [];
    }
}

// Lightbox simples pra abrir a foto em tela cheia ao tocar na galeria —
// mesmo espírito do ProviderProfile (overlay criado/destruído sob
// demanda), só que por cima dele (z-index maior, ver style.css).
let lightboxEl = null;

function fecharLightbox(viaPopstate) {
    registrarFechamentoOverlay(fecharLightbox, viaPopstate);
    if (lightboxEl) {
        lightboxEl.remove();
        lightboxEl = null;
    }
}

function abrirLightbox(src, autor) {
    fecharLightbox();

    const overlay = document.createElement("div");
    overlay.className = "PhotoLightbox";
    overlay.innerHTML = `
        <button type="button" class="PhotoLightboxClose" aria-label="Fechar foto">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </button>
        <img class="PhotoLightboxImg" src="${src}" alt="Foto de serviço enviada por ${autor}"
            onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
        <div class="PhotoLightboxCaption">Enviada por ${autor}</div>
    `;

    overlay.querySelector(".PhotoLightboxClose").addEventListener("click", () => fecharLightbox());
    // clicar no fundo escuro (fora da foto/legenda) também fecha
    overlay.addEventListener("click", (event) => {
        if (event.target === overlay) fecharLightbox();
    });

    document.body.appendChild(overlay);
    lightboxEl = overlay;
    registrarAberturaOverlay(fecharLightbox);
}

/* ==========================================================================
   AVALIAR PRESTADOR — POST /api/prestadores/:id/avaliacoes
   Nasce "pendente" no backend (fila cega), não aparece na hora no perfil.
   Por isso a mensagem de sucesso é explícita sobre isso, pra não parecer
   que a avaliação sumiu ou falhou silenciosamente. Exige login, igual
   salvar na lista — o backend também recusa sem x-usuario-id
   (exigirUsuario em routes/avaliacoes.js).

   Foto é opcional e some no mesmo lugar: entra "cega" também — o dono só
   vê que a avaliação existe (fila de pendentes não mostra a foto), e o
   público só vê a foto depois que a avaliação for aceita e publicada
   (galeria "Fotos dos clientes", ver fotosClientesPrestador). Por isso o
   envio usa FormData/multipart em vez de JSON: precisa carregar o
   arquivo junto com nota/comentário no mesmo POST.

   Sem limite de tamanho checado aqui no front — o arquivo original
   passa por comprimirImagemParaUpload antes de subir (ver mais abaixo),
   então mesmo uma foto de 15-20MB direto do celular já chega comprimida
   no servidor. O backend mantém seu próprio teto (TAMANHO_MAXIMO_BYTES
   em avaliacoes.js) como rede de segurança, então não fica sem limite
   nenhum — só não barra a pessoa aqui na tela por conta do arquivo
   original ser grande.
   ========================================================================== */

function abrirAvaliarPrestador(prestador) {
    if (!usuarioLogado) {
        alert("Entre na sua conta (aba Perfil) pra avaliar.");
        return;
    }

    const overlay = abrirOverlayGenerico(`Avaliar ${prestador.nome}`, `
        <form class="CadastroForm" id="avaliarForm">
            <div class="AvaliarStars" id="avaliarStars" role="radiogroup" aria-label="Nota de 1 a 5 estrelas">
                ${[1, 2, 3, 4, 5].map(n => `
                    <button type="button" class="AvaliarStar" data-valor="${n}" aria-label="${n} estrela${n > 1 ? "s" : ""}">★</button>
                `).join("")}
            </div>
            <input type="hidden" name="nota" id="avaliarNotaInput" value="">

            <label class="CadastroField">
                <span class="CadastroLabel">Comentário</span>
                <textarea name="comentario" class="CadastroInput CadastroTextarea" rows="4" maxlength="500"
                    placeholder="Como foi o atendimento?" required></textarea>
            </label>

            <div class="CadastroField">
                <span class="CadastroLabel">Foto do serviço (opcional)</span>
                <input type="file" name="foto" id="avaliarFotoInput" accept="image/*" hidden>
                <div class="AvaliarFotoWrap" id="avaliarFotoWrap">
                    <label for="avaliarFotoInput" class="AvaliarFotoBtn" id="avaliarFotoBtn">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                                stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                            <circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.6"></circle>
                        </svg>
                        Adicionar foto
                    </label>
                    <div class="AvaliarFotoPreview" id="avaliarFotoPreview" hidden>
                        <img id="avaliarFotoPreviewImg" alt="Prévia da foto selecionada">
                        <span id="avaliarFotoPreviewFallback" class="AvaliarFotoPreviewFallback" hidden style="font-size: 13px; color: var(--muted, #6b7280); padding: 8px 4px;">Foto selecionada (sem prévia)</span>
                        <button type="button" class="AvaliarFotoRemover" id="avaliarFotoRemover" aria-label="Remover foto selecionada">
                            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                            </svg>
                        </button>
                    </div>
                </div>
            </div>

            <div class="CadastroErro" id="avaliarErro" hidden></div>
            <button type="submit" class="CadastroSubmit">Enviar avaliação</button>
        </form>

        <div class="CadastroSuccess" id="avaliarSucesso" hidden>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
            <div>
                <div class="CadastroSuccessTitle">Avaliação enviada!</div>
                <div class="CadastroSuccessText">Fica em análise até ${prestador.nome.split(" ")[0]} responder — ou até 7 dias, se não responder (aí publica sozinha).</div>
            </div>
        </div>
    `);

    const form = overlay.querySelector("#avaliarForm");
    const estrelas = overlay.querySelectorAll(".AvaliarStar");
    const notaInput = overlay.querySelector("#avaliarNotaInput");
    const erroEl = overlay.querySelector("#avaliarErro");
    const sucessoEl = overlay.querySelector("#avaliarSucesso");
    const botao = form.querySelector(".CadastroSubmit");

    estrelas.forEach(estrela => {
        estrela.addEventListener("click", () => {
            const valor = Number(estrela.dataset.valor);
            notaInput.value = valor;
            estrelas.forEach(e => e.classList.toggle("is-active", Number(e.dataset.valor) <= valor));
        });
    });

    // ---- Campo de foto: seleção, preview e remoção ----
    // Fica só no cliente até o submit (nenhum upload acontece aqui) — o
    // arquivo escolhido viaja junto no FormData do envio final. Validar
    // tipo/tamanho aqui é só pra dar feedback rápido; o backend valida de
    // novo de qualquer forma (nunca confiar só no que o navegador manda).
    const fotoInput = overlay.querySelector("#avaliarFotoInput");
    const fotoBtn = overlay.querySelector("#avaliarFotoBtn");
    const fotoPreview = overlay.querySelector("#avaliarFotoPreview");
    const fotoPreviewImg = overlay.querySelector("#avaliarFotoPreviewImg");
    const fotoPreviewFallback = overlay.querySelector("#avaliarFotoPreviewFallback");
    const fotoRemover = overlay.querySelector("#avaliarFotoRemover");
    let fotoPreviewUrl = null;

    function limparFotoSelecionada() {
        fotoInput.value = "";
        if (fotoPreviewUrl) {
            URL.revokeObjectURL(fotoPreviewUrl);
            fotoPreviewUrl = null;
        }
        fotoPreview.hidden = true;
        fotoBtn.hidden = false;
    }

    // Se o navegador não conseguir decodificar o arquivo pra prévia (caso
    // comum: foto tirada em HEIC, formato padrão da câmera do iPhone —
    // Chrome/Firefox/Android não sabem exibir HEIC num <img>, só o
    // Safari), mostra um aviso simples em vez de deixar o ícone de
    // imagem quebrada. O arquivo continua selecionado normalmente: a
    // falta de prévia não impede o envio, quem decide se manda ou não é
    // comprimirImagemParaUpload() no submit (ver mais abaixo).
    fotoPreviewImg.addEventListener("error", () => {
        fotoPreviewImg.hidden = true;
        fotoPreviewFallback.hidden = false;
    });

    fotoInput.addEventListener("change", () => {
        const arquivo = fotoInput.files[0];
        if (!arquivo) return;

        if (!arquivo.type.startsWith("image/")) {
            erroEl.textContent = "Escolha um arquivo de imagem (JPG, PNG, WEBP...).";
            erroEl.hidden = false;
            limparFotoSelecionada();
            return;
        }

        erroEl.hidden = true;
        fotoPreviewImg.hidden = false;
        fotoPreviewFallback.hidden = true;
        if (fotoPreviewUrl) URL.revokeObjectURL(fotoPreviewUrl);
        fotoPreviewUrl = URL.createObjectURL(arquivo);
        fotoPreviewImg.src = fotoPreviewUrl;
        fotoPreview.hidden = false;
        fotoBtn.hidden = true;
    });

    fotoRemover.addEventListener("click", limparFotoSelecionada);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        erroEl.hidden = true;

        const nota = Number(notaInput.value);
        if (!nota) {
            erroEl.textContent = "Escolha uma nota de 1 a 5 estrelas.";
            erroEl.hidden = false;
            return;
        }

        // FormData em vez de JSON: precisa levar o arquivo (se houver)
        // junto com nota/comentário no mesmo POST multipart. Não define
        // Content-Type manualmente — o navegador monta o header com o
        // boundary certo sozinho; fixar "multipart/form-data" na mão
        // quebra o parsing porque falta o boundary.
        const dadosForm = new FormData(form);
        dadosForm.set("nota", String(nota));
        if (fotoInput.files[0]) {
            // Recomprime antes de mandar (ver comprimirImagemParaUpload) —
            // evita "Failed to fetch" por estourar o limite de corpo da
            // requisição da Vercel com foto de celular sem compressão. Se
            // a compressão falhar (ex: HEIC do iPhone que o Canvas/Image
            // do navegador não decodifica), manda o arquivo original em
            // vez de bloquear o envio — o backend (sharp) tem mais chance
            // de dar conta do formato do que travar a pessoa aqui.
            try {
                const fotoComprimida = await comprimirImagemParaUpload(fotoInput.files[0]);
                dadosForm.set("foto", fotoComprimida, "foto.jpg");
            } catch (erro) {
                console.warn("Não foi possível comprimir a foto no navegador, enviando original:", erro);
                dadosForm.set("foto", fotoInput.files[0]);
            }
        } else {
            dadosForm.delete("foto"); // opcional: não manda campo vazio
        }

        botao.disabled = true;
        botao.textContent = "Enviando...";

        try {
            const resp = await fetch(`${API_BASE}/prestadores/${prestador.id}/avaliacoes`, {
                method: "POST",
                headers: { "x-usuario-id": usuarioId },
                body: dadosForm
            });

            if (!resp.ok) {
                const corpo = await resp.json().catch(() => ({}));
                throw new Error(corpo.erro || `Não foi possível enviar (HTTP ${resp.status}).`);
            }

            form.hidden = true;
            sucessoEl.hidden = false;
        } catch (erro) {
            erroEl.textContent = erro.message;
            erroEl.hidden = false;
            botao.disabled = false;
            botao.textContent = "Enviar avaliação";
        }
    });
}

async function abrirPerfilPrestador(prestador) {
    fecharPerfilPrestador();

    const avaliacao = await avaliacaoParaExibir(prestador);
    const nota = textoNotaPrestador(prestador.nota);
    const fotos = await fotosClientesPrestador(prestador.id);

    const overlay = document.createElement("div");
    overlay.className = "ProviderProfile";
    overlay.innerHTML = `
        <div class="ProviderProfileCover">
            ${fotosCapaPrestador(prestador.id).map((src, indice) => `
                <img class="ProviderProfileCoverImg${indice === 0 ? " is-active" : ""}" src="${src}"
                    alt="Foto do local de ${prestador.nome}"
                    onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
            `).join("")}
            <button type="button" class="ProviderProfileClose" aria-label="Fechar perfil">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round"></path>
                </svg>
            </button>
        </div>
        <div class="ProviderProfileBody">
            <div class="ProviderProfileHeader">
                ${avatarHTML(prestador, "ProviderProfileAvatar")}
                <div>
                    <div class="ProviderProfileName">${prestador.nome}</div>
                    <div class="ProviderProfileCategory">${prestador.categoria}</div>
                </div>
            </div>
            <div class="ProviderProfileRating${nota.temNota ? "" : " is-empty"}">${nota.estrelas}${nota.temNota ? ` <span>(${nota.contagem})</span>` : ""}</div>
            <div class="ProviderProfileStatusRow">${badgeHorarioHTML(prestador)}</div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Sobre</div>
                <div class="ProviderProfileBio">Atendimento como ${prestador.categoria.toLowerCase()} na região de Teresina. Em breve: fotos de trabalhos anteriores, horários disponíveis e mais avaliações por aqui.</div>
            </div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Última avaliação</div>
                ${avaliacao ? `
                <div class="ProviderProfileReview">
                    <div class="ProviderProfileReviewHeader">
                        ${avatarClienteHTML(avaliacao.nome, avaliacao.avatarUrl, "ProviderProfileReviewAvatar")}
                        <div>
                            <div class="ProviderProfileReviewName">${avaliacao.nome}</div>
                            <div class="ProviderProfileReviewStars">${"★".repeat(avaliacao.nota)}${"☆".repeat(5 - avaliacao.nota)}</div>
                        </div>
                    </div>
                    <div class="ProviderProfileReviewText">"${avaliacao.comentario}"</div>
                </div>
                ` : `
                <div class="ProviderProfileReviewEmpty">Esse prestador ainda não recebeu avaliações.</div>
                `}
            </div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Fotos dos clientes</div>
                ${fotos.length > 0 ? `
                <div class="ProviderProfileGallery">
                    ${fotos.map(foto => `
                        <button type="button" class="ProviderProfileGalleryItem" data-src="${foto.src}" data-autor="${foto.autor}">
                            <img src="${foto.src}" alt="Foto de serviço enviada por ${foto.autor}"
                                onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
                            <span class="ProviderProfileGalleryCaption">${foto.autor}</span>
                        </button>
                    `).join("")}
                </div>
                ` : `
                <div class="ProviderProfileGalleryEmpty">Nenhuma foto de cliente ainda — a primeira avaliação com foto aparece aqui.</div>
                `}
            </div>
            <a class="ProviderProfileWhatsapp" href="${linkWhatsapp(prestador)}" target="_blank" rel="noopener noreferrer">
                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18a7.9 7.9 0 0 1-4.03-1.1l-.29-.17-3 .79.8-2.93-.19-.3A7.93 7.93 0 1 1 12 20Zm4.4-5.6c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"></path>
                </svg>
                Chamar ${prestador.nome.split(" ")[0]} no WhatsApp
            </a>
            <div class="ProviderProfileSecondaryActions">
                <button type="button" class="ProviderProfileSecondaryBtn${prestadorEstaSalvo(prestador.id) ? " is-saved" : ""}" data-action="salvar-lista">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path class="SaveIconShape" d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1Z"
                            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    </svg>
                    <span class="ProviderProfileSecondaryBtnLabel">${prestadorEstaSalvo(prestador.id) ? "Salvo" : "Salvar na lista"}</span>
                </button>
                <button type="button" class="ProviderProfileSecondaryBtn" data-action="avaliar">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 3.5l2.7 5.6 6.1.9-4.4 4.3 1 6.1-5.4-2.9-5.4 2.9 1-6.1-4.4-4.3 6.1-.9L12 3.5Z"
                            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    </svg>
                    Avaliar prestador
                </button>
            </div>
        </div>
    `;

    overlay.querySelector(".ProviderProfileClose").addEventListener("click", () => fecharPerfilPrestador());

    overlay.querySelector(".ProviderProfileWhatsapp").addEventListener("click", () => {
        registrarCliqueWhatsapp(prestador.id);
    });

    const btnSalvar = overlay.querySelector('[data-action="salvar-lista"]');
    btnSalvar.addEventListener("click", async () => {
        if (!usuarioLogado) {
            alert("Entre na sua conta (aba Perfil) pra salvar prestadores na lista.");
            return;
        }

        btnSalvar.disabled = true;
        try {
            const salvoAgora = await alternarPrestadorSalvo(prestador.id);
            btnSalvar.classList.toggle("is-saved", salvoAgora);
            btnSalvar.querySelector(".ProviderProfileSecondaryBtnLabel").textContent = salvoAgora ? "Salvo" : "Salvar na lista";

            // Se a aba Salvos já estiver montada em segundo plano, atualiza ela
            // também — assim, ao voltar pra lá, não mostra um estado velho.
            if (document.getElementById("page-List")) {
                renderizarPaginaSalvos();
            }
        } catch (erro) {
            console.warn("Não foi possível salvar/remover:", erro);
            alert(erro.message);
        } finally {
            btnSalvar.disabled = false;
        }
    });

    overlay.querySelector('[data-action="avaliar"]').addEventListener("click", () => {
        abrirAvaliarPrestador(prestador);
    });

    overlay.querySelectorAll(".ProviderProfileGalleryItem").forEach(item => {
        item.addEventListener("click", () => {
            abrirLightbox(item.dataset.src, item.dataset.autor);
        });
    });

    document.body.appendChild(overlay);
    perfilOverlayEl = overlay;
    registrarAberturaOverlay(fecharPerfilPrestador);
    iniciarRotacaoCapa(overlay.querySelector(".ProviderProfileCover"));
}

/* ==========================================================================
   BOLINHA AZUL DE LOCALIZAÇÃO DO USUÁRIO
   Usa navigator.geolocation.watchPosition para acompanhar a posição em
   tempo real. Na primeira leitura, centraliza o mapa nela; nas próximas,
   só atualiza a posição do marcador sem mexer no zoom/centro do mapa
   (assim não atrapalha o usuário se ele já tiver navegado pra outro lugar).
   ========================================================================== */
function criarMarcadorUsuarioSeNecessario(posicao) {
    if (userLocationMarker) return;

    // Sistema de coordenadas fixo dentro do SVG (não depende de nenhum
    // cálculo de "border-triangle" ou position:absolute solto).
    // Ponto de ancoragem real (centro da bolinha) = (20, 64) no SVG.
    // O cone é um polígono com a PONTA exatamente nesse ponto e a base
    // (parte larga) 34px acima, representando o feixe de direção.
    const SVG_W = 40;
    const CENTRO_X = 20;
    const CENTRO_Y = 64; // = altura do wrapper (ver abaixo)
    const CONE_ALTURA = 20; // mais curto (era 34)
    const CONE_LARGURA = 17; // mais largo (era 13, medido do centro até cada lado)
    const SVG_H = CENTRO_Y + 10; // margem de 10px abaixo do centro para a metade inferior da bolinha; o SVG tem overflow:visible, então o cone pode ultrapassar o topo do viewBox sem ser cortado

    const wrapper = document.createElement("div");
    // A altura do wrapper é EXATAMENTE a distância do topo do SVG até o
    // centro da bolinha (64px). Como o AdvancedMarkerElement ancora pelo
    // centro-inferior da caixa do elemento, o fundo desse wrapper de 64px
    // cai exatamente no centro da bolinha — que é o ponto que precisa
    // estar sobre a coordenada real. O SVG tem 74px (mais alto que o
    // wrapper) e os 10px finais (metade de baixo da bolinha) simplesmente
    // estouram pra fora do wrapper, visíveis normalmente.
    wrapper.style.width = SVG_W + "px";
    wrapper.style.height = CENTRO_Y + "px";
    wrapper.style.position = "relative";
    // Puramente informativo (não tem gmpClickable nem listener próprio),
    // mas sem isso ainda intercepta o clique por estar em cima na pilha
    // (zIndex: 999) — qualquer coisa exatamente sob "você está aqui"
    // (ex: um prestador cadastrado na sua própria localização) ficaria
    // impossível de clicar. pointer-events:none deixa o clique atravessar
    // direto pro que estiver visualmente embaixo.
    wrapper.style.pointerEvents = "none";

    wrapper.innerHTML = `
        <svg width="${SVG_W}" height="${SVG_H}" viewBox="0 0 ${SVG_W} ${SVG_H}"
             style="position:absolute; top:0; left:0; overflow:visible;">
            <g class="cone-direcao" transform="rotate(0 ${CENTRO_X} ${CENTRO_Y})" style="opacity:0; transition: opacity 0.2s ease;">
                <polygon points="${CENTRO_X},${CENTRO_Y} ${CENTRO_X - CONE_LARGURA},${CENTRO_Y - CONE_ALTURA} ${CENTRO_X + CONE_LARGURA},${CENTRO_Y - CONE_ALTURA}"
                         fill="rgba(66,133,244,0.35)" />
            </g>
            <circle cx="${CENTRO_X}" cy="${CENTRO_Y}" r="9" fill="#4285F4" stroke="#ffffff" stroke-width="3" />
        </svg>
    `;

    userConeElement = wrapper.querySelector(".cone-direcao");

    userLocationMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: posicao,
        title: "Sua localização",
        content: wrapper,
        zIndex: 999
    });

    userLocationMarker.__centroX = CENTRO_X;
    userLocationMarker.__centroY = CENTRO_Y;
}

function atualizarHeadingUsuario(headingGraus) {
    if (headingGraus === null || headingGraus === undefined || Number.isNaN(headingGraus)) return;
    if (!userConeElement || !userLocationMarker) return;
    const cx = userLocationMarker.__centroX;
    const cy = userLocationMarker.__centroY;
    userConeElement.style.opacity = "1";
    userConeElement.setAttribute("transform", `rotate(${headingGraus} ${cx} ${cy})`);
}

function criarOuAtualizarMarcadorUsuario(latitude, longitude, headingGraus) {
    const posicao = { lat: latitude, lng: longitude };

    // Guarda a posição real mais recente do usuário — é essa que vai
    // ser usada como referência de distância na busca, não o centro do mapa.
    usuarioLat = latitude;
    usuarioLng = longitude;

    criarMarcadorUsuarioSeNecessario(posicao);
    userLocationMarker.position = posicao;

    if (headingGraus !== null && headingGraus !== undefined) {
        atualizarHeadingUsuario(headingGraus);
    }

    if (!mapaCentralizadoNoUsuario) {
        map.panTo(posicao);
        map.setZoom(16);
        mapaCentralizadoNoUsuario = true;
    }
}

/* ---- Bússola do dispositivo (fallback pra quando o usuário está parado,
   já que position.coords.heading só vem preenchido em movimento) ---- */
function tratarOrientacaoDispositivo(event) {
    // iOS expõe webkitCompassHeading (0 = Norte, sentido horário, já
    // corrigido). Outros navegadores usam alpha, que precisa ser invertido
    // (360 - alpha) pra virar "graus a partir do Norte, sentido horário".
    let heading = null;
    if (typeof event.webkitCompassHeading === "number") {
        heading = event.webkitCompassHeading;
    } else if (typeof event.alpha === "number") {
        heading = 360 - event.alpha;
    }
    if (heading !== null) {
        atualizarHeadingUsuario(heading);
    }
}

function ativarBussolaDispositivo() {
    if (orientationHandlerAtivo) return;
    if (typeof DeviceOrientationEvent === "undefined") return;

    const eventoUsado = "ondeviceorientationabsolute" in window
        ? "deviceorientationabsolute"
        : "deviceorientation";

    // iOS 13+ exige permissão explícita, só pode ser pedida em resposta a
    // um gesto do usuário (ex: clique). Em outros navegadores, funciona direto.
    if (typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission()
            .then(resposta => {
                if (resposta === "granted") {
                    window.addEventListener(eventoUsado, tratarOrientacaoDispositivo);
                    orientationHandlerAtivo = true;
                }
            })
            .catch(erro => console.warn("Permissão de bússola negada:", erro));
    } else {
        window.addEventListener(eventoUsado, tratarOrientacaoDispositivo);
        orientationHandlerAtivo = true;
    }
}

function iniciarRastreioLocalizacao() {
    if (!navigator.geolocation) {
        console.warn("Geolocalização não é suportada neste navegador.");
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            criarOuAtualizarMarcadorUsuario(
                position.coords.latitude,
                position.coords.longitude,
                position.coords.heading
            );
        },
        (erro) => {
            console.error("Erro ao obter localização:", erro.message);
        },
        {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 0
        }
    );

    // No iOS, a permissão da bússola só pode ser pedida em resposta a um
    // gesto do usuário — então ativamos no primeiro toque/clique na página.
    const ativarBussolaNoPrimeiroToque = () => {
        ativarBussolaDispositivo();
        document.removeEventListener("click", ativarBussolaNoPrimeiroToque);
        document.removeEventListener("touchstart", ativarBussolaNoPrimeiroToque);
    };

    if (typeof DeviceOrientationEvent !== "undefined" &&
        typeof DeviceOrientationEvent.requestPermission === "function") {
        document.addEventListener("click", ativarBussolaNoPrimeiroToque);
        document.addEventListener("touchstart", ativarBussolaNoPrimeiroToque);
    } else {
        ativarBussolaDispositivo();
    }
}

function limparMarcadores() {
    // Com clustering, os marcadores não são mais anexados direto ao mapa
    // (ver criarMarcador) — quem controla isso é o markerCluster. Limpar
    // "na mão" (marker.map = null) deixaria o agrupador com referências
    // fantasmas de marcadores que já saíram do mapa.
    if (markerCluster) {
        markerCluster.clearMarkers();
    }
    markers = [];
}

function esconderLista() {
    const container = document.getElementById("resultsList");
    container.hidden = true;
}

/* ==========================================================================
   RENDERER DO CLUSTER (agrupamento visual de pins)
   Vários prestadores próximos no zoom atual viram essa bolha única com a
   contagem, em vez de pins empilhados/ilegíveis (biblioteca
   @googlemaps/markerclusterer, CDN em index.html; cor em .PinCluster no
   CSS). Clique pra expandir/dar zoom no grupo já vem de graça da lib.
   ========================================================================== */
const clusterRenderer = {
    render({ count, position }) {
        const wrapper = document.createElement("div");
        wrapper.className = "PinCluster";
        wrapper.textContent = String(count);

        return new google.maps.marker.AdvancedMarkerElement({
            position,
            content: wrapper,
            zIndex: 1000 + count
        });
    }
};

/* Marcador em formato de avatar (substitui o PinElement padrão do Google).
   Reaproveita o fallback de avatarHTML(): tenta a foto de perfil, e se
   der 404 mostra a inicial da categoria sobre a cor do prestador — igual
   já acontece no popup e na lista. Círculo + "rabinho" triangular embaixo
   em fluxo normal (sem position:absolute) de propósito: o
   AdvancedMarkerElement ancora pelo centro-inferior da caixa do content,
   então a ponta do rabinho já cai exatamente sobre a coordenada real. */
function placeholderAvatar(prestador) {
    const hash = prestador.id
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    return AVATAR_PLACEHOLDER[hash % AVATAR_PLACEHOLDER.length];
}

function criarConteudoAvatarMarcador(prestador) {
    const wrapper = document.createElement("div");
    wrapper.className = "AvatarPin";
    wrapper.innerHTML = `
        <div class="AvatarPinCircle" style="background-color:${prestador.cor};">
            <span class="AvatarPinInitial" >${prestador.categoria.charAt(0)}</span>
            <img
                src="${fotoPerfilPrestador(prestador.id)}"
                alt=""
                onload="this.previousElementSibling.style.display='none';"
                onerror="
                    this.onerror = null;
                    this.src='${placeholderAvatar(prestador)}';
                ">
        </div>
        <div class="AvatarPinTail" style="border-top-color:${prestador.cor};"></div>
    `;
    return wrapper;
}

function criarMarcador(prestador) {
    const marker = new google.maps.marker.AdvancedMarkerElement({
        // Sem "map" aqui de propósito: quem decide se esse marcador aparece
        // sozinho ou dentro de uma bolha de cluster é o markerCluster (ver
        // buscarPrestadores), não a criação do marker em si.
        position: { lat: prestador.lat, lng: prestador.lng },
        title: `${prestador.nome} - ${prestador.categoria}`,
        content: criarConteudoAvatarMarcador(prestador),
        // gmpClickable é false por padrão na API atual. Antes, usar
        // addListener("click", ...) deixava o marker clicável de forma
        // implícita; com addEventListener('gmp-click', ...) isso não
        // acontece mais sozinho — sem essa flag o popup nunca abre.
        gmpClickable: true
    });

    // addEventListener('gmp-click', ...) é o padrão atual pra
    // AdvancedMarkerElement (agora um custom element de verdade,
    // <gmp-advanced-marker>). addListener("click", ...) ainda funciona,
    // mas está obsoleto — só continua em uso no listener do próprio Map
    // (map.addListener), que não é afetado por essa mudança.
    marker.addEventListener("gmp-click", () => {
        abrirPopup(marker.position, prestador);
        esconderLista();
    });

    return marker;
}

/* ==========================================================================
   CHIPS DE CATEGORIA — estado ativo
   Só um chip fica marcado por vez. limparChipAtivo() também é chamada
   sempre que o usuário digita manualmente no campo de busca, pra não
   deixar um chip "grudado" aceso enquanto o texto já mudou.
   ========================================================================== */
function limparChipAtivo() {
    if (chipAtivo) {
        chipAtivo.classList.remove("is-active");
        chipAtivo = null;
    }
}

function ativarChipPorQuery(query) {
    limparChipAtivo();
    const chip = document.querySelector(`.Chip[data-query="${CSS.escape(query)}"]`);
    if (chip) {
        chip.classList.add("is-active");
        chipAtivo = chip;
    }
}

/* ==========================================================================
   BUSCA POR CATEGORIA (chips + sugestões do estado vazio)
   Mesmo caminho pros dois gatilhos: escreve o rótulo no campo de busca,
   mostra o skeleton e só chama buscarPrestadores() depois do mesmo atraso
   simulado usado na digitação (ATRASO_BUSCA_MS) — assim o filtro por
   categoria não parece um atalho "instantâneo demais" que destoa do
   resto do app.
   ========================================================================== */
function buscarPorCategoria(query, textoExibido) {
    if (!searchInput) return;

    if (buscaTimeoutId) {
        clearTimeout(buscaTimeoutId);
        buscaTimeoutId = null;
    }

    searchInput.value = textoExibido;
    atualizarVisibilidadeClearBtn();
    mostrarEsqueletoLista();

    buscaTimeoutId = setTimeout(() => {
        buscaTimeoutId = null;
        buscarPrestadores(query);
    }, ATRASO_BUSCA_MS);
}

/* ==========================================================================
   SKELETON DA LISTA (placeholder animado enquanto "busca")
   Mostrado assim que o usuário digita ou clica num chip, antes do
   resultado real chegar — ver ATRASO_BUSCA_MS. Puramente visual: não
   interativo, não tem dado nenhum, só reserva o espaço e dá a sensação
   de "buscando de verdade".
   ========================================================================== */
function mostrarEsqueletoLista(quantidade = 3) {
    const container = document.getElementById("resultsList");
    container.innerHTML = "";

    for (let i = 0; i < quantidade; i++) {
        const linha = document.createElement("div");
        linha.className = "ResultSkeleton";
        linha.innerHTML = `
            <div class="SkeletonBlock SkeletonAvatar"></div>
            <div class="SkeletonLines">
                <div class="SkeletonBlock SkeletonLine--title"></div>
                <div class="SkeletonBlock SkeletonLine--meta"></div>
            </div>
            <div class="SkeletonBlock SkeletonDistance"></div>
        `;
        container.appendChild(linha);
    }

    container.hidden = false;
}

/* ==========================================================================
   ESTADO VAZIO
   Ícone + texto + sugestões de categoria (subconjunto de CATEGORIAS_CHIPS,
   ver QUERIES_SUGESTAO_VAZIO), clicáveis — cada uma dispara o mesmo
   buscarPorCategoria() dos chips e também acende o chip correspondente
   no ChipsRow, se existir.
   ========================================================================== */
function renderizarEstadoVazio(container) {
    const sugestoes = CATEGORIAS_CHIPS.filter(cat => QUERIES_SUGESTAO_VAZIO.includes(cat.query));
    const sugestoesHTML = sugestoes
        .map(cat => `<button type="button" class="ResultsEmptySuggestion" data-query="${cat.query}" data-label="${cat.label}">${cat.label}</button>`)
        .join("");

    container.innerHTML = `
        <div class="ResultsEmpty">
            <svg class="ResultsEmptyIcon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" stroke-width="1.6"></circle>
                <path d="M20 20L15.3 15.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
                <path d="M7.7 10.5H13.3" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"></path>
            </svg>
            <div class="ResultsEmptyText">Nenhum prestador encontrado por aqui.</div>
            <div class="ResultsEmptyHint">Tente uma categoria próxima:</div>
            <div class="ResultsEmptySuggestions">${sugestoesHTML}</div>
        </div>
    `;

    container.querySelectorAll(".ResultsEmptySuggestion").forEach(botao => {
        botao.addEventListener("click", () => {
            ativarChipPorQuery(botao.dataset.query);
            buscarPorCategoria(botao.dataset.query, botao.dataset.label);
        });
    });
}

function renderizarLista(resultados) {
    const container = document.getElementById("resultsList");
    container.innerHTML = "";

    if (resultados.length === 0) {
        container.hidden = false;
        renderizarEstadoVazio(container);
        return;
    }

    const header = document.createElement("div");
    header.className = "ResultsHeader";
    header.textContent = `${resultados.length} encontrado${resultados.length > 1 ? "s" : ""} próximo${resultados.length > 1 ? "s" : ""}`;
    container.appendChild(header);

    resultados.forEach(({ prestador, distancia, marker }) => {
        const nota = textoNotaPrestador(prestador.nota);
        const item = document.createElement("button");
        item.type = "button";
        item.className = "ResultItem";
        item.innerHTML = `
            ${avatarHTML(prestador, "ResultAvatar")}
            <div class="ResultInfo">
                <div class="ResultName">${prestador.nome}</div>
                <div class="ResultMeta">
                    <span>${prestador.categoria}</span>
                    <span class="ResultRating${nota.temNota ? "" : " is-empty"}">${nota.estrelas}</span>
                    ${nota.temNota ? `<span>(${nota.contagem})</span>` : ""}
                </div>
                <div class="ResultStatusRow">${badgeHorarioHTML(prestador)}</div>
            </div>
            <div class="ResultDistance">${formatarDistancia(distancia)}</div>
        `;
        item.addEventListener("click", () => {
            map.panTo(marker.position);
            map.setZoom(18);
            map.panBy(30, -180);
            // Antes simulava o clique do marker via google.maps.event.trigger,
            // mas isso só alcança listeners do sistema antigo (addListener) —
            // o marker agora escuta "gmp-click" (evento DOM nativo, ver
            // criarMarcador), que o trigger não dispara. Mais direto e mais
            // confiável chamar a mesma lógica do clique do marker aqui.
            abrirPopup(marker.position, prestador);
            esconderLista();
        });
        container.appendChild(item);
    });

    container.hidden = false;
}

/* ==========================================================================
   PÁGINA SALVOS — busca GET /api/usuarios/:id/salvos direto no backend
   (fonte de verdade, não mais PRESTADORES local) e monta linhas como
   .ResultItem, sem distância/marker (fora de contexto de busca). Clique
   abre o perfil. Re-renderizada toda vez que a aba abre (ver trocarAba),
   sempre com o estado mais recente — e de quebra realinha idsSalvosSet.
   ========================================================================== */
async function renderizarPaginaSalvos() {
    const container = document.getElementById("savedList");
    if (!container) return;

    container.innerHTML = "";

    if (!usuarioLogado) {
        container.innerHTML = `
            <div class="ResultsEmpty">
                <svg CLASS="ResultsEmptyIcon" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                            <path
                                d="M15.0309 3.30271C13.0299 2.8991 10.9701 2.8991 8.96913 3.30271C6.66186 3.76809 5 5.82231 5 8.20894V18.6292C5 20.4579 6.9567 21.596 8.51221 20.6721L11.3451 18.9895C11.7496 18.7492 12.2504 18.7492 12.6549 18.9895L15.4878 20.6721C17.0433 21.596 19 20.4579 19 18.6292V8.20894C19 5.82231 17.3381 3.76809 15.0309 3.30271Z"
                                fill="currentColor"></path>
                            <path
                                d="M19 19.2674V7.84496C19 5.64147 17.4253 3.74489 15.2391 3.31522C13.1006 2.89493 10.8994 2.89493 8.76089 3.31522C6.57467 3.74489 5 5.64147 5 7.84496V19.2674C5 20.6038 6.46752 21.4355 7.63416 20.7604L10.8211 18.9159C11.5492 18.4945 12.4508 18.4945 13.1789 18.9159L16.3658 20.7604C17.5325 21.4355 19 20.6038 19 19.2674Z"
                                stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                            </path>
                        </svg>
                <div class="ResultsEmptyText">Entre na sua conta pra ver seus salvos.</div>
                <div class="ResultsEmptyHint">A lista de salvos fica ligada à sua conta, não ao aparelho.</div>
            </div>
        `;
        return;
    }

    let salvos;
    try {
        const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}/salvos`, {
            headers: { "x-usuario-id": usuarioId }
        });
        if (!resp.ok) throw new Error(`GET /usuarios/${usuarioId}/salvos respondeu ${resp.status}`);

        salvos = (await resp.json()).map(mapearPrestadorDoBackend);
        idsSalvosSet = new Set(salvos.map(p => String(p.id))); // realinha o cache com a fonte de verdade
    } catch (erro) {
        console.warn("Não foi possível carregar a lista de salvos:", erro);
        container.innerHTML = `<div class="CadastroHint">Não foi possível carregar seus salvos agora. Tente reabrir esta aba.</div>`;
        return;
    }

    if (salvos.length === 0) {
        container.innerHTML = `
            <div class="ResultsEmpty">
                <svg class="ResultsEmptyIcon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1Z"
                        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
                <div class="ResultsEmptyText">Você ainda não salvou nenhum prestador.</div>
                <div class="ResultsEmptyHint">Abra o perfil de um prestador e toque em "Salvar na lista".</div>
            </div>
        `;
        return;
    }

    salvos.forEach(prestador => {
        const nota = textoNotaPrestador(prestador.nota);
        const item = document.createElement("div");
        item.className = "ResultItem SavedItem";
        item.innerHTML = `
            <button type="button" class="SavedItemMain">
                ${avatarHTML(prestador, "ResultAvatar")}
                <div class="ResultInfo">
                    <div class="ResultName">${prestador.nome}</div>
                    <div class="ResultMeta">
                        <span>${prestador.categoria}</span>
                        <span class="ResultRating${nota.temNota ? "" : " is-empty"}">${nota.estrelas}</span>
                        ${nota.temNota ? `<span>(${nota.contagem})</span>` : ""}
                    </div>
                    <div class="ResultStatusRow">${badgeHorarioHTML(prestador)}</div>
                </div>
            </button>
            <div class="SavedItemActions">
                <a class="SavedItemAction SavedItemAction--contact" href="${linkWhatsapp(prestador)}"
                    target="_blank" rel="noopener noreferrer" aria-label="Chamar ${prestador.nome} no WhatsApp">
                    <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18a7.9 7.9 0 0 1-4.03-1.1l-.29-.17-3 .79.8-2.93-.19-.3A7.93 7.93 0 1 1 12 20Zm4.4-5.6c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"></path>
                    </svg>
                </a>
                <button type="button" class="SavedItemAction SavedItemAction--remove" aria-label="Remover ${prestador.nome} da lista">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m2 0v13a1 1 0 0 1-1 1H8a1 1 0 0 1-1-1V7h10ZM10 11v6M14 11v6"
                            stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path>
                    </svg>
                </button>
            </div>
        `;

        item.querySelector(".SavedItemMain").addEventListener("click", () => abrirPerfilPrestador(prestador));

        // Clique no link do WhatsApp não deve abrir o perfil por baixo —
        // ele já tem seu próprio destino (target="_blank"), então só
        // impede a propagação, sem preventDefault (senão o link não abre).
        item.querySelector(".SavedItemAction--contact").addEventListener("click", (evento) => {
            evento.stopPropagation();
        });

        item.querySelector(".SavedItemAction--remove").addEventListener("click", async (evento) => {
            evento.stopPropagation();
            const botao = evento.currentTarget;
            botao.disabled = true;
            try {
                await alternarPrestadorSalvo(prestador.id);
                renderizarPaginaSalvos();
            } catch (erro) {
                console.warn("Não foi possível remover:", erro);
                alert(erro.message);
                botao.disabled = false;
            }
        });

        container.appendChild(item);
    });
}

function buscarPrestadores(query) {
    ultimaQueryBuscada = query;
    const termo = normalizar(query);

    // Base de cálculo da distância: a posição real do usuário (marcador
    // azul / GPS), quando já disponível. Se o GPS ainda não respondeu
    // (ex: busca feita nos primeiros instantes, antes do watchPosition
    // retornar), cai no centro do mapa como fallback pra não quebrar.
    let baseLat, baseLng;
    if (usuarioLat !== null && usuarioLng !== null) {
        baseLat = usuarioLat;
        baseLng = usuarioLng;
    } else {
        const centro = map.getCenter();
        baseLat = centro.lat();
        baseLng = centro.lng();
    }

    limparMarcadores();

    const filtrandoPorAberto = query === QUERY_ABERTO_AGORA;

    const encontrados = PRESTADORES.filter(prestador => {
        if (filtrandoPorAberto) return estaAberto(prestador);

        const categoriaNorm = normalizar(prestador.categoria);
        const nomeNorm = normalizar(prestador.nome);
        return categoriaNorm.includes(termo) ||
            nomeNorm.includes(termo) ||
            prestador.tags.some(tag => normalizar(tag).includes(termo));
    });

    const resultados = encontrados
        .map(prestador => ({
            prestador,
            distancia: calcularDistanciaKm(baseLat, baseLng, prestador.lat, prestador.lng)
        }))
        // raioMaximoKm === null → sem limite (ver Configurações → botão "km" no mapa)
        .filter(item => raioMaximoKm === null || item.distancia <= raioMaximoKm)
        .sort((a, b) => a.distancia - b.distancia)
        .map(item => {
            const marker = criarMarcador(item.prestador);
            markers.push(marker);
            return { ...item, marker };
        });

    // Entrega os marcadores pro agrupador — ele decide sozinho, a cada
    // redesenho, quais aparecem soltos e quais viram bolha de cluster,
    // dependendo do zoom atual. Instância única: cria na primeira busca
    // com resultado, só realimenta (addMarkers) nas buscas seguintes —
    // limparMarcadores() já esvaziou ela lá em cima.
    if (markers.length > 0) {
        if (!markerCluster) {
            markerCluster = new markerClusterer.MarkerClusterer({
                map,
                markers,
                renderer: clusterRenderer
            });
        } else {
            markerCluster.addMarkers(markers);
        }
    }
    renderizarLista(resultados);
}

async function initApp() {
    await Promise.all([
        google.maps.importLibrary("maps"),
        google.maps.importLibrary("marker")
    ]);

    // Só agora google.maps.OverlayView existe de verdade, então a classe
    // do popup customizado é definida aqui dentro, e não no topo do arquivo.
    CustomPopup = class extends google.maps.OverlayView {
        constructor(position, prestador) {
            super();
            this.position = position;

            const nota = textoNotaPrestador(prestador.nota);

            this.container = document.createElement("div");
            this.container.className = "MapPopup";
            // Estilo inline crítico — mesma ideia já aplicada no botão do
            // WhatsApp (ver onAdd() logo abaixo pro motivo completo): sem
            // isso, o popup só ganha position/transform/tamanho quando a
            // <link rel="stylesheet"> (que vive na Shadow DOM do mapa)
            // termina de carregar. No primeiro popup da sessão, ela ainda
            // não carregou — sem position:absolute, o left/top que draw()
            // define mais abaixo não tem efeito nenhum, e o container
            // aparece "solto" no canto, no fluxo normal do documento, até
            // o CSS assumir. Valores idênticos aos de .MapPopup no
            // style.css — quando a stylesheet carrega, nada muda, ela só
            // assume o controle sem salto visual.
            this.container.style.cssText = `
                position: absolute;
                transform: translate(-50%, calc(-100% - 46px));
                width: 270px;
                background-color: #ffffff;
                border-radius: 20px;
                box-shadow: 0 10px 30px rgba(10,11,20,0.14), 0 2px 8px rgba(10,11,20,0.08);
                z-index: 20;
                cursor: default;
                box-sizing: border-box;
            `;
            this.container.innerHTML = `
                <img class="MapPopupPhoto" src="${fotoCapaPrestador(prestador.id)}" alt="Foto do local de ${prestador.nome}"
                    style="display:block; width:100%; height:130px; object-fit:cover; background-color:#e4e4e7; border-radius:20px 20px 0 0;"
                    onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
                <div class="MapPopupBody" style="position:relative; padding:14px 16px 16px;">
                    <button type="button" class="MapPopupClose" aria-label="Fechar">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <div class="MapPopupHeader">
                        ${avatarHTML(prestador, "MapPopupAvatar")}
                        <div>
                            <div class="MapPopupName">${prestador.nome}</div>
                            <div class="MapPopupCategory">${prestador.categoria}</div>
                        </div>
                    </div>
                    <div class="MapPopupRating${nota.temNota ? "" : " is-empty"}">${nota.estrelas}${nota.temNota ? ` <span>(${nota.contagem})</span>` : ""}</div>
                    <div class="MapPopupStatusRow">${badgeHorarioHTML(prestador)}</div>
                    <a class="MapPopupWhatsapp" href="${linkWhatsapp(prestador)}" target="_blank" rel="noopener noreferrer"
                        style="color:#ffffff; text-decoration:none; background-color:#1c7a5e; border-radius:999px;">
                        <svg class="MapPopupWhatsappIcon" viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18a7.9 7.9 0 0 1-4.03-1.1l-.29-.17-3 .79.8-2.93-.19-.3A7.93 7.93 0 1 1 12 20Zm4.4-5.6c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"></path>
                        </svg>
                        Chamar ${prestador.nome.split(" ")[0]} no WhatsApp
                    </a>
                    <button type="button" class="MapPopupVerPerfil">Ver perfil</button>
                </div>
            `;

            // impede que cliques/gestos no popup sejam repassados pro mapa por baixo
            google.maps.OverlayView.preventMapHitsAndGesturesFrom(this.container);

            this.container.querySelector(".MapPopupWhatsapp").addEventListener("click", () => {
                registrarCliqueWhatsapp(prestador.id);
            });

            this.container.querySelector(".MapPopupVerPerfil").addEventListener("click", () => {
                this.setMap(null);
                if (currentPopup === this) currentPopup = null;
                abrirPerfilPrestador(prestador);
            });

            this.container.querySelector(".MapPopupClose").addEventListener("click", () => {
                this.setMap(null);
                if (currentPopup === this) currentPopup = null;
            });
        }

        onAdd() {
            const floatPane = this.getPanes().floatPane;

            // A <link> precisa existir dentro da mesma Shadow DOM do mapa
            // vetorial pra estilizar o popup (ver explicação anterior sobre
            // Map ID/vector maps). Mas antes ela era recriada dentro do
            // innerHTML de CADA popup — cada clique num pino inseria uma
            // <link> nova, e por uma fração de segundo o conteúdo (o botão
            // do WhatsApp, um <a>) ficava com o estilo padrão do navegador
            // pra link — azul — até essa nova <link> carregar. Isso é o
            // "pisca em azul" que aparecia a cada popup aberto. Injetando
            // uma vez só aqui (persistente no floatPane, compartilhado por
            // todos os popups), ela carrega no primeiro clique da sessão e
            // fica disponível pros seguintes sem recarregar — sem flash.
            if (!floatPane.querySelector("link[data-map-popup-styles]")) {
                const link = document.createElement("link");
                link.rel = "stylesheet";
                link.href = "style.css";
                link.dataset.mapPopupStyles = "true";
                floatPane.appendChild(link);
            }

            floatPane.appendChild(this.container);
        }

        onRemove() {
            if (this.container.parentElement) {
                this.container.parentElement.removeChild(this.container);
            }
        }

        draw() {
            const projection = this.getProjection();
            if (!projection) return;
            const point = projection.fromLatLngToDivPixel(this.position);
            if (!point) return;
            this.container.style.left = point.x + "px";
            this.container.style.top = point.y + "px";
        }
    };

    await customElements.whenDefined("gmp-map");
    const mapElement = document.getElementById("map");
    map = mapElement.innerMap;

    // fecha o popup customizado ao clicar em área vazia do mapa
    map.addListener("click", () => fecharPopup());

    const layerToggle = document.querySelector(".LayerToggle");

    // desliga os controles nativos do Google (satélite/mapa, zoom, pegman, fullscreen)
    // e força o mapa a iniciar no tipo definido em TIPO_MAPA_INICIAL (topo do arquivo)
    map.setOptions({
        disableDefaultUI: true,
        mapTypeControl: false,
        zoomControl: false,
        fullscreenControl: false,
        streetViewControl: false,
        keyboardShortcuts: false,
        mapTypeId: TIPO_MAPA_INICIAL
    });

    const findButton = document.getElementById("FindButton");

    map.addListener("maptypeid_changed", sincronizarTemaComMapa);

    // Estado inicial dos controles já foi aplicado lá em cima, antes do Maps
    // carregar (ver aplicarTemaControles no topo do arquivo) — os cliques no
    // LayerToggle continuam sincronizando pelo evento acima, que dispara
    // depois que a mudança de tipo já foi de fato aplicada.

    layerToggle.addEventListener("click", () => {
        const tipoAtual = map.getMapTypeId();
        const indoParaSatelite = !ehTipoSatelite(tipoAtual);
        map.setMapTypeId(indoParaSatelite ? "hybrid" : "roadmap");
        // não precisa chamar aplicarTemaControles aqui — o listener
        // "maptypeid_changed" acima já cuida disso automaticamente
    });

    // Inicia o rastreio da localização do usuário (bolinha azul),
    // centralizando o mapa nela assim que a primeira posição chegar.
    iniciarRastreioLocalizacao();

    // Botão de recentralizar: leva o mapa de volta pra posição real do
    // usuário (mesma referência usada no cálculo de distância da busca),
    // não pro centro original do mapa.
    const recenterButton = document.getElementById("recenterButton");
    recenterButton.addEventListener("click", () => {
        if (usuarioLat === null || usuarioLng === null) return; // GPS ainda não respondeu

        map.panTo({ lat: usuarioLat, lng: usuarioLng });
        map.setZoom(16);

        // feedback visual rápido (ícone inverte de cor) pra confirmar o toque
        recenterButton.classList.add("is-centering");
        setTimeout(() => recenterButton.classList.remove("is-centering"), 400);
    });

    const searchForm = document.getElementById("searchForm");
    searchInput = document.getElementById("searchInput");
    const clearSearchBtn = document.getElementById("clearSearchBtn");

    searchForm.addEventListener('input', () => {
        const query = searchInput.value;
        atualizarVisibilidadeClearBtn();

        // Digitar manualmente desliga qualquer chip de categoria que
        // estivesse ativo — a busca agora é livre, não mais por categoria.
        limparChipAtivo();

        // Qualquer tecla nova cancela a busca anterior ainda pendente —
        // evita empilhar buscas de digitação rápida (debounce natural).
        if (buscaTimeoutId) {
            clearTimeout(buscaTimeoutId);
            buscaTimeoutId = null;
        }

        if (!query.trim()) {
            // campo vazio: limpa de vez, não deixa resultado antigo preso na tela
            limparMarcadores();
            esconderLista();
            return;
        }

        // Skeleton aparece na hora — o resultado real só chega depois de
        // ATRASO_BUSCA_MS (ver topo do arquivo).
        mostrarEsqueletoLista();
        buscaTimeoutId = setTimeout(() => {
            buscaTimeoutId = null;
            buscarPrestadores(query);
        }, ATRASO_BUSCA_MS);
    });

    // Botão "x" dentro do FindBox: apaga o campo e volta ao estado inicial
    // (sem resultado nenhum na tela), igual acontece ao apagar tudo digitando.
    clearSearchBtn.addEventListener("click", () => {
        if (buscaTimeoutId) {
            clearTimeout(buscaTimeoutId);
            buscaTimeoutId = null;
        }
        searchInput.value = "";
        atualizarVisibilidadeClearBtn();
        limparChipAtivo();
        limparMarcadores();
        esconderLista();
        searchInput.focus();
    });

    // Ao clicar em FindButton: some com a lista de resultados,
    // mantendo os marcadores plotados no mapa.
    findButton.addEventListener("click", function () {
        if (buscaTimeoutId) {
            clearTimeout(buscaTimeoutId);
            buscaTimeoutId = null;
        }
        esconderLista();
        map.setZoom(14);
    });

    searchInput.addEventListener('keydown', function (event) {
        // Se a tecla pressionada for o Enter (código 13)
        if (event.keyCode === 13) {
            if (buscaTimeoutId) {
                clearTimeout(buscaTimeoutId);
                buscaTimeoutId = null;
            }
            esconderLista();
            map.setZoom(14);
            event.preventDefault(); // Ignora o submit do teclado
        }
    });

}

void initApp();
