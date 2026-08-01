/* ==========================================================================
   BANNER DE LEMBRETE — "Você tem avaliações de clientes expirando!"
   Depende de coisas já definidas em 00-script.js (usuarioLogado,
   buscarAvaliacoesPendentes, PRAZO_AVALIACAO_MS) e 07-notificacoes.js
   (abrirPainelNotificacoes) — por isso carrega DEPOIS dos dois no
   index.html. Não edita nenhum dos dois arquivos: só "escuta" a troca de
   sessão fazendo um monkey-patch educado em aoMudarSessaoNotificacoes,
   que já é chamada em todo login/logout/restauração de sessão (ver
   entrarComGoogle/sair/restaurarSessao em 00-script.js).
   ========================================================================== */

// Só um lembrete por dia (não a cada login/refresh) — senão vira saco
// depois do segundo dia com a mesma avaliação parada. Data (não
// timestamp) de propósito: "hoje" já viu, "amanhã" pode ver de novo,
// mesmo que sejam 2h de diferença entre as duas checagens.
const CHAVE_ULTIMO_LEMBRETE_EXPIRACAO = "mase_ultimoLembreteExpiracao";

// Só dispara quando falta pouco (senão "expirando" seria mentira pra uma
// avaliação que ainda tem 6 dias de prazo).
const LIMITE_DIAS_LEMBRETE_EXPIRACAO = 2;

/* --------------------------------------------------------------------------
   BANNER — genérico de propósito: qualquer lembrete futuro (não só
   avaliação expirando) pode reaproveisar essa função. Só um por vez: se
   já tem um banner na tela, ignora a chamada nova em vez de empilhar.
   -------------------------------------------------------------------------- */
let bannerAtivoEl = null;
let bannerTimeoutId = null;

// Ícone padrão: relógio (mais condizente com "expirando" do que uma letra
// genérica). SVG inline pra herdar cor via currentColor sem depender de
// arquivo externo — mesmo princípio do cone direcional de geolocalização.
const ICONE_RELOGIO_HTML = `
    <div class="BannerLembreteIconeRelogio">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="12" cy="12" r="9" stroke="currentColor" stroke-width="1.8"/>
            <path d="M12 7.5V12l3 2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
    </div>
`;

// Sino — usado pra qualquer notificação nova em geral (avaliação nova pra
// revisar, avaliação decidida, prestador salvo por alguém), não só a de
// expiração. Reaproveita a mesma caixa quadrada com gradiente do relógio
// (.BannerLembreteIconeRelogio) — o nome da classe ficou específico
// demais, mas é só uma caixa genérica visualmente, não tem problema
// reaproveitar pra outro ícone dentro dela.
const ICONE_SINO_HTML = `
    <div class="BannerLembreteIconeRelogio">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M6 10a6 6 0 1 1 12 0c0 3.2 1 4.8 1.6 5.6.3.4 0 1-.5 1H4.9c-.5 0-.8-.6-.5-1C5 14.8 6 13.2 6 10Z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/>
            <path d="M10 19a2.2 2.2 0 0 0 4 0" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/>
        </svg>
    </div>
`;

function mostrarBannerNotificacao({ titulo, corpo, aoTocar, iconeHtml = ICONE_RELOGIO_HTML }) {
    if (bannerAtivoEl) return; // já tem um lembrete na tela, não empilha

    // "Notificações push" em Configurações — é o análogo mais próximo que
    // esse app tem de push de verdade (não existe push nativo do aparelho
    // ainda), então é essa preferência que gateia o banner. lerConfigApp()
    // já resolve o padrão (ligado) quando a pessoa nunca mexeu no toggle.
    if (typeof lerConfigApp === "function" && lerConfigApp().notifPush === false) return;

    const banner = document.createElement("button");
    banner.type = "button";
    banner.className = "BannerLembrete";
    banner.innerHTML = `
        <div class="BannerLembreteIcone">${iconeHtml}</div>
        <div class="BannerLembreteCorpo">
            <div class="BannerLembreteTitulo">${titulo}</div>
            ${corpo ? `<div class="BannerLembreteTexto">${corpo}</div>` : ""}
        </div>
    `;

    // Arrasta pra cima pra dispensar, do jeito que qualquer notificação
    // real de iPhone se comporta (arrastar pra baixo/lateral não faz
    // nada de propósito — só "pra cima" fecha).
    let arrastoInicioY = null;
    banner.addEventListener("touchstart", (evento) => {
        arrastoInicioY = evento.touches[0].clientY;
        banner.classList.add("is-arrastando"); // desliga a transição do CSS: o dedo tem que mandar na hora, sem atraso
    }, { passive: true });
    banner.addEventListener("touchmove", (evento) => {
        if (arrastoInicioY === null) return;
        const deltaY = evento.touches[0].clientY - arrastoInicioY;
        if (deltaY < 0) banner.style.transform = `translate(-50%, ${deltaY}px)`;
    }, { passive: true });
    banner.addEventListener("touchend", (evento) => {
        if (arrastoInicioY === null) return;
        const deltaY = evento.changedTouches[0].clientY - arrastoInicioY;
        banner.classList.remove("is-arrastando");
        banner.style.transform = "";
        arrastoInicioY = null;
        if (deltaY < -24) esconderBannerNotificacao();
    });

    banner.addEventListener("click", () => {
        esconderBannerNotificacao();
        if (aoTocar) aoTocar();
    });

    document.body.appendChild(banner);
    bannerAtivoEl = banner;

    // Força o navegador a calcular o layout AGORA (leitura de
    // offsetHeight joga fora qualquer valor "em cache" e obriga um
    // reflow síncrono) antes de trocar a classe. Um requestAnimationFrame
    // sozinho às vezes não bastava: o navegador ocasionalmente processava
    // o append e a troca de classe no mesmo frame, sem nunca "pintar" o
    // estado inicial (fora da tela) — daí a transição simplesmente não
    // disparava e o banner aparecia direto no lugar final, sem animar.
    void banner.offsetHeight;
    banner.classList.add("is-visible");

    bannerTimeoutId = setTimeout(esconderBannerNotificacao, 6000);
}

function esconderBannerNotificacao() {
    if (!bannerAtivoEl) return;
    clearTimeout(bannerTimeoutId);
    const el = bannerAtivoEl;
    bannerAtivoEl = null;
    el.classList.remove("is-visible", "is-arrastando");
    el.classList.add("is-leaving");
    el.addEventListener("transitionend", () => el.remove(), { once: true });
    setTimeout(() => el.remove(), 400); // rede de segurança se o transitionend não disparar
}

/* --------------------------------------------------------------------------
   CHECAGEM — reaproveita buscarAvaliacoesPendentes() de 00-script.js
   (mesma fila cega que "Gerenciar meus serviços" e o painel de
   notificações já mostram), só filtrando quem tá perto de expirar.
   -------------------------------------------------------------------------- */
async function verificarLembreteAvaliacoesExpirando() {
    const hoje = new Date().toISOString().slice(0, 10); // "AAAA-MM-DD"
    if (localStorage.getItem(CHAVE_ULTIMO_LEMBRETE_EXPIRACAO) === hoje) return; // já mostrou hoje

    const dados = await buscarAvaliacoesPendentes();
    if (!dados || dados.pendentes.length === 0) return;

    const expirando = dados.pendentes.filter(av => {
        const diasRestantes = Math.ceil((av.criadoEm + PRAZO_AVALIACAO_MS - Date.now()) / (24 * 60 * 60 * 1000));
        return diasRestantes <= LIMITE_DIAS_LEMBRETE_EXPIRACAO;
    });
    if (expirando.length === 0) return;

    localStorage.setItem(CHAVE_ULTIMO_LEMBRETE_EXPIRACAO, hoje);

    const corpo = expirando.length === 1
        ? "Uma avaliação está prestes a expirar. Toque para revisar."
        : `${expirando.length} avaliações estão prestes a expirar. Toque para revisar.`;

    // Avatar do autor no ícone só faz sentido quando é UMA avaliação —
    // com várias, mostrar a foto de um autor só sugeriria que foi só ele,
    // então cai pro relógio genérico (ICONE_RELOGIO_HTML, padrão da
    // função). Reaproveita avatarClienteHTML() de 00-script.js (mesma
    // foto/placeholder ilustrado usado no card de "Gerenciar meus
    // serviços") em vez de montar isso de novo aqui.
    let iconeHtml;
    if (expirando.length === 1 && typeof avatarClienteHTML === "function") {
        const av = expirando[0];
        iconeHtml = avatarClienteHTML(av.autorNome, av.autorAvatarUrl, "BannerLembreteAvatar", av.autorUsuarioId, av.autorAvatarCustomizado);
    }

    mostrarBannerNotificacao({
        titulo: "Você tem avaliações expirando!",
        corpo,
        iconeHtml,
        aoTocar: () => {
            if (typeof abrirPainelNotificacoes === "function") abrirPainelNotificacoes();
        }
    });
}

/* --------------------------------------------------------------------------
   NOTIFICAÇÃO NOVA (AO VIVO) — diferente do lembrete de expiração (que é
   "algo tá acumulando, olha pra trás"), esse aqui é "algo aconteceu
   agora": alguém avaliou seu prestador, uma avaliação sua foi decidida,
   ou salvaram seu cadastro — enquanto você pode estar em qualquer outra
   tela do app. Reaproveita GET /api/notificacoes (mesma lista que o
   painel do sino já usa) só que comparando com o que já foi visto.

   idsNotificacoesVistas guarda o "ponto de partida": no login,
   inicializarBaselineNotificacoes() marca tudo que JÁ existia como visto,
   sem banner nenhum — senão, toda vez que a pessoa loga, levaria um
   banner de uma notificação de 3 dias atrás só porque nunca tinha visto
   isso especificamente "ao vivo". Só o que chega DEPOIS disso conta como
   novo.
   -------------------------------------------------------------------------- */
const idsNotificacoesVistas = new Set();
let notificacoesInicializadas = false;

async function inicializarBaselineNotificacoes() {
    try {
        const resp = await fetch(`${API_BASE}/notificacoes`, { headers: cabecalhosAuth() });
        if (!resp.ok) return;
        const lista = await resp.json();
        lista.forEach(n => idsNotificacoesVistas.add(n.id));
    } catch (erro) {
        console.warn("Não foi possível estabelecer o ponto de partida das notificações:", erro);
    } finally {
        notificacoesInicializadas = true; // mesmo se a lista vier vazia ou der erro, libera a checagem a partir de agora
    }
}

async function verificarNotificacaoNova() {
    if (!notificacoesInicializadas) return; // baseline ainda não estabelecido — não dá pra saber o que é "novo" de verdade

    try {
        const resp = await fetch(`${API_BASE}/notificacoes`, { headers: cabecalhosAuth() });
        if (!resp.ok) return;
        const lista = await resp.json();

        const novas = lista.filter(n => !idsNotificacoesVistas.has(n.id));
        novas.forEach(n => idsNotificacoesVistas.add(n.id));
        if (novas.length === 0) return;

        // GET /api/notificacoes já vem ordenado por criado_em DESC (ver
        // notificacoes.js) — a primeira "nova" da lista é a mais recente.
        // Se chegaram várias no mesmo intervalo de 30s, só mostra a mais
        // recente (mostrarBannerNotificacao já ignora chamada nova
        // enquanto uma estiver na tela, então não empilha de qualquer
        // forma) — as outras continuam intactas e não lidas no painel.
        const maisRecente = novas[0];

        mostrarBannerNotificacao({
            titulo: maisRecente.titulo,
            corpo: maisRecente.corpo,
            iconeHtml: await iconeNotificacao(maisRecente),
            aoTocar: () => {
                if (typeof abrirPainelNotificacoes === "function") abrirPainelNotificacoes();
            }
        });
    } catch (erro) {
        console.warn("Falha ao checar notificações novas:", erro);
    }
}

// Avatar do autor só é possível pra "avaliacao_pendente" — é o único tipo
// com uma pessoa específica e com foto disponível por trás:
// - "prestador_salvo" é anônimo de propósito (ver criarNotificacao em
//   usuarios.js: nunca revela quem salvou).
// - "avaliacao_publicada"/"avaliacao_rejeitada" vão pro autor sobre uma
//   decisão do PRESTADOR, não tem uma pessoa clara aqui (seria a foto do
//   prestador, outro conceito).
// link vem como "avaliacao-pendente:<id>" (ver criarNotificacao em
// avaliacoes.js) — extrai o id e casa com a mesma lista que
// buscarAvaliacoesPendentes() já busca pro lembrete de expiração, sem
// bater em endpoint novo nenhum.
async function iconeNotificacao(notificacao) {
    if (notificacao.tipo !== "avaliacao_pendente" || typeof avatarClienteHTML !== "function") {
        return ICONE_SINO_HTML;
    }

    const idAvaliacao = String(notificacao.link || "").split(":")[1];
    if (!idAvaliacao) return ICONE_SINO_HTML;

    try {
        const dados = await buscarAvaliacoesPendentes();
        const av = dados && dados.pendentes.find(p => p.id === idAvaliacao);
        if (!av) return ICONE_SINO_HTML; // já foi decidida/expirou entre o evento e essa checagem

        return avatarClienteHTML(av.autorNome, av.autorAvatarUrl, "BannerLembreteAvatar", av.autorUsuarioId, av.autorAvatarCustomizado);
    } catch (erro) {
        console.warn("Não foi possível carregar o avatar do autor pra notificação:", erro);
        return ICONE_SINO_HTML;
    }
}
/* --------------------------------------------------------------------------
   BOOTSTRAP — encadeia em DOIS pontos de 07-notificacoes.js, sem editar
   esse arquivo: ela já roda em todo login, logout e
   restauração de sessão, então é o ponto certo pra checar "acabou de
   confirmar que tem sessão válida, vale a pena avisar?". No logout ela
   mesma vira no-op (usuarioLogado fica false).
   -------------------------------------------------------------------------- */
function iniciarLembreteExpiracao() {
    if (typeof aoMudarSessaoNotificacoes !== "function") {
        console.warn("aoMudarSessaoNotificacoes não encontrada — lembrete de expiração não vai disparar sozinho.");
        return;
    }
    if (typeof atualizarBadgeNotificacoes !== "function") {
        console.warn("atualizarBadgeNotificacoes não encontrada — lembrete e notificação ao vivo só vão checar no login/logout, não durante a sessão.");
    }

    const aoMudarSessaoOriginal = aoMudarSessaoNotificacoes;
    window.aoMudarSessaoNotificacoes = function (...args) {
        aoMudarSessaoOriginal.apply(this, args);
        if (typeof usuarioLogado !== "undefined" && usuarioLogado) {
            verificarLembreteAvaliacoesExpirando();
            // Reseta o "ponto de partida" a cada novo login — sessão nova,
            // baseline nova. Sem isso, um logout/login trocando de conta
            // no mesmo aparelho herdaria os ids da conta anterior.
            idsNotificacoesVistas.clear();
            notificacoesInicializadas = false;
            inicializarBaselineNotificacoes();
        } else {
            idsNotificacoesVistas.clear();
            notificacoesInicializadas = false;
        }
    };

    if (typeof atualizarBadgeNotificacoes === "function") {
        const atualizarBadgeOriginal = atualizarBadgeNotificacoes;
        window.atualizarBadgeNotificacoes = async function (...args) {
            await atualizarBadgeOriginal.apply(this, args);
            if (typeof usuarioLogado !== "undefined" && usuarioLogado) {
                // Notificação nova primeiro: é o evento mais "urgente" (algo
                // acabou de acontecer). O lembrete de expiração já é
                // limitado a 1x/dia, então não tem problema nenhum ele
                // esperar o próximo tick se os dois quiserem disparar ao
                // mesmo tempo (mostrarBannerNotificacao só permite um por
                // vez de qualquer forma).
                verificarNotificacaoNova();
                verificarLembreteAvaliacoesExpirando();
            }
        };
    }
}

// Roda IMEDIATAMENTE (sem esperar DOMContentLoaded) e de propósito: até
// script.js e 07-notificacoes.js já executaram (vêm antes na tag), então
// as funções já existem; document.body também já existe (a tag <script>
// está dentro do <body>, que o parser já abriu). O motivo de não esperar
// DOMContentLoaded é justamente 03-init-app.js — ele roda de forma
// SÍNCRONA durante o parsing, antes do DOMContentLoaded disparar. Se o
// encapamento esperasse esse evento, 03-init-app.js já teria chamado
// restaurarSessao() → aoMudarSessaoNotificacoes() com a versão ORIGINAL
// (ainda não encapada), e o setInterval do polling ficaria com uma
// referência direta à atualizarBadgeNotificacoes antiga pro resto da
// sessão — exatamente o "às vezes funciona, às vezes não" que
// aconteceu: só funcionava quando o login acontecia depois da página já
// ter terminado de carregar.
iniciarLembreteExpiracao();