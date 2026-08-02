/* ==========================================================================
   BOOTSTRAP FINAL DO APP
   Precisa carregar por ÚLTIMO — chama e depende de tudo que está definido
   em 01-constantes.js, 02-maps-loader.js e 00-script.js.
   ========================================================================== */

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
                background-color: ;
                border-radius: 20px;
                box-shadow: 0 10px 30px rgba(10,11,20,0.14), 0 2px 8px rgba(10,11,20,0.08);
                z-index: 20;
                cursor: default;
                box-sizing: border-box;
            `;
            this.container.innerHTML = `
                ${prestador.capaTipo === "video" ? `
                <video class="MapPopupPhoto" muted loop playsinline autoplay
                    poster="${CAPA_PLACEHOLDER}"
                    style="display:block; width:100%; height:130px; object-fit:cover; background-color:#e4e4e7; border-radius:20px 20px 0 0;"
                    src="${fotoCapaVideoPrestador(prestador.id)}"></video>
                ` : `
                <img class="MapPopupPhoto" src="${fotoCapaPrestador(prestador.id)}" alt="Foto do local de ${prestador.nome}"
                    style="display:block; width:100%; height:130px; object-fit:cover; background-color:#e4e4e7; border-radius:20px 20px 0 0;"
                    onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
                `}
                <div class="MapPopupBody" style="position:relative; padding:14px 16px 16px;">
                    <button type="button" class="MapPopupClose" aria-label="Fechar">
                        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                                stroke-linecap="round" stroke-linejoin="round"></path>
                        </svg>
                    </button>
                    <div class="MapPopupHeader">
                        ${avatarComSeloHTML(prestador, "MapPopupAvatar", " SeloDocumentoAvatar--sm")}
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