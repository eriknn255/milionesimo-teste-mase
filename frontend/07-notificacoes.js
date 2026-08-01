/* ==========================================================================
   NOTIFICAÇÕES IN-APP
   Depende de coisas definidas em 01-constantes.js (API_BASE,
   ATRASO_POLLING_NOTIFICACOES_MS) e 00-script.js (cabecalhosAuth,
   usuarioLogado, PRESTADORES, mapearPrestadorDoBackend,
   abrirPerfilPrestador, registrarAberturaOverlay,
   registrarFechamentoOverlay, buscarAvaliacoesPendentes,
   montarHtmlAvaliacoesPendentes, ligarHandlersAvaliacoesPendentes) — por
   isso carrega DEPOIS de 00-script.js no index.html. Fica num arquivo
   próprio (em vez de dentro de 00-script.js) só por organização; nada
   aqui é isolado de verdade, é tudo escopo global como o resto do app.

   Ponto de entrada: o item "Notificações" dentro do menu da aba Perfil
   (#btnAbrirNotificacoes), com um pontinho de contagem
   (#profileMenuNotifBadge) — mais um indicador simples (sem número) no
   ícone Perfil do Dock (#dockNotifDot), visível em qualquer aba sem
   flutuar por cima de conteúdo nenhum. Não existe sino fixo ancorado no
   canto da tela; o painel (#notifPanel) é um destino de tela cheia — o
   mesmo chrome (.ProviderProfile + .CadastroOverlayHeader) que
   "Preferências da conta" e "Gerenciar meus serviços" já usam, incluindo
   participar da pilha de overlays/botão voltar do app — só aberto
   explicitamente a partir do Perfil.

   Dentro do painel, "Nova avaliação para revisar" NÃO é mais um item de
   texto que leva pra outro lugar — vira card de ação de verdade
   (Aceitar/Rejeitar), a MESMA fila cega que "Gerenciar meus serviços" já
   mostra (reaproveita buscarAvaliacoesPendentes/
   montarHtmlAvaliacoesPendentes/ligarHandlersAvaliacoesPendentes de
   00-script.js — ver carregarPainelNotificacoes/carregarCardsPendentes
   mais abaixo).
   ========================================================================== */

let notifPollingIntervalId = null;
let notifPainelAberto = false;
let notifCarregando = false;

/* --------------------------------------------------------------------------
   LIGA/DESLIGA — chamado por 00-script.js (entrarComGoogle, sair,
   restaurarSessao) via aoMudarSessaoNotificacoes(), toda vez que o estado
   de login muda. Também roda uma vez sozinho no boot (ver iniciarUI mais
   abaixo), pra cobrir o caso "sessão já restaurada antes desse arquivo
   terminar de carregar".
   -------------------------------------------------------------------------- */
function aoMudarSessaoNotificacoes() {
    if (usuarioLogado) {
        iniciarPollingNotificacoes();
    } else {
        const dot = document.getElementById("dockNotifDot");
        if (dot) dot.hidden = true;
        fecharPainelNotificacoes();
        pararPollingNotificacoes();
    }
}

function iniciarPollingNotificacoes() {
    atualizarBadgeNotificacoes(); // primeira leitura imediata, não espera o 1º tick
    if (notifPollingIntervalId) return; // já rodando, não duplica o interval
    notifPollingIntervalId = setInterval(atualizarBadgeNotificacoes, ATRASO_POLLING_NOTIFICACOES_MS);
}

function pararPollingNotificacoes() {
    if (notifPollingIntervalId) {
        clearInterval(notifPollingIntervalId);
        notifPollingIntervalId = null;
    }
}

/* --------------------------------------------------------------------------
   BADGE — só a contagem (GET /nao-lidas é bem mais barato que listar
   tudo), chamado a cada tick do polling.
   -------------------------------------------------------------------------- */
async function atualizarBadgeNotificacoes() {
    if (!usuarioLogado) return; // corrida possível: logout no meio de um tick pendente

    const dot = document.getElementById("dockNotifDot");
    const badgeMenu = document.getElementById("profileMenuNotifBadge");
    if (!dot && !badgeMenu) return;

    try {
        const resp = await fetch(`${API_BASE}/notificacoes/nao-lidas`, { headers: cabecalhosAuth() });
        if (!resp.ok) throw new Error(`GET /notificacoes/nao-lidas respondeu ${resp.status}`);
        const { total } = await resp.json();

        if (dot) dot.hidden = total === 0;
        if (badgeMenu) {
            badgeMenu.textContent = total > 9 ? "9+" : String(total);
            badgeMenu.hidden = total === 0;
        }
    } catch (erro) {
        // Falha de rede aqui não merece alarme nenhum pro usuário — só
        // tenta de novo no próximo tick.
        console.warn("Não foi possível atualizar o contador de notificações:", erro);
    }
}

/* --------------------------------------------------------------------------
   PAINEL — agora um destino de tela cheia (mesmo chrome de
   .ProviderProfile que "Preferências da conta"/"Gerenciar meus serviços"
   usam, ver index.html/style.css), não mais uma folha flutuante. Por
   isso entra na MESMA pilha de overlays/botão voltar do resto do app
   (registrarAberturaOverlay/registrarFechamentoOverlay, definidas em
   00-script.js) — sem isso, o botão voltar do navegador sairia do site
   inteiro em vez de só fechar as notificações, diferente de como
   qualquer outro overlay daqui se comporta.
   -------------------------------------------------------------------------- */
function abrirPainelNotificacoes() {
    const painel = document.getElementById("notifPanel");
    if (!painel) return;
    painel.hidden = false;
    notifPainelAberto = true;
    registrarAberturaOverlay(fecharPainelNotificacoes);
    carregarPainelNotificacoes();
}

function fecharPainelNotificacoes(viaPopstate) {
    registrarFechamentoOverlay(fecharPainelNotificacoes, viaPopstate);
    const painel = document.getElementById("notifPanel");
    if (painel) painel.hidden = true;
    notifPainelAberto = false;
}

function alternarPainelNotificacoes() {
    if (notifPainelAberto) fecharPainelNotificacoes();
    else abrirPainelNotificacoes();
}

// Cache da última leitura de GET /notificacoes (sem filtro) — usado só pra
// correlacionar "essa avaliação foi decidida no card" com "qual
// notificação marcar como lida" (ver marcarNotificacaoDaAvaliacaoComoLida
// mais abaixo). Não precisa ficar em localStorage nem nada: é só um
// atalho pra não precisar refazer a mesma busca de novo pra achar 1 id.
let notifCacheGeral = [];

async function carregarPainelNotificacoes() {
    if (notifCarregando) return;
    notifCarregando = true;
    await Promise.all([carregarCardsPendentes(), carregarListaNotificacoesGerais()]);
    notifCarregando = false;
}

// Os cards de Aceitar/Rejeitar de verdade — MESMA renderização usada em
// "Gerenciar meus serviços" (montarHtmlAvaliacoesPendentes/
// ligarHandlersAvaliacoesPendentes, ver 00-script.js), só que dentro do
// painel de notificações agora. É a fila cega em si (fonte de verdade),
// não o registro de notificação — continua funcionando igual mesmo se a
// notificação correspondente tiver sido perdida/já lida por outro
// caminho.
async function carregarCardsPendentes() {
    const section = document.getElementById("notifPendentesSection");
    const lista = document.getElementById("notifPendentesList");
    if (!section || !lista) return;

    const dados = await buscarAvaliacoesPendentes();
    if (!dados || dados.pendentes.length === 0) {
        section.hidden = true;
        return;
    }

    section.hidden = false;
    lista.innerHTML = montarHtmlAvaliacoesPendentes(dados.pendentes, dados.multiplosCadastros);
    ligarHandlersAvaliacoesPendentes(lista, (avaliacaoId) => {
        carregarCardsPendentes(); // recarrega a fila (o item decidido some sozinho)
        marcarNotificacaoDaAvaliacaoComoLida(avaliacaoId);
    });
}

async function carregarListaNotificacoesGerais() {
    const lista = document.getElementById("notifList");
    if (!lista) return;

    lista.innerHTML = `<div class="NotifEmpty">Carregando...</div>`;

    try {
        const resp = await fetch(`${API_BASE}/notificacoes`, { headers: cabecalhosAuth() });
        if (!resp.ok) throw new Error(`GET /notificacoes respondeu ${resp.status}`);
        const notificacoes = await resp.json();
        notifCacheGeral = notificacoes;

        // "avaliacao_pendente" já vira card de ação de verdade em
        // #notifPendentesList (ver carregarCardsPendentes acima) — listar
        // de novo aqui embaixo, só como texto sem nenhuma ação, seria
        // redundante e ainda por cima é o comportamento antigo que a
        // gente tá justamente tirando (clicar levava pra outro lugar em
        // vez de decidir ali mesmo).
        renderizarListaNotificacoes(notificacoes.filter(n => n.tipo !== "avaliacao_pendente"));
    } catch (erro) {
        console.warn("Não foi possível carregar as notificações:", erro);
        lista.innerHTML = `<div class="NotifEmpty">Não foi possível carregar suas notificações agora.</div>`;
    }
}

// Depois que um card de pendência é decidido (aceitar/rejeitar), acha a
// notificação "Nova avaliação para revisar" correspondente (mesmo id de
// avaliação no link, ver criarNotificacao() em routes/avaliacoes.js) e
// marca ela como lida sozinha — sem isso, o sino continuava contando essa
// pendência mesmo depois de já ter sido decidida ali mesmo no painel.
function marcarNotificacaoDaAvaliacaoComoLida(avaliacaoId) {
    const alvo = notifCacheGeral.find(n => n.tipo === "avaliacao_pendente" && n.link === `avaliacao-pendente:${avaliacaoId}` && !n.lida);
    if (alvo) marcarNotificacaoComoLida(alvo.id);
}

// titulo/corpo às vezes carregam texto digitado por outro usuário (ex:
// autorNome de quem avaliou, ver criarNotificacao() nas rotas de
// avaliacoes.js/usuarios.js) — nunca confiar nisso como HTML pronto.
// Só usado aqui dentro (o resto do app monta esses innerHTML com dados
// que já passaram por escaparHtml em outro lugar, ou são texto fixo).
function escaparHtml(texto) {
    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderizarListaNotificacoes(notificacoes) {
    const lista = document.getElementById("notifList");
    if (!lista) return;

    if (notificacoes.length === 0) {
        lista.innerHTML = `<div class="NotifEmpty">Nenhuma notificação por aqui ainda.</div>`;
        return;
    }

    lista.innerHTML = "";
    notificacoes.forEach(notificacao => {
        const item = document.createElement("button");
        item.type = "button";
        item.className = `NotifItem${notificacao.lida ? "" : " is-unread"}`;
        item.innerHTML = `
            <span class="NotifItemDot"></span>
            <div class="NotifItemBody">
                <div class="NotifItemTopRow">
                    <div class="NotifItemTitulo">${escaparHtml(notificacao.titulo)}</div>
                    <div class="NotifItemTempo">${formatarTempoRelativo(notificacao.criadoEm)}</div>
                </div>
                ${notificacao.corpo ? `<div class="NotifItemCorpo">${escaparHtml(notificacao.corpo)}</div>` : ""}
            </div>
        `;
        item.addEventListener("click", () => aoTocarNotificacao(notificacao));
        lista.appendChild(item);
    });
}

// "agora", "5 min", "3 h", "2 d" — mesmo espírito de textoDiasSemana():
// não escreve por extenso o que dá pra encurtar sem perder clareza.
function formatarTempoRelativo(timestampMs) {
    const diffMs = Date.now() - timestampMs;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `${diffMin} min`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH} h`;
    const diffDias = Math.floor(diffH / 24);
    return `${diffDias} d`;
}

/* --------------------------------------------------------------------------
   AÇÃO AO TOCAR — marca como lida e navega pro destino, interpretando o
   campo `link` ("tipo:id") que o backend monta em cada
   criarNotificacao(...) (ver backend/utils/criarNotificacao.js).
   -------------------------------------------------------------------------- */
async function aoTocarNotificacao(notificacao) {
    fecharPainelNotificacoes();

    if (!notificacao.lida) {
        marcarNotificacaoComoLida(notificacao.id); // não bloqueia a navegação, roda em paralelo
    }

    if (!notificacao.link) return;
    const [tipoLink, id] = notificacao.link.split(":");

    // "avaliacao-pendente" não aparece mais aqui: esse tipo é filtrado da
    // lista geral e vira card de ação de verdade em #notifPendentesList
    // (ver carregarListaNotificacoesGerais/carregarCardsPendentes acima) —
    // só sobra "prestador" pra navegação por clique.
    if (tipoLink === "prestador") {
        abrirPerfilPrestadorPorId(id);
    }
}

async function marcarNotificacaoComoLida(id) {
    try {
        await fetch(`${API_BASE}/notificacoes/${id}/lida`, { method: "POST", headers: cabecalhosAuth() });
        atualizarBadgeNotificacoes();
    } catch (erro) {
        console.warn("Não foi possível marcar a notificação como lida:", erro);
    }
}

async function marcarTodasNotificacoesComoLidas() {
    try {
        await fetch(`${API_BASE}/notificacoes/marcar-todas-lidas`, { method: "POST", headers: cabecalhosAuth() });
        atualizarBadgeNotificacoes();
        carregarListaNotificacoesGerais();
    } catch (erro) {
        console.warn("Não foi possível marcar todas as notificações como lidas:", erro);
    }
}

// Abre o perfil público a partir só do id (a notificação não carrega o
// prestador inteiro) — procura primeiro em PRESTADORES (já carregado em
// memória pra busca/mapa) antes de bater no servidor de novo.
async function abrirPerfilPrestadorPorId(id) {
    const emMemoria = PRESTADORES.find(p => String(p.id) === String(id));
    if (emMemoria) {
        abrirPerfilPrestador(emMemoria);
        return;
    }

    try {
        const resp = await fetch(`${API_BASE}/prestadores/${id}`);
        if (!resp.ok) throw new Error(`GET /prestadores/${id} respondeu ${resp.status}`);
        abrirPerfilPrestador(mapearPrestadorDoBackend(await resp.json()));
    } catch (erro) {
        console.warn("Não foi possível abrir o prestador da notificação:", erro);
    }
}

/* --------------------------------------------------------------------------
   BOOTSTRAP — liga os cliques do sino/painel. Roda dentro de iniciarUI()
   se ela já existir (deveria, já que 00-script.js carrega antes), senão
   espera o DOMContentLoaded como qualquer outra inicialização do app.
   -------------------------------------------------------------------------- */
function iniciarNotificacoes() {
    const abrirBtn = document.getElementById("btnAbrirNotificacoes");
    const closeBtn = document.getElementById("notifPanelCloseBtn");
    const markAllBtn = document.getElementById("notifMarkAllBtn");

    if (abrirBtn) {
        abrirBtn.addEventListener("click", (evento) => {
            evento.stopPropagation();
            abrirPainelNotificacoes();
        });
    }

    if (closeBtn) {
        closeBtn.addEventListener("click", (evento) => {
            evento.stopPropagation();
            fecharPainelNotificacoes();
        });
    }

    if (markAllBtn) {
        markAllBtn.addEventListener("click", (evento) => {
            evento.stopPropagation();
            marcarTodasNotificacoesComoLidas();
        });
    }

    // Cobre o caso de restaurarSessao() já ter terminado (ou nem existir
    // sessão nenhuma) antes deste script rodar.
    aoMudarSessaoNotificacoes();
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", iniciarNotificacoes);
} else {
    iniciarNotificacoes();
}