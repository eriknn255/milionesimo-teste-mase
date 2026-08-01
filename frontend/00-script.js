console.log("[console-log] versão web-prototype do app");

/* ==========================================================================
   CARREGADOR DE TEMPLATES HTML (04-cad-prestador.html, 05-perfil-prestador.html)
   Busca uma vez só e guarda o <template> em cache — chamadas seguintes
   reutilizam o mesmo template, só clonando de novo (sem refetch).
   ========================================================================== */
const _templateCache = new Map();

async function carregarTemplateHTML(caminho, idTemplate) {
    if (!_templateCache.has(caminho)) {
        const resposta = await fetch(caminho);
        if (!resposta.ok) {
            throw new Error(`Não consegui carregar "${caminho}" (HTTP ${resposta.status}). Confira se o arquivo está publicado nesse caminho.`);
        }
        const html = await resposta.text();
        const wrapper = document.createElement("div");
        wrapper.innerHTML = html;
        const template = wrapper.querySelector(`template#${idTemplate}`);
        if (!template) {
            throw new Error(`O arquivo "${caminho}" não contém um <template id="${idTemplate}"> — provavelmente veio um HTML diferente do esperado (ex: fallback de SPA servindo index.html).`);
        }
        _templateCache.set(caminho, template);
    }
    return _templateCache.get(caminho).content.cloneNode(true);
}



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

// Opções do seletor de horário customizado do cadastro (ver TimePickerField
// em abrirCadastroPrestador) — substitui o <input type="time"> nativo, cujo
// picker varia demais de aparência entre navegadores/SOs. Incrementos de
// 30min (48 opções) cobrem o uso real de horário comercial sem virar uma
// lista longa demais pra rolar.

// prestador.horario.dias é um array de índices (0=domingo...6=sábado, igual
// Date.getDay()) — undefined/ausente é tratado como "todos os dias", pra
// prestador cadastrado antes desse campo existir continuar se comportando
// como sempre (sem regressão nos 6 demos e em quem já tinha cadastro).
function estaAberto(prestador) {
    if (!prestador.horario) return true;
    const agora = new Date();
    const dias = prestador.horario.dias;
    if (Array.isArray(dias) && dias.length > 0 && !dias.includes(agora.getDay())) return false;
    const horaAtual = agora.getHours() + agora.getMinutes() / 60;
    const { abre, fecha } = prestador.horario;
    // suporta virada de dia (ex: abre 22, fecha 6 → aberto durante a madrugada)
    if (abre <= fecha) {
        return horaAtual >= abre && horaAtual < fecha;
    }
    return horaAtual >= abre || horaAtual < fecha;
}

// "Todos os dias", "Seg–Sex" (intervalo contíguo) ou "Seg, Qua, Sex" (dias
// avulsos) — mesma lógica visual que qualquer agenda usa pra não escrever
// "Dom, Seg, Ter, Qua, Qui, Sex, Sáb" por extenso quando é só "todo dia".
function textoDiasSemana(dias) {
    if (!Array.isArray(dias) || dias.length === 0 || dias.length === 7) return "Todo dia";
    const ordenados = [...dias].sort((a, b) => a - b);
    const contiguo = ordenados.length > 1 && ordenados.every((d, i) => i === 0 || d === ordenados[i - 1] + 1);
    if (contiguo) return `${NOMES_DIAS_ABREV[ordenados[0]]}–${NOMES_DIAS_ABREV[ordenados[ordenados.length - 1]]}`;
    return ordenados.map(d => NOMES_DIAS_ABREV[d]).join(", ");
}

function formatarHora(horaDecimal) {
    const h = Math.floor(horaDecimal);
    const m = Math.round((horaDecimal % 1) * 60);
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

// ==========================================================================
// MÁSCARA DE TELEFONE — formata ao vivo enquanto a pessoa digita, no
// padrão (XX) XXXX-XXXX (fixo, 10 dígitos) ou (XX) XXXXX-XXXX (celular,
// 11 dígitos), decidindo sozinha qual dos dois conforme a quantidade de
// dígitos já digitados. Só cosmético — quem valida de verdade continua
// sendo telefoneValido() no cliente e validarTelefone() no servidor (ver
// routes/prestadores.js), os dois olhando só os dígitos, nunca essa
// pontuação.
function mascararTelefone(valor) {
    const digitos = String(valor || "").replace(/\D/g, "").slice(0, 11);
    if (digitos.length === 0) return "";
    if (digitos.length <= 2) return `(${digitos}`;
    if (digitos.length <= 6) return `(${digitos.slice(0, 2)}) ${digitos.slice(2)}`;
    if (digitos.length <= 10) return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 6)}-${digitos.slice(6)}`;
    return `(${digitos.slice(0, 2)}) ${digitos.slice(2, 7)}-${digitos.slice(7)}`;
}

// Aplica a máscara acima a um <input> a cada tecla digitada. Reaproveitado
// em qualquer campo de telefone do app (hoje: cadastro de prestador,
// preferências da conta) — então trocar o formato da máscara muda num
// lugar só.
function aplicarMascaraTelefone(input) {
    if (!input) return;
    input.setAttribute("maxlength", "15"); // "(86) 99999-9999" — 15 caracteres com pontuação
    input.addEventListener("input", () => {
        input.value = mascararTelefone(input.value);
    });
}

// Mesma regra do backend (validarTelefone em routes/prestadores.js e
// routes/usuarios.js) — só pra avisar sem esperar a rede; quem decide de
// verdade continua sendo o servidor (nunca confiar só na validação do
// cliente).
function telefoneValido(telefone) {
    const digitos = String(telefone || "").replace(/\D/g, "");
    if (digitos.length !== 10 && digitos.length !== 11) return false;
    const ddd = Number(digitos.slice(0, 2));
    return ddd >= 11 && ddd <= 99;
}

// Auto-formata CPF (000.000.000-00, 11 dígitos) ou CNPJ (00.000.000/0000-00,
// 14 dígitos) enquanto a pessoa digita — decide sozinha qual dos dois
// formatos aplicar conforme a quantidade de dígitos já digitados, mesmo
// princípio de mascararTelefone() logo acima. Cosmético só: quem valida
// de verdade é cpfCnpjValido() no cliente e validarCpfCnpj() no servidor
// (ver utils/cpfCnpj.js) — e mesmo essa validação é só de FORMATO (11 ou
// 14 dígitos), nunca confere se o número existe de verdade (ver decisão
// do produto: é auto-declarado, não verificado — o selo mostra "CPF/CNPJ
// cadastrado", nunca "verificado").
function mascararCpfCnpj(valor) {
    const digitos = String(valor || "").replace(/\D/g, "").slice(0, 14);
    if (digitos.length === 0) return "";

    // Até 11 dígitos digitados, assume que é um CPF em progresso — só
    // "vira" CNPJ (formato diferente, com barra) quando a pessoa
    // realmente passa de 11 dígitos. Sem isso, um CPF de 11 dígitos
    // ainda incompleto (ex: alguém digitando devagar) ficaria oscilando
    // de formato a cada tecla.
    if (digitos.length <= 11) {
        if (digitos.length <= 3) return digitos;
        if (digitos.length <= 6) return `${digitos.slice(0, 3)}.${digitos.slice(3)}`;
        if (digitos.length <= 9) return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6)}`;
        return `${digitos.slice(0, 3)}.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-${digitos.slice(9)}`;
    }

    return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`;
}

// Aplica a máscara acima a um <input> a cada tecla digitada — mesmo
// padrão de aplicarMascaraTelefone() logo acima.
function aplicarMascaraCpfCnpj(input) {
    if (!input) return;
    input.setAttribute("maxlength", "18"); // "00.000.000/0000-00" — 18 caracteres com pontuação
    input.addEventListener("input", () => {
        input.value = mascararCpfCnpj(input.value);
    });
}

// Mesma regra do backend (validarCpfCnpj em utils/cpfCnpj.js) — só
// checagem de FORMATO (11 ou 14 dígitos), nunca se o número existe de
// verdade. Ver comentário de mascararCpfCnpj() acima sobre o porquê.
function cpfCnpjValido(valor) {
    const digitos = String(valor || "").replace(/\D/g, "");
    return digitos.length === 11 || digitos.length === 14;
}

function horarioTextoPrestador(prestador) {
    if (!prestador.horario) return "";
    const diasTexto = textoDiasSemana(prestador.horario.dias);
    if (prestador.horario.abre === 0 && prestador.horario.fecha === 24) return `${diasTexto} · Aberto 24h`;
    return `${diasTexto} · ${formatarHora(prestador.horario.abre)} – ${formatarHora(prestador.horario.fecha)}`;
}

/* Badge reaproveitado no popup do mapa, no perfil e na lista de resultados.
   Cor segue o mesmo sistema do resto do app: esmeralda = positivo/aberto,
   tom neutro (--muted) = fechado, sem soar como erro. */
/* Badge e horário separados — statusBadgeHTML/statusHorarioHTML são usados
   sozinhos na lista de resultados (badge embaixo do avatar, horário na
   coluna de texto). badgeHorarioHTML continua igual, combinando os dois,
   pros outros lugares que ainda mostram tudo junto (popup do mapa, perfil,
   "meus cadastros" — ver usos abaixo). */
function statusBadgeHTML(prestador) {
    const aberto = estaAberto(prestador);
    const classe = aberto ? "StatusBadge StatusBadge--aberto" : "StatusBadge StatusBadge--fechado";
    const texto = aberto ? "Aberto agora" : "Fechado agora";
    return `<span class="${classe}">${texto}</span>`;
}

function statusHorarioHTML(prestador) {
    const horarioTexto = horarioTextoPrestador(prestador);
    return horarioTexto ? `<span class="StatusBadgeHorario">${horarioTexto}</span>` : "";
}

function badgeHorarioHTML(prestador) {
    return statusBadgeHTML(prestador) + statusHorarioHTML(prestador);
}

// Selo "CPF/CNPJ cadastrado" — NÃO diz "verificado" de propósito: o app
// não confere identidade nenhuma (ver validarCpfCnpj em utils/cpfCnpj.js
// no backend — só checa quantidade de dígitos, nunca consulta a Receita),
// então prometer "verificado" seria enganoso. Vale pra TODOS os
// prestadores da mesma conta (documentoCadastrado já vem calculado assim
// de formatarPrestador.js, é a pessoa que declarou o documento, não o
// cadastro individual). Ícone sozinho (sem texto ao lado) porque aparece
// colado no nome em espaços apertados (lista de resultados) — o `title`
// cobre quem passar o mouse/segurar o toque.
function seloDocumentoHTML(prestador) {
    if (!prestador.documentoCadastrado) return "";
    return `
        <svg class="SeloDocumento" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"
            aria-label="CPF/CNPJ cadastrado" role="img">
            <title>CPF/CNPJ cadastrado — informação declarada, não verificada pelo Mase</title>
            <path fill-rule="evenodd" clip-rule="evenodd" d="M9.55879 3.6972C10.7552 2.02216 13.2447 2.02216 14.4412 3.6972L14.6317 3.96387C14.8422 4.25867 15.1958 4.41652 15.5558 4.37652L16.4048 4.28218C18.3156 4.06988 19.9301 5.68439 19.7178 7.59513L19.6235 8.44415C19.5835 8.8042 19.7413 9.15774 20.0361 9.36831L20.3028 9.55879C21.9778 10.7552 21.9778 13.2447 20.3028 14.4412L20.0361 14.6317C19.7413 14.8422 19.5835 15.1958 19.6235 15.5558L19.7178 16.4048C19.9301 18.3156 18.3156 19.9301 16.4048 19.7178L15.5558 19.6235C15.1958 19.5835 14.8422 19.7413 14.6317 20.0361L14.4412 20.3028C13.2447 21.9778 10.7553 21.9778 9.55879 20.3028L9.36831 20.0361C9.15774 19.7413 8.8042 19.5835 8.44414 19.6235L7.59513 19.7178C5.68439 19.9301 4.06988 18.3156 4.28218 16.4048L4.37652 15.5558C4.41652 15.1958 4.25867 14.8422 3.96387 14.6317L3.6972 14.4412C2.02216 13.2447 2.02216 10.7553 3.6972 9.55879L3.96387 9.36831C4.25867 9.15774 4.41652 8.8042 4.37652 8.44414L4.28218 7.59513C4.06988 5.68439 5.68439 4.06988 7.59513 4.28218L8.44415 4.37652C8.8042 4.41652 9.15774 4.25867 9.36831 3.96387L9.55879 3.6972ZM15.7071 9.29289C16.0976 9.68342 16.0976 10.3166 15.7071 10.7071L11.8882 14.526C11.3977 15.0166 10.6023 15.0166 10.1118 14.526L8.29289 12.7071C7.90237 12.3166 7.90237 11.6834 8.29289 11.2929C8.68342 10.9024 9.31658 10.9024 9.70711 11.2929L11 12.5858L14.2929 9.29289C14.6834 8.90237 15.3166 8.90237 15.7071 9.29289Z" fill="var(--soft-blue)"></path>
        </svg>
    `;
}

/* ==========================================================================
   CATEGORIAS — fonte única de verdade. Alimenta os chips do ChipsRow
   (renderizarChips) e as sugestões do estado vazio (subconjunto, ver
   QUERIES_SUGESTAO_VAZIO) — mudar aqui reflete nos dois lugares. O chip
   "Todos" usa a tag "/all", presente em todo prestador só pra isso.
   ========================================================================== */

// "Aberto agora" não é mais resolvido escrevendo "/aberto" na barra de
// busca (query mágica comparada em buscarPrestadores) — isso fazia o campo
// de busca mostrar um texto que o usuário nunca digitou, e impedia
// combinar esse filtro com uma busca de verdade ("mecânico" + "aberto
// agora" ao mesmo tempo, por exemplo). Agora é uma variável de estado
// própria (filtroAbertoAgora, ver perto de chipAtivo), independente do
// texto da busca — combina com qualquer busca/categoria ativa.

/* Gera os botões do ChipsRow a partir de CATEGORIAS_CHIPS. Roda em
   iniciarUI() — antes do Maps carregar — pra já aparecer no primeiro
   paint; os cliques só são vinculados depois de renderizar. */
function renderizarChips() {
    const container = document.getElementById("chipsRow");
    if (!container) return;
    container.innerHTML = CATEGORIAS_CHIPS
        .map(cat => cat.filtro
            ? `<button type="button" class="Chip ThemedControl" data-filtro="${cat.filtro}">${cat.label}</button>`
            : `<button type="button" class="Chip ThemedControl" data-query="${cat.query}">${cat.label}</button>`)
        .join("");
}

/* ==========================================================================
   TEMA CLARO/ESCURO DOS CONTROLES (.ThemedControl)
   Roda fora do initApp() de propósito: se dependesse do Maps carregar, os
   ícones ficariam invisíveis (escuro sobre o Dock escuro) até a API
   responder. "Dinâmico" segue o tipo de mapa (satélite → claro, roadmap →
   escuro); "Claro"/"Escuro" (Configurações → Aparência) fixam o estilo.
   ========================================================================== */

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
   Exige estar logado (usuarioId + tokenSessao), igual o backend exige
   Authorization: Bearer <token> — ver middleware/identidade.js. O prestador criado já
   nasce com dono_usuario_id = usuarioId, então "meus cadastros" (ver
   renderizarMeusCadastros) é uma pergunta real ao servidor agora
   (GET /prestadores/meus), não mais um filtro em localStorage.
   ========================================================================== */

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
        descricao: dados.descricao || "",
        telefone: dados.telefone,
        tagsTexto: dados.tags, // texto cru "fiação, curto, instalação" — o backend que separa e normaliza
        cor: PALETA_CORES_CADASTRO[Math.floor(Math.random() * PALETA_CORES_CADASTRO.length)],
        lat: posicao.lat,
        lng: posicao.lng,
        horarioAbre: horaParaDecimal(dados.horarioAbre),
        horarioFecha: horaParaDecimal(dados.horarioFecha),
        diasSemana: dados.diasSemana
    };

    const resp = await fetch(`${API_BASE}/prestadores`, {
        method: "POST",
        headers: cabecalhosAuth({ "Content-Type": "application/json" }),
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
        descricao: dados.descricao || "",
        telefone: dados.telefone,
        tagsTexto: dados.tags,
        lat: posicao.lat,
        lng: posicao.lng,
        horarioAbre: horaParaDecimal(dados.horarioAbre),
        horarioFecha: horaParaDecimal(dados.horarioFecha),
        diasSemana: dados.diasSemana
    };

    const resp = await fetch(`${API_BASE}/prestadores/${id}`, {
        method: "PATCH",
        headers: cabecalhosAuth({ "Content-Type": "application/json" }),
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
        headers: cabecalhosAuth()
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

// Mesma origem do backend, sem o "/api" — usada pra montar URL de imagem
// estática servida por ele (ver fotoCapaPrestador etc.). Caminho
// relativo tipo "/uploads/..." resolve contra a origem da PÁGINA, não do
// backend — se o front for servido numa porta/domínio diferente do
// backend, a imagem nunca carrega, por isso monta absoluta com
// UPLOADS_BASE.

// Mesmo teto do backend (LIMITE_PRESTADORES_POR_CONTA em prestadores.js) —
// usado só pra UI (desabilitar/avisar antes de tentar); quem barra de
// verdade é o servidor, isso aqui é só feedback antecipado.

// Client ID do OAuth do Google (tipo "Web application"), criado em
// https://console.cloud.google.com/apis/credentials. PRECISA bater com o
// GOOGLE_CLIENT_ID do backend (.env) — é a audiência que o servidor
// confere ao validar o token. Só funciona rodando como site normal (fora
// do WebView do app) — ver conversa sobre o Google bloquear OAuth em
// WebView embutida.

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
        descricao: p.descricao,
        telefone: p.telefone,
        cor: p.cor,
        lat: p.lat,
        lng: p.lng,
        tags: p.tags,
        horario: p.horario,
        donoUsuarioId: p.donoUsuarioId,
        avatarUrl: p.avatarUrl || null,
        avatarCustomizado: p.avatarCustomizado || 0,
        nota: p.nota,
        capaTipo: p.capaTipo || "foto",
        // Sem isso, seloDocumentoHTML() nunca via o valor (undefined) pra
        // qualquer prestador que passasse pela busca/mapa — o backend
        // manda certo, esse mapeador que descartava no caminho.
        documentoCadastrado: p.documentoCadastrado
    };
}

// Texto pronto pra qualquer card (lista, salvos, popup do mapa, perfil).
// temNota=false quando não há avaliação real — quem chama decide a marcação
// (classe CSS is-empty, omitir contagem, etc.), aqui só o texto.
function textoNotaPrestador(nota) {
    if (!nota || nota.quantidade === 0) {
        return {
            temNota: false,
            estrelas: `★`,
            contagem: "n/a"
        };
    }

    return {
        temNota: true,
        estrelas: `★ ${nota.media.toFixed(1)}`,
        contagem: `${nota.quantidade}`
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
            headers: cabecalhosAuth()
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
        headers: cabecalhosAuth()
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

let usuarioLogado = false;
let usuarioId = null;
let tokenSessao = null; // JWT assinado pelo servidor (ver middleware/identidade.js) — prova quem é a pessoa, o id sozinho não prova mais nada
let perfilUsuarioCache = { nome: "Você", email: "", telefone: "", cpfCnpj: "", avatarUrl: null, avatarCustomizado: 0 };

// Monta os headers de autenticação (Authorization: Bearer <token>) pra
// misturar com outros headers da request (ex: Content-Type). Sem sessão
// ativa, devolve só os headers extras — deixa a rota pública seguir
// normalmente, ou a rota protegida devolver 401 (não é papel do front
// decidir isso, é do backend).
function cabecalhosAuth(extra = {}) {
    return tokenSessao ? { ...extra, Authorization: `Bearer ${tokenSessao}` } : extra;
}

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
            const avatarUrl = avatarUrlEfetivo(usuarioId, perfilUsuarioCache.avatarUrl, perfilUsuarioCache.avatarCustomizado)
                || placeholderAvatarPara(usuarioId);
            // Mesmo padrão de avatarHTML() (letra + foto por cima, cai de
            // volta pra letra só se a própria imagem falhar) — a foto pode
            // vir do Google (payload.picture, ver POST /entrar-google no
            // backend), de um upload próprio, ou (a maioria das contas,
            // já que o Google raramente devolve foto) de um placeholder
            // ilustrado sorteado de forma determinística pra essa conta
            // (ver placeholderAvatarPara). referrerpolicy é necessário pra
            // foto do Google: o CDN (lh3.googleusercontent.com) às vezes
            // recusa a imagem se enviarmos a URL completa da nossa página
            // como referrer — inofensivo nos outros casos, então mantido
            // sempre.
            avatarEl.style.position = "relative";
            avatarEl.style.overflow = "hidden";
            avatarEl.innerHTML = `<span>${inicial}</span>
                   <img src="${avatarUrl}" alt="" referrerpolicy="no-referrer"
                        style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                        onload="this.previousElementSibling.style.display='none';"
                        onerror="this.remove();">`;
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
            headers: cabecalhosAuth()
        });
        if (!resp.ok) throw new Error(`GET /prestadores/meus respondeu ${resp.status}`);
        const cadastrados = await resp.json();
        label.textContent = cadastrados.length > 0 ? "Gerenciar meus serviços" : "Cadastre-se como prestador de serviços";
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
    tokenSessao = usuario.token;
    usuarioLogado = true;
    perfilUsuarioCache = { nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, cpfCnpj: usuario.cpfCnpj, avatarUrl: usuario.avatarUrl, avatarCustomizado: usuario.avatarCustomizado || 0 };
    localStorage.setItem(CHAVE_TOKEN_SESSAO, tokenSessao);
    localStorage.setItem(CHAVE_USUARIO_ID, usuarioId); // faltava — restaurarSessao() exige essa chave no próximo refresh, senão sai no primeiro "if (!idSalvo...) return"
    renderizarPaginaPerfil();
    carregarIdsSalvos(); // não bloqueia o login — completa em segundo plano

    // Guarda: só chama se 07-notificacoes.js estiver carregado. Liga o
    // sino/polling assim que a sessão é confirmada, em vez de esperar até
    // 30s pelo próximo tick do polling (ver ATRASO_POLLING_NOTIFICACOES_MS).
    if (typeof aoMudarSessaoNotificacoes === "function") aoMudarSessaoNotificacoes();
}

function sair() {
    usuarioLogado = false;
    usuarioId = null;
    tokenSessao = null;
    idsSalvosSet = new Set();
    localStorage.removeItem(CHAVE_USUARIO_ID);
    localStorage.removeItem(CHAVE_TOKEN_SESSAO);
    renderizarPaginaPerfil();
    fecharCadastroPrestador(); // por segurança, se a tela de cadastro estiver aberta ao deslogar

    // Idem: desliga o sino/polling e esconde o botão na hora do logout.
    if (typeof aoMudarSessaoNotificacoes === "function") aoMudarSessaoNotificacoes();

    // GIS lembra a última conta escolhida e tenta logar sozinho de novo
    // (One Tap) se não avisarmos que o usuário saiu de propósito.
    if (window.google && window.google.accounts && window.google.accounts.id) {
        google.accounts.id.disableAutoSelect();
    }
}

// Roda uma vez na subida do app (ver iniciarPaginaPerfil): se já existe um
// token salvo de uma visita anterior, confirma com o backend que ele
// ainda é válido (assinatura confere e não expirou, ver
// middleware/identidade.js) antes de considerar a pessoa logada — evita
// ficar "logado" com uma sessão que não vale mais (ex: expirou, ou o
// banco foi resetado em dev).
async function restaurarSessao() {
    const idSalvo = localStorage.getItem(CHAVE_USUARIO_ID);
    const tokenSalvo = localStorage.getItem(CHAVE_TOKEN_SESSAO);
    if (!idSalvo || !tokenSalvo) return;

    tokenSessao = tokenSalvo; // precisa estar setado ANTES do fetch, pra ir no header

    try {
        const resp = await fetch(`${API_BASE}/usuarios/${idSalvo}`, {
            headers: cabecalhosAuth()
        });
        if (!resp.ok) throw new Error(`GET /usuarios/${idSalvo} respondeu ${resp.status}`);

        const usuario = await resp.json();
        usuarioId = usuario.id;
        usuarioLogado = true;
        perfilUsuarioCache = { nome: usuario.nome, email: usuario.email, telefone: usuario.telefone, cpfCnpj: usuario.cpfCnpj, avatarUrl: usuario.avatarUrl, avatarCustomizado: usuario.avatarCustomizado || 0 };
        carregarIdsSalvos(); // idem: não bloqueia, completa em segundo plano
    } catch (erro) {
        console.warn("Sessão salva não é mais válida, saindo:", erro);
        tokenSessao = null;
        localStorage.removeItem(CHAVE_USUARIO_ID);
        localStorage.removeItem(CHAVE_TOKEN_SESSAO);
    }

    renderizarPaginaPerfil();
    if (typeof aoMudarSessaoNotificacoes === "function") aoMudarSessaoNotificacoes();
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
    const inicial = (perfilUsuarioCache.nome || "V").trim().charAt(0).toUpperCase();
    const avatarUrlAtual = avatarUrlEfetivo(usuarioId, perfilUsuarioCache.avatarUrl, perfilUsuarioCache.avatarCustomizado)
        || placeholderAvatarPara(usuarioId);

    const overlay = abrirOverlayGenerico("Preferências da conta", `
        <div class="FotosPrestadorAvatarRow" style="margin-bottom:22px;">
            <label class="ProfileAvatarBig" id="editarPerfilAvatar"
                style="position:relative; flex-shrink:0; cursor:pointer;">
                <input type="file" accept="image/*" id="editarPerfilAvatarInput" hidden>
                <div style="position:absolute; inset:0; border-radius:50%; overflow:hidden; display:flex; align-items:center; justify-content:center;">
                    <span>${inicial}</span>
                    <img src="${avatarUrlAtual}" alt="" referrerpolicy="no-referrer"
                        style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                        onload="this.previousElementSibling.style.display='none';"
                        onerror="this.remove();">
                </div>
                <span style="position:absolute; right:-2px; bottom:-2px; width:26px; height:26px; border-radius:50%;
                    background-color:var(--ink); color:var(--paper); display:flex; align-items:center; justify-content:center;
                    border:2px solid var(--paper); pointer-events:none;">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                        <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                        <circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"></circle>
                    </svg>
                </span>
            </label>
            <div>
                <div class="CadastroHint" style="margin:0 0 6px;" id="editarPerfilAvatarStatus">Toque na foto pra trocar.</div>
                <button type="button" class="CadastroHint" id="editarPerfilAvatarReverter"
                    style="margin:0; padding:0; border:0; background:none; text-decoration:underline; cursor:pointer; color:var(--muted);"
                    ${perfilUsuarioCache.avatarCustomizado ? "" : "hidden"}>Usar foto do Google</button>
            </div>
        </div>
        <form class="CadastroForm" id="editarPerfilForm">
            <label class="CadastroField">
                <span class="CadastroLabel">Nome</span>
                <input type="text" name="nome" class="CadastroInput" value="${perfilUsuarioCache.nome.replace(/"/g, "&quot;")}" required>
            </label>
            <label class="CadastroField">
                <span class="CadastroLabel">Telefone (WhatsApp)</span>
                <input type="tel" name="telefone" class="CadastroInput" placeholder="(86) 99999-9999" value="${(perfilUsuarioCache.telefone || "").replace(/"/g, "&quot;")}">
            </label>
            <label class="CadastroField">
                <span class="CadastroLabel">CPF ou CNPJ (opcional)</span>
                <input type="text" inputmode="numeric" name="cpfCnpj" class="CadastroInput" placeholder="000.000.000-00" value="${mascararCpfCnpj(perfilUsuarioCache.cpfCnpj || "").replace(/"/g, "&quot;")}">
            </label>
            <div class="CadastroHint">Cadastrando um CPF/CNPJ, seus prestadores ganham o selo "CPF/CNPJ cadastrado" no perfil. Não confere identidade — é uma informação declarada por você, não verificada pelo Mase.</div>
            <div class="CadastroHint">O e-mail (${perfilUsuarioCache.email || "—"}) não pode ser trocado por aqui — é ele quem identifica sua conta, direto da sua conta Google.</div>
            <div class="CadastroErro" id="editarPerfilErro" hidden></div>
            <button type="submit" class="CadastroSubmit">Finalizar</button>
        </form>
    `);

    const form = overlay.querySelector("#editarPerfilForm");
    const erroEl = overlay.querySelector("#editarPerfilErro");
    const botao = form.querySelector(".CadastroSubmit");

    // Auto-formatação: (86) 99999-9999 e 000.000.000-00 aparecem sozinhos
    // enquanto a pessoa digita. Ver mascararTelefone/mascararCpfCnpj no
    // topo do arquivo.
    aplicarMascaraTelefone(form.querySelector('[name="telefone"]'));
    aplicarMascaraCpfCnpj(form.querySelector('[name="cpfCnpj"]'));

    const avatarEl = overlay.querySelector("#editarPerfilAvatar");
    const avatarInput = overlay.querySelector("#editarPerfilAvatarInput");
    const avatarStatusEl = overlay.querySelector("#editarPerfilAvatarStatus");
    const avatarReverterBtn = overlay.querySelector("#editarPerfilAvatarReverter");

    // Reflete o avatar atual (customizado, Google, ou placeholder
    // ilustrado quando não há foto nenhuma) tanto aqui dentro quanto na
    // tela "Meu perfil" por baixo — os dois mostram a mesma conta, então
    // os dois precisam atualizar juntos.
    function atualizarAvatarLocal() {
        const url = avatarUrlEfetivo(usuarioId, perfilUsuarioCache.avatarUrl, perfilUsuarioCache.avatarCustomizado)
            || placeholderAvatarPara(usuarioId);
        const novaInicial = (perfilUsuarioCache.nome || "V").trim().charAt(0).toUpperCase();
        avatarEl.innerHTML = `
            <input type="file" accept="image/*" id="editarPerfilAvatarInput" hidden>
            <span>${novaInicial}</span>
            <img src="${url}" alt="" referrerpolicy="no-referrer"
                style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                onload="this.previousElementSibling.style.display='none';"
                onerror="this.remove();">
            <span style="position:absolute; right:-2px; bottom:-2px; width:26px; height:26px; border-radius:50%;
                background-color:var(--ink); color:var(--paper); display:flex; align-items:center; justify-content:center;
                border:2px solid var(--paper); pointer-events:none;">
                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" width="13" height="13">
                    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"></path>
                    <circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.8"></circle>
                </svg>
            </span>
        `;
        // o input de dentro foi recriado agora — precisa religar o listener nele
        avatarEl.querySelector("input").addEventListener("change", aoEscolherAvatar);
        avatarReverterBtn.hidden = !perfilUsuarioCache.avatarCustomizado;
        renderizarPaginaPerfil();
    }

    async function aoEscolherAvatar() {
        const inputAtual = avatarEl.querySelector("input");
        const arquivo = inputAtual.files[0];
        inputAtual.value = "";
        if (!arquivo) return;

        const blob = await abrirCropImagem({
            arquivo, circular: true, larguraSaida: 480, alturaSaida: 480,
            titulo: "Ajustar foto de perfil"
        });
        if (!blob) return; // cancelou o corte, nada muda

        avatarStatusEl.textContent = "Enviando...";
        try {
            const dados = new FormData();
            dados.append("foto", blob, "avatar.jpg");
            const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}/avatar`, {
                method: "POST",
                headers: cabecalhosAuth(),
                body: dados
            });
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => ({}));
                throw new Error(corpo.erro || `Não foi possível enviar a foto (HTTP ${resp.status}).`);
            }
            const atualizado = await resp.json();
            perfilUsuarioCache.avatarCustomizado = atualizado.avatarCustomizado;
            avatarStatusEl.textContent = "Toque na foto pra trocar.";
            atualizarAvatarLocal();
        } catch (erro) {
            avatarStatusEl.textContent = erro.message;
        }
    }

    avatarInput.addEventListener("change", aoEscolherAvatar);

    avatarReverterBtn.addEventListener("click", async () => {
        avatarStatusEl.textContent = "Revertendo...";
        try {
            const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}/avatar`, {
                method: "DELETE",
                headers: cabecalhosAuth()
            });
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => ({}));
                throw new Error(corpo.erro || `Não foi possível reverter (HTTP ${resp.status}).`);
            }
            perfilUsuarioCache.avatarCustomizado = 0;
            avatarStatusEl.textContent = "Toque na foto pra trocar.";
            atualizarAvatarLocal();
        } catch (erro) {
            avatarStatusEl.textContent = erro.message;
        }
    });

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const { nome, telefone, cpfCnpj } = Object.fromEntries(new FormData(form).entries());

        erroEl.hidden = true;

        // Telefone e CPF/CNPJ são opcionais aqui (ao contrário do cadastro
        // de prestador): campo vazio some/limpa o valor salvo. Só valida
        // formato quando a pessoa de fato digitou algo.
        if (telefone.trim() && !telefoneValido(telefone)) {
            erroEl.textContent = "Telefone inválido. Use um número com DDD, ex: (86) 99999-9999.";
            erroEl.hidden = false;
            return;
        }
        if (cpfCnpj.trim() && !cpfCnpjValido(cpfCnpj)) {
            erroEl.textContent = "CPF/CNPJ inválido. Confira se digitou todos os dígitos.";
            erroEl.hidden = false;
            return;
        }

        botao.disabled = true;
        botao.textContent = "Salvando...";

        try {
            const resp = await fetch(`${API_BASE}/usuarios/${usuarioId}`, {
                method: "PATCH",
                headers: cabecalhosAuth({ "Content-Type": "application/json" }),
                body: JSON.stringify({ nome, telefone, cpfCnpj })
            });
            if (!resp.ok) {
                const corpo = await resp.json().catch(() => ({}));
                throw new Error(corpo.erro || `Não foi possível salvar (HTTP ${resp.status}).`);
            }

            const atualizado = await resp.json();
            perfilUsuarioCache.nome = atualizado.nome;
            perfilUsuarioCache.telefone = atualizado.telefone;
            perfilUsuarioCache.cpfCnpj = atualizado.cpfCnpj;
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
        toggleNotifPush: "notifPush"
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

        [CHAVE_USUARIO_ID, CHAVE_TOKEN_SESSAO, CHAVE_CONFIG_APP].forEach(chave => localStorage.removeItem(chave));

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
            headers: cabecalhosAuth()
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

    // Telefone repetido entre serviços da mesma conta não é mais um erro
    // (ver prestadores.js — o 409 de duplicata foi removido: é legítimo um
    // WhatsApp só atender por mais de um serviço). Isso aqui só monta uma
    // contagem pra mostrar uma tag BEM sutil no card, sem travar nada.
    const contagemTelefones = {};
    cadastrados.forEach(p => {
        const digitos = String(p.telefone || "").replace(/\D/g, "");
        contagemTelefones[digitos] = (contagemTelefones[digitos] || 0) + 1;
    });

    lista.innerHTML = cadastrados.map(p => {
        const digitos = String(p.telefone || "").replace(/\D/g, "");
        const telefoneCompartilhado = contagemTelefones[digitos] > 1;
        return `
        <div class="CadastroMeusCard" data-id="${p.id}" style="border-color:${p.cor};">
            <div class="CadastroMeusCardTopo">
                <div class="CadastroMeusCardNome">${p.nome}${seloDocumentoHTML(p)}</div>
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
            <div class="CadastroMeusCardTelefoneRow">
                <div class="CadastroMeusCardTelefone">${p.telefone}</div>
                ${telefoneCompartilhado ? `<span class="CadastroMeusCardTelefoneTag">também em outro serviço</span>` : ""}
            </div>
            <div class="CadastroMeusCardStatus">${badgeHorarioHTML(p)}</div>
        </div>
    `;
    }).join("");

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
            // Lê de `cadastrados` (não via textContent do card) — desde que o
            // selo de documento virou um <svg><title> dentro desse elemento,
            // textContent passaria a incluir o texto do title junto do nome.
            const prestador = cadastrados.find(p => String(p.id) === card.dataset.id);
            const nome = prestador ? prestador.nome : card.querySelector(".CadastroMeusCardNome").textContent;

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
   GERENCIAR CAPA DO PRESTADOR (até 4 fotos, ou 1 vídeo)
   Nome do arquivo salvo pelo backend é determinístico (id do prestador,
   ver routes/prestadores.js) — por isso o preview aqui usa exatamente as
   mesmas URLs que o resto do app (fotosCapaPrestador/fotoCapaVideoPrestador),
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
function enviarFotoPrestadorComProgresso(prestadorId, rota, blob, aoProgredir, campo = "foto", nomeArquivo = "foto.jpg") {
    return new Promise((resolve, reject) => {
        const dados = new FormData();
        dados.append(campo, blob, nomeArquivo);

        const xhr = new XMLHttpRequest();
        xhr.open("POST", `${API_BASE}/prestadores/${prestadorId}/${rota}`);
        if (tokenSessao) xhr.setRequestHeader("Authorization", `Bearer ${tokenSessao}`);

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
// maxDimensao (1080 = "1080p", mesmo teto aplicado de novo do lado do
// servidor em LARGURA_FOTO_AVALIACAO, ver routes/avaliacoes.js — os dois
// concordam de propósito, esse aqui só evita subir bytes à toa numa
// conexão de celular) e recodifica como JPEG na qualidade pedida — de
// sobra já que o backend ainda vai reprocessar (resize + webp) em cima
// disso de qualquer forma. Usada hoje só no upload de foto de avaliação
// (o fluxo de foto de prestador já passa por abrirCropImagem, que já
// gera um blob pequeno via canvas antes de enviar).
function comprimirImagemParaUpload(arquivo, maxDimensao = 1080, qualidade = 0.82) {
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
   VALIDAÇÃO DO VÍDEO DE CAPA — só client-side por enquanto (sem
   ffmpeg/ffprobe no servidor, ver prestadores.js). Confere tipo e tamanho
   na hora (síncrono) e duração via metadata do próprio <video> (só sabe
   depois de carregar o arquivo, por isso é assíncrono/Promise). Resolve
   se passou em tudo, rejeita com Error(mensagem) pronta pra mostrar.
   ========================================================================== */
function validarVideoCapa(arquivo) {
    return new Promise((resolve, reject) => {
        if (arquivo.type !== "video/mp4") {
            reject(new Error("O vídeo de capa precisa ser .mp4."));
            return;
        }
        if (arquivo.size > TAMANHO_MAXIMO_VIDEO_CAPA_BYTES) {
            reject(new Error(`Vídeo muito grande (máximo ${TAMANHO_MAXIMO_VIDEO_CAPA_BYTES / 1024 / 1024}MB).`));
            return;
        }

        const video = document.createElement("video");
        video.preload = "metadata";
        const urlObjeto = URL.createObjectURL(arquivo);

        video.onloadedmetadata = () => {
            URL.revokeObjectURL(urlObjeto);
            if (video.duration > DURACAO_MAXIMA_VIDEO_CAPA_SEGUNDOS) {
                reject(new Error(`Vídeo muito longo (máximo ${DURACAO_MAXIMA_VIDEO_CAPA_SEGUNDOS}s).`));
                return;
            }
            resolve();
        };
        video.onerror = () => {
            URL.revokeObjectURL(urlObjeto);
            reject(new Error("Não foi possível ler o vídeo selecionado."));
        };
        video.src = urlObjeto;
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

// Busca a fila cega de TODOS os prestadores que o usuário logado é dono —
// parte pura de rede, sem tocar em DOM nenhum, pra poder ser chamada tanto
// daqui (overlay de cadastro) quanto do painel de notificações
// (07-notificacoes.js). Retorna null em caso de falha (quem chamou decide
// o que fazer — a tela de cadastro só desiste silenciosamente, o painel
// de notificações mostra um aviso).
async function buscarAvaliacoesPendentes() {
    let meusCadastros;
    try {
        const resp = await fetch(`${API_BASE}/prestadores/meus`, { headers: cabecalhosAuth() });
        if (!resp.ok) throw new Error(`GET /prestadores/meus respondeu ${resp.status}`);
        meusCadastros = await resp.json();
    } catch (erro) {
        console.warn("Não foi possível carregar seus cadastros pra checar pendências:", erro);
        return null;
    }

    try {
        const porPrestador = await Promise.all(meusCadastros.map(async p => {
            const respFila = await fetch(`${API_BASE}/prestadores/${p.id}/avaliacoes/pendentes`, {
                headers: cabecalhosAuth()
            });
            if (!respFila.ok) throw new Error(`GET .../avaliacoes/pendentes respondeu ${respFila.status}`);
            const fila = await respFila.json();
            return fila.map(av => ({ ...av, prestadorId: p.id, prestadorNome: p.nome, prestadorCategoria: p.categoria, prestadorCor: p.cor }));
        }));
        const pendentes = porPrestador.flat().sort((a, b) => a.criadoEm - b.criadoEm);
        return { pendentes, multiplosCadastros: meusCadastros.length > 1 };
    } catch (erro) {
        console.warn("Não foi possível carregar as avaliações pendentes:", erro);
        return null;
    }
}

// Só a marcação dos cards — mesmo HTML de sempre, extraído pra função
// própria pra não duplicar entre o overlay de cadastro e o painel de
// notificações.
function montarHtmlAvaliacoesPendentes(pendentes, multiplosCadastros) {
    return pendentes.map(av => {
        const diasRestantes = Math.max(0, Math.ceil((av.criadoEm + PRAZO_AVALIACAO_MS - Date.now()) / (24 * 60 * 60 * 1000)));
        const dataFormatada = new Date(av.criadoEm).toLocaleDateString("pt-BR");
        const sobreQuem = multiplosCadastros ? ` · sobre ${av.prestadorNome}` : "";

        return `
            <div class="AvaliacaoPendenteItem" data-id="${av.id}" data-prestador-id="${av.prestadorId}" style="border-color:${av.prestadorCor};">
                <div class="AvaliacaoPendenteHeader">
                    <div class="AvaliacaoPendenteAutorRow">
                        ${avatarClienteHTML(av.autorNome, av.autorAvatarUrl, "AvaliacaoPendenteAvatar", av.autorUsuarioId, av.autorAvatarCustomizado)}
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
}

// Liga os cliques de Aceitar/Rejeitar de qualquer lista de cards já
// montada por montarHtmlAvaliacoesPendentes() dentro de listaEl — mesma
// lógica de sempre, só que agora recebe o container (em vez de assumir
// #avaliacoesPendentesList fixo) e um callback aoDecidir(avaliacaoId)
// disparado depois de aceitar OU rejeitar com sucesso, com o id da
// avaliação decidida — pra quem chamou tanto atualizar a própria tela
// quanto (no painel de notificações) marcar a notificação correspondente
// como lida.
function ligarHandlersAvaliacoesPendentes(listaEl, aoDecidir) {
    listaEl.querySelectorAll(".AvaliacaoPendenteItem").forEach(item => {
        const id = item.dataset.id;

        item.querySelector(".AvaliacaoPendenteAceitar").addEventListener("click", async (event) => {
            event.target.disabled = true;
            try {
                const resp = await fetch(`${API_BASE}/avaliacoes/${id}/aceitar`, {
                    method: "POST",
                    headers: cabecalhosAuth()
                });
                if (!resp.ok) throw new Error(`POST .../aceitar respondeu ${resp.status}`);

                await carregarPrestadores(); // nota do prestador mudou, recarrega
                aoDecidir(id);
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
                    headers: cabecalhosAuth({ "Content-Type": "application/json" }),
                    body: JSON.stringify({ motivo })
                });
                if (!resp.ok) throw new Error(`POST .../rejeitar respondeu ${resp.status}`);

                aoDecidir(id);
            } catch (erro) {
                console.warn("Não foi possível rejeitar a avaliação:", erro);
                event.target.disabled = false;
            }
        });
    });
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
    const toggleBtn = document.getElementById("cadastroAvaliacoesToggleBtn");
    const toggleTexto = document.getElementById("cadastroAvaliacoesToggleTexto");
    if (!section || !lista) return;

    const dados = await buscarAvaliacoesPendentes();
    if (!dados) return;
    const { pendentes, multiplosCadastros } = dados;

    if (pendentes.length === 0) {
        // Sem nada pra decidir: nem o botão faz sentido aparecer, então
        // some os dois — e fecha a seção, pra não deixar um "resto" aberto
        // e vazio caso a última pendência tenha acabado de ser decidida.
        section.hidden = true;
        if (toggleBtn) {
            toggleBtn.hidden = true;
            toggleBtn.classList.remove("is-aberto");
            toggleBtn.setAttribute("aria-expanded", "false");
        }
        return;
    }

    lista.innerHTML = montarHtmlAvaliacoesPendentes(pendentes, multiplosCadastros);
    ligarHandlersAvaliacoesPendentes(lista, async () => {
        await renderizarAvaliacoesPendentes();
        // Notificações e fila cega são fontes independentes (ver
        // 07-notificacoes.js) — decidir por aqui também precisa refletir
        // lá, caso o painel de notificações esteja aberto ao mesmo tempo
        // em outra aba/instância.
        if (typeof atualizarBadgeNotificacoes === "function") atualizarBadgeNotificacoes();
    });

    // Só mostra/atualiza o BOTÃO aqui — quem abre/fecha a seção em si é o
    // clique nele (ver listener em abrirCadastroPrestador). Não mexe em
    // section.hidden nesta ramificação: se a pessoa já tinha aberto pra
    // decidir uma e ainda sobrou outra, continua aberta; se estava
    // fechada, continua fechada até ela clicar.
    if (toggleBtn) {
        toggleBtn.hidden = false;
        if (toggleTexto) {
            toggleTexto.textContent = `Avaliações pendentes (${pendentes.length})`;
        }
    }
}

// Rola até a seção de avaliações pendentes e pisca as pendências de UM
// prestador específico — usado quando se chega aqui pela notificação do
// sino (link "avaliacoes-pendentes:<id>", ver aoTocarNotificacao() em
// 07-notificacoes.js). Sem isso, quem tem mais de um cadastro caía na
// lista inteira sem saber qual item era o da notificação que tocou.
function focarAvaliacoesPendentesDoPrestador(prestadorId) {
    const section = document.getElementById("avaliacoesPendentesSection");
    const toggleBtn = document.getElementById("cadastroAvaliacoesToggleBtn");
    if (!section) return;

    const itens = document.querySelectorAll(`.AvaliacaoPendenteItem[data-prestador-id="${prestadorId}"]`);
    if (itens.length === 0) return; // já foi decidida/expirou entre a notificação e o clique

    // A seção agora nasce recolhida por padrão (ver botão de alternância em
    // abrirCadastroPrestador) — chegando aqui direto pela notificação do
    // sino, sem ter clicado nele antes, precisa abrir sozinha pra o scroll/
    // piscar abaixo fazerem sentido.
    if (section.hidden) {
        section.hidden = false;
        if (toggleBtn) {
            toggleBtn.classList.add("is-aberto");
            toggleBtn.setAttribute("aria-expanded", "true");
        }
    }

    itens[0].scrollIntoView({ behavior: "smooth", block: "center" });
    itens.forEach(item => {
        item.classList.add("is-focado");
        item.addEventListener("animationend", () => item.classList.remove("is-focado"), { once: true });
    });
}

async function abrirCadastroPrestador(prestadorIdFoco = null) {
    // Guarda de segurança: mesmo que o botão só apareça pra quem está
    // "logado", a função em si também checa — não depende só da UI escondida.
    if (!usuarioLogado) return;

    fecharCadastroPrestador();

    const overlay = document.createElement("div");
    overlay.className = "ProviderProfile CadastroOverlay";
    overlay.appendChild(await carregarTemplateHTML("04-cad-prestador.tpl", "tpl-cad-prestador"));

    // Autocomplete de categoria (datalist) — busca as categorias já em uso
    // e sugere no campo, mas nunca restringe: digitar qualquer coisa nova
    // continua funcionando normal, isso aqui só ajuda a bater com o que já
    // existe em vez de criar variação nova sem querer ("Encanador" vs
    // "encanador" vs "Cano"). Fire-and-forget: se falhar (rede etc.), o
    // campo continua sendo texto livre normal, sem sugestão nenhuma.
    fetch(`${API_BASE}/prestadores/categorias`)
        .then(resp => resp.ok ? resp.json() : [])
        .then(categorias => {
            overlay.querySelector("#cadastroCategoriasList").innerHTML =
                categorias.map(c => `<option value="${String(c).replace(/"/g, "&quot;")}"></option>`).join("");
        })
        .catch(() => { });

    // "Sujo" = tem algo que se perderia fechando agora. Não tenta rastrear
    // toda interação possível (chip de dia, opção de horário, ponto no
    // mapa) uma por uma — mais simples e робusto usar passoAtual > 1 como
    // proxy: só se chega no passo 2 depois de passar pela validação do
    // passo 1, então já existe categoria preenchida por trás. No passo 1
    // ainda, olha os campos de texto diretamente.
    function formTemDadosNaoSalvos() {
        if (formSection.hidden) return false; // nem está no formulário agora
        if (!sucesso.hidden) return false; // já concluiu, só esperando fechar
        if (passoAtual > 1) return true;
        if (fotosPendentes.size > 0 || capaModoVideo) return true;
        return [...form.querySelectorAll("input[type=text], textarea")].some(el => el.value.trim() !== "");
    }

    function fecharCadastroComConfirmacao() {
        if (formTemDadosNaoSalvos() && !confirm("Sair sem salvar? As informações preenchidas neste cadastro vão se perder.")) {
            return;
        }
        fecharCadastroPrestador();
    }

    // Textos que dependem de LIMITE_PRESTADORES_POR_CONTA (01-constantes.js)
    overlay.querySelector("#cadastroMeusContador").textContent =
        `0 de ${LIMITE_PRESTADORES_POR_CONTA} cadastros usados`;
    overlay.querySelector("#cadastroLimiteHint").textContent =
        `Limite de ${LIMITE_PRESTADORES_POR_CONTA} cadastros por conta atingido — remova um pra cadastrar outro.`;

    // Opções de horário (HORARIOS_OPCOES em 01-constantes.js)
    const preencherOpcoesHorario = (campo, valorAtivo) => {
        const painel = overlay.querySelector(
            `.TimePickerField[data-campo="${campo}"] .TimePickerPanelOptions`
        );
        painel.innerHTML = HORARIOS_OPCOES.map(h => `
            <button type="button" class="TimePickerOption${h === valorAtivo ? " is-active" : ""}" data-valor="${h}">${h}</button>
        `).join("");
    };
    preencherOpcoesHorario("horarioAbre", "08:00");
    preencherOpcoesHorario("horarioFecha", "18:00");

    // Chips de dia da semana (NOMES_DIAS_ABREV em 01-constantes.js)
    overlay.querySelector("#cadastroDiasRow").innerHTML = NOMES_DIAS_ABREV.map((nome, i) => `
        <button type="button" class="CadastroDiaChip is-active" data-dia="${i}">${nome}</button>
    `).join("");


    overlay.querySelector(".CadastroOverlayClose").addEventListener("click", () => fecharCadastroComConfirmacao());

    const meusSection = overlay.querySelector("#cadastroMeusSection");
    const formSection = overlay.querySelector("#cadastroFormSection");
    const diasRow = overlay.querySelector("#cadastroDiasRow");
    const formTitulo = overlay.querySelector("#cadastroFormTitulo");
    const novoBtn = overlay.querySelector("#cadastroNovoBtn");
    const form = overlay.querySelector("#cadastroForm");
    const sucesso = overlay.querySelector("#cadastroSuccess");
    const sucessoTitulo = overlay.querySelector("#cadastroSuccessTitulo");
    const sucessoVerPerfilBtn = overlay.querySelector("#cadastroSuccessVerPerfilBtn");
    const erroEl = overlay.querySelector("#cadastroErro");
    const voltarBtn = overlay.querySelector("#cadastroVoltarBtn");
    const avancarBtn = overlay.querySelector("#cadastroAvancarBtn");
    const stepsLabel = overlay.querySelector("#cadastroStepsLabel");
    const stepEls = [...overlay.querySelectorAll(".CadastroStep")];
    const dotEls = [...overlay.querySelectorAll(".CadastroStepDot")];

    // Avaliações pendentes nascem recolhidas (ver #avaliacoesPendentesSection
    // no template, hidden por padrão) — este botão é o único jeito de
    // abrir/fechar. Quem decide MOSTRAR o botão em si (quando existe ao
    // menos 1 pendência) é renderizarAvaliacoesPendentes() mais abaixo.
    const avaliacoesToggleBtn = overlay.querySelector("#cadastroAvaliacoesToggleBtn");
    const avaliacoesSection = overlay.querySelector("#avaliacoesPendentesSection");
    if (avaliacoesToggleBtn && avaliacoesSection) {
        avaliacoesToggleBtn.addEventListener("click", () => {
            const vaiAbrir = avaliacoesSection.hidden;
            avaliacoesSection.hidden = !vaiAbrir;
            avaliacoesToggleBtn.classList.toggle("is-aberto", vaiAbrir);
            avaliacoesToggleBtn.setAttribute("aria-expanded", String(vaiAbrir));
        });
    }

    // Auto-formatação: (86) 99999-9999 aparece sozinho enquanto a pessoa
    // digita, sem precisar acertar a pontuação na mão. Ver mascararTelefone
    // no topo do arquivo.
    aplicarMascaraTelefone(form.querySelector('[name="telefone"]'));

    const TOTAL_PASSOS = stepEls.length; // 4 (Dados, Contato, Horário/local, Fotos)
    const TITULOS_PASSO = { 1: "Dados básicos", 2: "Contato", 3: "Horário e localização", 4: "Fotos" };
    let passoAtual = 1;
    let sucessoAutoFecharTimeoutId = null;

    // null = cadastrando um prestador novo; um objeto = editando um já
    // existente (veio de "Editar" na lista). É essa variável que decide,
    // no passo 3, se a gente faz POST (criar) ou PATCH (atualizar) — e,
    // a partir do momento que existe (seja por já vir preenchida na
    // edição, seja por acabar de ser criada), o passo 4 sabe pra qual id
    // mandar as fotos.
    let prestadorEmEdicao = null;

    // Dias em que o prestador funciona — fora do FormData de propósito,
    // igual as fotos (passo 4): são botões de toggle, não <input>, então
    // não entram sozinhos em new FormData(form). Todos ativos por padrão
    // (mesmo espírito do "sem horário = sempre aberto" que já existia:
    // aqui, "sem restrição de dia" = todo dia).
    let diasSelecionados = new Set([0, 1, 2, 3, 4, 5, 6]);

    function atualizarChipsDias() {
        diasRow.querySelectorAll(".CadastroDiaChip").forEach(chip => {
            chip.classList.toggle("is-active", diasSelecionados.has(Number(chip.dataset.dia)));
        });
    }

    diasRow.querySelectorAll(".CadastroDiaChip").forEach(chip => {
        chip.addEventListener("click", () => {
            const dia = Number(chip.dataset.dia);
            // Não deixa desmarcar o último dia ativo — prestador sem
            // nenhum dia selecionado é um estado sem sentido (nunca
            // aparece como aberto pra ninguém, e some da badge sem avisar
            // por quê). Pelo menos um dia sempre fica marcado.
            if (diasSelecionados.has(dia) && diasSelecionados.size === 1) return;
            diasSelecionados.has(dia) ? diasSelecionados.delete(dia) : diasSelecionados.add(dia);
            atualizarChipsDias();
        });
    });

    /* ==========================================================================
       SELETOR DE HORÁRIO CUSTOMIZADO ("Abre às" / "Fecha às")
       Substitui o <input type="time"> nativo — o picker dele varia demais
       de aparência entre navegador/SO (relógio no Android, roda no iOS) e
       não segue o visual do resto do app. Mesmo padrão de painel do
       RadiusPanel (botão + lista de opções), só que dois em paralelo (um
       por campo) e escopado dentro do form em vez de flutuar sobre o mapa.
       O valor de verdade continua num <input type="hidden"> com o mesmo
       name de antes — o resto do código (FormData, preencherFormulario,
       reset) não precisa saber que o picker mudou por baixo.
       ========================================================================== */
    const timePickerFields = [...overlay.querySelectorAll(".TimePickerField")];

    function fecharTimePickers() {
        timePickerFields.forEach(campo => {
            campo.querySelector(".TimePickerPanel").hidden = true;
            campo.querySelector(".TimePickerBtn").setAttribute("aria-expanded", "false");
        });
    }

    // Único ponto que muda um horário de verdade — usado tanto pelo clique
    // numa opção quanto pelo reset/preenchimento em modo edição, assim o
    // botão visível (rótulo + opção destacada) nunca fica dessincronizado
    // do <input hidden> que de fato viaja no FormData.
    function definirHorario(nomeCampo, valor) {
        const campo = timePickerFields.find(c => c.dataset.campo === nomeCampo);
        if (!campo) return;
        campo.querySelector('input[type="hidden"]').value = valor;
        campo.querySelector(".TimePickerBtnValor").textContent = valor;
        campo.querySelectorAll(".TimePickerOption").forEach(opcao => {
            opcao.classList.toggle("is-active", opcao.dataset.valor === valor);
        });
    }

    timePickerFields.forEach(campo => {
        const botao = campo.querySelector(".TimePickerBtn");
        const painel = campo.querySelector(".TimePickerPanel");

        botao.addEventListener("click", (event) => {
            event.stopPropagation();
            const estavaAberto = !painel.hidden;
            fecharTimePickers();
            if (estavaAberto) return;
            painel.hidden = false;
            botao.setAttribute("aria-expanded", "true");
            const ativo = painel.querySelector(".TimePickerOption.is-active");
            if (ativo) ativo.scrollIntoView({ block: "center" });
        });

        painel.querySelectorAll(".TimePickerOption").forEach(opcao => {
            opcao.addEventListener("click", () => {
                definirHorario(campo.dataset.campo, opcao.dataset.valor);
                fecharTimePickers();
            });
        });
    });

    // "Clicar fora fecha" escopado ao próprio overlay (em vez de
    // document) — o overlay some do DOM ao fechar o cadastro, então esse
    // listener some junto. Um listener em document aqui vazaria um novo
    // handler morto a cada vez que o cadastro é reaberto.
    overlay.addEventListener("click", (event) => {
        if (!event.target.closest(".TimePickerField")) fecharTimePickers();
    });

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
        else if (passo === 3) avancarBtn.textContent = prestadorEmEdicao ? "Finalizar" : "Cadastrar";
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
        form.querySelector('[name="categoria"]').value = p.categoria;
        form.querySelector('[name="descricao"]').value = p.descricao || "";
        form.querySelector('[name="telefone"]').value = p.telefone;
        const categoriaNormalizada = normalizar(p.categoria);
        const tagsExtras = (p.tags || []).filter(t => t !== "/all" && t !== categoriaNormalizada);
        form.querySelector('[name="tags"]').value = tagsExtras.join(", ");
        if (p.horario) {
            definirHorario("horarioAbre", formatarHora(p.horario.abre));
            definirHorario("horarioFecha", formatarHora(p.horario.fecha));
            diasSelecionados = new Set(Array.isArray(p.horario.dias) && p.horario.dias.length > 0 ? p.horario.dias : [0, 1, 2, 3, 4, 5, 6]);
            atualizarChipsDias();
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
        definirHorario("horarioAbre", "08:00");
        definirHorario("horarioFecha", "18:00");
        diasSelecionados = new Set([0, 1, 2, 3, 4, 5, 6]);
        atualizarChipsDias();
        cadastroPontoEscolhido = null;
        prestadorEmEdicao = prestador;
        formTitulo.textContent = prestador ? `Editar ${prestador.nome}` : "Cadastrar novo prestador";
        sucessoTitulo.textContent = prestador ? "Alterações salvas!" : "Cadastro salvo!";

        atualizarPreviewConta();

        if (prestador) {
            preencherFormulario(prestador);
            atualizarFontesFotos();
        } else if (perfilUsuarioCache.telefone) {
            // Cadastro novo (não edição): já vem com o telefone da conta
            // (ver "Preferências da conta") como ponto de partida, em vez
            // de nascer sempre vazio — a pessoa troca se o contato desse
            // prestador específico for outro número.
            form.querySelector('[name="telefone"]').value = mascararTelefone(perfilUsuarioCache.telefone);
        }

        meusSection.hidden = true;
        formSection.hidden = false;
        sucesso.hidden = true;
        form.hidden = false;
        irParaPasso(1);
    }

    function fecharFormulario() {
        formSection.hidden = true;
        meusSection.hidden = false;
        form.reset();
        definirHorario("horarioAbre", "08:00");
        definirHorario("horarioFecha", "18:00");
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
            if (formTemDadosNaoSalvos() && !confirm("Sair sem salvar? As informações preenchidas neste cadastro vão se perder.")) {
                return;
            }
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
        dados.diasSemana = [...diasSelecionados];
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
        sucessoAutoFecharTimeoutId = setTimeout(() => {
            fecharFormulario();
            form.hidden = false;
        }, 2200);

        renderizarMeusCadastros();
        renderizarAvaliacoesPendentes();
        atualizarRotuloBotaoCadastro();
    }

    // "Ver perfil" no aviso de sucesso: cancela o auto-fechamento, sai do
    // cadastro e abre o perfil publicado — mesma sensação de "confirma
    // como ficou" que uma tela de revisão daria, só que depois de salvo em
    // vez de antes (mais simples, e a pessoa já vê o resultado real, não
    // uma prévia que pode divergir do que o backend realmente gravou).
    sucessoVerPerfilBtn.addEventListener("click", () => {
        if (sucessoAutoFecharTimeoutId) {
            clearTimeout(sucessoAutoFecharTimeoutId);
            sucessoAutoFecharTimeoutId = null;
        }
        const prestadorParaAbrir = prestadorEmEdicao;
        fecharFormulario();
        form.hidden = false;
        fecharCadastroPrestador();
        abrirPerfilPrestador(prestadorParaAbrir);
    });

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
    // Token incrementado a cada abertura/fechamento do form — invalida
    // qualquer operação assíncrona de foto/vídeo ainda em andamento (crop,
    // validação) se a pessoa fechar e reabrir o wizard antes de terminar.
    let sessaoFotoAtual = 0;

    const contaAvatarEl = overlay.querySelector("#cadastroContaAvatar");
    const contaNomeEl = overlay.querySelector("#cadastroContaNome");

    // Preenche o preview "Publicando como" (passo 4) com nome/foto da
    // CONTA logada — mesmo padrão de renderizarPaginaPerfil (letra sobre
    // --gold, foto do Google ou placeholder ilustrado por cima). Chamado
    // toda vez que o formulário abre (cadastro novo ou edição): mesmo
    // editando um prestador de outro dia, o nome/foto mostrados aqui são
    // os ATUAIS da conta, nunca os que estavam valendo quando aquele
    // prestador foi criado — é assim que "ao vivo" funciona.
    function atualizarPreviewConta() {
        const inicial = (perfilUsuarioCache.nome || "V").trim().charAt(0).toUpperCase();
        const avatarUrl = avatarUrlEfetivo(usuarioId, perfilUsuarioCache.avatarUrl, perfilUsuarioCache.avatarCustomizado)
            || placeholderAvatarPara(usuarioId);
        contaNomeEl.textContent = perfilUsuarioCache.nome || "Você";
        contaAvatarEl.innerHTML = `<span>${inicial}</span>
               <img src="${avatarUrl}" alt="" referrerpolicy="no-referrer"
                    style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                    onload="this.previousElementSibling.style.display='none';"
                    onerror="this.remove();">`;
    }
    const fotosErro = overlay.querySelector("#cadastroFotosErro");
    const capaItens = [...overlay.querySelectorAll("#cadastroFotosCapaGrid .FotosPrestadorCapaItem")];
    const [capaItemPrincipal, ...capaItensSecundarios] = capaItens;
    const capaVideoPrincipal = capaItemPrincipal.querySelector("video");
    const capaImgPrincipal = capaItemPrincipal.querySelector("img");
    const capaBadgePrincipal = capaItemPrincipal.querySelector(".FotosPrestadorCapaBadge");

    // true quando a capa está em modo vídeo (slot principal = vídeo, 2-4
    // desativados) — mutuamente exclusivo com o carrossel de fotos, ver
    // entrarModoVideoCapa/sairModoVideoCapa logo abaixo.
    let capaModoVideo = false;

    // Desliga o modo vídeo visualmente (reativa os slots 2-4, volta o
    // badge do principal pra "Principal") sem mexer em fotosPendentes —
    // quem chama decide o que fazer com a pendência de vídeo.
    function reativarSlotsSecundariosCapa() {
        capaBadgePrincipal.textContent = "Principal";
        capaItensSecundarios.forEach((item) => item.classList.remove("is-disabled-video"));
    }

    // Chamado quando um vídeo válido foi escolhido no slot principal.
    // Vídeo e fotos são exclusivos: limpa qualquer foto (salva ou
    // pendente) dos 4 slots antes de entrar no modo vídeo.
    function entrarModoVideoCapa(blob) {
        capaModoVideo = true;
        // Mantém prestadorEmEdicao em sincronia com a escolha feita agora
        // — sem isso, "Ver perfil" logo depois de concluir mostraria o
        // carrossel de fotos antigo em vez do vídeo recém-enviado (o
        // objeto só seria atualizado de verdade no próximo GET).
        if (prestadorEmEdicao) prestadorEmEdicao.capaTipo = "video";

        capaItens.forEach((item) => {
            const indice = Number(item.dataset.indice);
            fotosPendentes.delete(`foto-capa/${indice}`);
        });

        fotosPendentes.set("capa-video", {
            blob,
            aplicar: (novaUrl) => { capaVideoPrincipal.src = novaUrl; },
            progressWrap: capaItemPrincipal.querySelector(".FotosPrestadorUploadProgress"),
            progressBar: capaItemPrincipal.querySelector(".FotosPrestadorProgressBar"),
            progressPct: capaItemPrincipal.querySelector(".FotosPrestadorProgressPct"),
            campo: "video",
            nomeArquivo: "capa.mp4"
        });

        capaImgPrincipal.hidden = true;
        capaVideoPrincipal.src = URL.createObjectURL(blob);
        capaVideoPrincipal.hidden = false;
        capaItemPrincipal.querySelector(".FotosPrestadorCapaTile").classList.remove("is-empty");
        capaBadgePrincipal.textContent = "Vídeo";

        capaItensSecundarios.forEach((item) => {
            const img = item.querySelector("img");
            img.src = "";
            img.hidden = true;
            item.querySelector(".FotosPrestadorCapaTile").classList.add("is-empty");
            item.querySelector(".FotosPrestadorCapaGrip").hidden = true;
            item.classList.add("is-disabled-video");
        });
    }

    // Chamado quando uma foto é escolhida no slot principal enquanto o
    // modo vídeo estava ativo (troca de volta pro carrossel de fotos).
    function sairModoVideoCapa() {
        capaModoVideo = false;
        if (prestadorEmEdicao) prestadorEmEdicao.capaTipo = "foto";
        fotosPendentes.delete("capa-video");
        capaVideoPrincipal.hidden = true;
        capaVideoPrincipal.removeAttribute("src");
        reativarSlotsSecundariosCapa();
    }

    // Preenche avatar + capas com as fotos/vídeo já salvos do prestador
    // atual (chamado ao entrar no passo 4, e logo depois de criar/editar)
    // — só faz sentido quando já existe um id de verdade pra montar as
    // URLs. Pula qualquer slot que já tenha uma prévia pendente (foto/
    // vídeo escolhido na mão, ou o avatar do Google pré-preenchido) —
    // senão isso aqui sobrescreveria a prévia local com a URL definitiva,
    // que ainda nem existe no servidor (só sobe de verdade em "Concluir").
    function atualizarFontesFotos() {
        if (!prestadorEmEdicao) return;

        if (prestadorEmEdicao.capaTipo === "video" && !fotosPendentes.has("capa-video")) {
            capaModoVideo = true;
            capaImgPrincipal.hidden = true;
            capaVideoPrincipal.src = `${fotoCapaVideoPrestador(prestadorEmEdicao.id)}?t=${Date.now()}`;
            capaVideoPrincipal.hidden = false;
            capaItemPrincipal.querySelector(".FotosPrestadorCapaTile").classList.remove("is-empty");
            capaBadgePrincipal.textContent = "Vídeo";
            capaItensSecundarios.forEach((item) => item.classList.add("is-disabled-video"));
            return;
        }

        const capasUrls = fotosCapaPrestador(prestadorEmEdicao.id);
        capaItens.forEach((item, i) => {
            if (!fotosPendentes.has(`foto-capa/${i + 1}`)) {
                item.querySelector("img").src = capasUrls[i];
            }
        });
    }

    // usarAvatarGoogleComoPadrao() foi removida — o avatar do Google não é
    // mais "pré-preenchido como pendência de upload", ele JÁ é o avatar
    // (ver atualizarPreviewConta acima e formatarPrestador.js no backend).
    // Nada mais a fazer aqui além de mostrar o preview.


    // Limpa qualquer estado de fotos entre uma abertura do wizard e outra
    // (ex: cadastrar um prestador, depois abrir "Cadastrar novo" de novo,
    // ou abrir "Editar" de alguém diferente) — sem isso, sobrariam
    // prévias/pendências do prestador anterior.
    function resetarPassoFotos() {
        sessaoFotoAtual++;
        fotosPendentes.clear();
        fotosErro.hidden = true;
        capaModoVideo = false;
        capaVideoPrincipal.hidden = true;
        capaVideoPrincipal.removeAttribute("src");
        capaBadgePrincipal.textContent = "Principal";
        capaItens.forEach((item) => {
            const img = item.querySelector("img");
            img.src = "";
            img.hidden = true;
            item.querySelector(".FotosPrestadorCapaTile").classList.add("is-empty");
            item.querySelector(".FotosPrestadorCapaGrip").hidden = true;
            item.classList.remove("is-disabled-video");
        });
    }

    // avatarInput.addEventListener(...) foi removido junto com o upload de
    // foto de perfil — avatar agora vem sempre da conta (ver
    // atualizarPreviewConta).

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

            // Slots 2-4 ficam visualmente desativados em modo vídeo (ver
            // is-disabled-video), mas o <input> continua clicável por
            // baixo do <label> — essa segunda trava garante que nenhum
            // arquivo escolhido ali seja processado enquanto for vídeo.
            if (indice !== 1 && capaModoVideo) return;

            fotosErro.hidden = true;

            // Só o slot principal aceita vídeo — os outros nem tentam
            // identificar tipo (accept já restringe a imagem neles).
            if (indice === 1 && arquivo.type.startsWith("video/")) {
                try {
                    await validarVideoCapa(arquivo);
                } catch (erro) {
                    fotosErro.textContent = erro.message;
                    fotosErro.hidden = false;
                    return;
                }
                entrarModoVideoCapa(arquivo);
                return;
            }

            // Slot principal recebendo uma FOTO enquanto estava em modo
            // vídeo: volta pro carrossel de fotos antes de continuar.
            if (indice === 1 && capaModoVideo) sairModoVideoCapa();

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
                await enviarFotoPrestadorComProgresso(
                    prestadorEmEdicao.id, rota, dados.blob,
                    (fracao) => atualizarAnelProgresso(dados.progressBar, dados.progressPct, fracao),
                    dados.campo || "foto",
                    dados.nomeArquivo || "foto.jpg"
                );
                const urlDefinitiva = rota === "capa-video"
                    ? fotoCapaVideoPrestador(prestadorEmEdicao.id)
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
    renderizarAvaliacoesPendentes().then(() => {
        if (prestadorIdFoco) focarAvaliacoesPendentesDoPrestador(prestadorIdFoco);
    });
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

    // "Aberto agora" — chip independente, com sua própria variável
    // (filtroAbertoAgora) em vez de reaproveitar a barra de busca. Fica
    // ligado/desligado sozinho e combina com qualquer busca/categoria
    // ativa no momento, em vez de substituí-la.
    document.querySelectorAll(".Chip[data-filtro]").forEach(chip => {
        chip.addEventListener("click", () => {
            if (!map) return; // Maps ainda não carregou
            filtroAbertoAgora = !filtroAbertoAgora;
            chip.classList.toggle("is-active", filtroAbertoAgora);
            buscarPrestadores(ultimaQueryBuscada || "/all");
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
let watchId = null;
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

// Filtro "Aberto agora" — independente do texto de busca/chip de
// categoria (ver renderizarChips/buscarPrestadores). true = só mostra
// quem está aberto neste exato momento, combinado com qualquer busca ou
// categoria que esteja ativa ao mesmo tempo.
let filtroAbertoAgora = false;

// Controla o atraso simulado entre "usuário digitou" (ou clicou num chip)
// e o resultado aparecer — dá tempo do skeleton (placeholder animado)
// aparecer na lista antes dos resultados reais, e serve de debounce
// natural (evita recalcular a busca a cada tecla digitada).
let buscaTimeoutId = null;

/* ==========================================================================
   ROTAS DE IMAGEM DA CAPA — dentro de public/uploads/prestadores/capa no
   backend (avatar não tem rota própria mais, é sempre prestador.avatarUrl,
   herdado da conta — ver formatarPrestador.js). A URL PÚBLICA é
   "/uploads/..." (o que o server.js expõe via express.static — ver
   app.use("/uploads", ...)), não o caminho de disco
   "backend/src/public/uploads/..." — usar o caminho de disco como URL dá
   404 na certa. Absoluta (com UPLOADS_BASE) pelo mesmo motivo do
   urlAbsolutaFoto no backend: front e backend podem estar em portas
   diferentes.
   ========================================================================== */
function fotoCapaPrestador(id) {
    return `${UPLOADS_BASE}/uploads/prestadores/capa/${id}.webp`;
}

// Avatar customizado (upload próprio na conta, ver POST /usuarios/:id/avatar
// no backend) — mesmo padrão determinístico das outras fotos do app
// (nome = id + extensão fixa, sem precisar guardar URL nenhuma no banco).
function fotoUsuarioPrestador(id) {
    return `${UPLOADS_BASE}/uploads/usuarios/avatar/${id}.webp`;
}

// Decide qual URL de avatar usar: a customizada (nosso upload) tem
// prioridade sobre a do Google — mesma regra em todo canto que mostra
// avatar de conta/prestador (popup, pin do mapa, lista, "Meu perfil",
// preview do cadastro, avatar de quem avaliou). avatarUrl aqui é sempre a
// do Google (ou null); avatarCustomizado NÃO é mais um booleano puro — é
// 0 (sem foto própria) ou o timestamp (ms) de quando a foto própria foi
// trocada pela última vez (ver POST /usuarios/:id/avatar no backend).
// Esse número dobra como cache-bust (?v=...): o arquivo em disco tem
// sempre o MESMO nome (id da conta), então sem algo que muda a cada
// upload, a URL da foto nova seria idêntica à da antiga, e o navegador
// jamais pediria a versão nova de novo — ficaria preso na primeira foto
// que qualquer tela carregou, pra sempre.
function avatarUrlEfetivo(id, avatarUrl, avatarCustomizado) {
    return avatarCustomizado ? `${fotoUsuarioPrestador(id)}?v=${avatarCustomizado}` : avatarUrl;
}

// Capa em vídeo — exclusiva com as 4 fotos de fotosCapaPrestador() (ver
// capa_tipo no backend). Mesmo padrão determinístico de nome (id do
// prestador), só troca a extensão. Restrições combinadas com Erik:
// máx 60s / 30MB, só .mp4 (h264, roda confiável no WebView Android) —
// duração só é validada no CLIENTE (validarVideoCapa mais abaixo), o
// servidor não tem ffmpeg/ffprobe pra confirmar de novo.
const TAMANHO_MAXIMO_VIDEO_CAPA_BYTES = 70 * 1024 * 1024;
const DURACAO_MAXIMA_VIDEO_CAPA_SEGUNDOS = 60;

function fotoCapaVideoPrestador(id) {
    return `${UPLOADS_BASE}/uploads/prestadores/capa/${id}.mp4`;
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
// className decide só o tamanho/contexto (perfil, lista, popup do mapa);
// position/overflow vêm inline pra não depender de cada classe CSS
// lembrar de declarar isso. avatarUrl vem de usuarios.avatar_url no
// backend (foto do Google da conta que cadastrou, ver
// formatarPrestador.js) — não é mais upload nosso. Sempre tenta mostrar
// uma IMAGEM: foto real (Google ou upload) > placeholder ilustrado
// aleatório (ver placeholderAvatar) — a letra só aparece se até a
// imagem do placeholder falhar em carregar (ver onerror).
function avatarHTML(prestador, className) {
    const avatarUrl = avatarUrlEfetivo(prestador.donoUsuarioId, prestador.avatarUrl, prestador.avatarCustomizado)
        || placeholderAvatar(prestador);
    return `
        <div class="${className}" style="background-color:${prestador.cor}; position:relative; overflow:hidden;">
            <span>${prestador.categoria.charAt(0)}</span>
            <img src="${avatarUrl}" alt="Foto de perfil de ${prestador.nome}" referrerpolicy="no-referrer"
                style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                onload="this.previousElementSibling.style.display='none';"
                onerror="this.remove();">
        </div>
    `;
}

// Mesmo padrão de letra+foto usado em avatarHTML() (prestador) e no avatar
// do próprio usuário (renderizarPaginaPerfil) — aqui pra avatar de CLIENTE
// (quem avaliou), que não tem "categoria"/cor fixa, então cai pra letra do
// nome sobre --ink (cor já definida nas classes .ProviderProfileReviewAvatar
// / .AvaliacaoPendenteAvatar em style.css). avatarUrl/avatarCustomizado vêm
// de usuarios.avatar_url/avatar_customizado no backend — passam por
// avatarUrlEfetivo() igual o avatar de prestador, pra respeitar foto
// própria (não só a do Google) e aplicar o mesmo cache-bust. id é o
// usuarioId de quem avaliou — ESSENCIAL pro placeholder ilustrado (quando
// não há foto nenhuma) cair no MESMO desenho que "Meu perfil"/
// "Preferências da conta" dessa pessoa mostram; sem ele, cada tela
// sorteava um desenho diferente pra mesma conta. Só cai no nome como
// semente (menos preciso, mas ainda determinístico) se por algum motivo
// vier sem id.
function avatarClienteHTML(nome, avatarUrl, className, id, avatarCustomizado) {
    const inicial = (nome || "?").trim().charAt(0).toUpperCase();
    const url = avatarUrlEfetivo(id, avatarUrl, avatarCustomizado) || placeholderAvatarPara(id || nome);
    return `
        <div class="${className}" style="position:relative; overflow:hidden;">
            <span>${inicial}</span>
            <img src="${url}" alt="" referrerpolicy="no-referrer"
                style="position:absolute; inset:0; width:100%; height:100%; object-fit:cover;"
                onload="this.previousElementSibling.style.display='none';"
                onerror="this.remove();">
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
   MARKDOWN BÁSICO DA DESCRIÇÃO ("Sobre")
   Suporte mínimo e seguro: *negrito*, _itálico_ e quebra de linha.
   Escapa HTML antes de aplicar qualquer formatação, pra descrição de
   prestador nunca virar injeção de HTML/script.
   ========================================================================== */
function escapeHTML(texto) {
    return texto
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

function renderBioMarkdown(texto) {
    let html = escapeHTML(texto);

    // Negrito: *texto*
    html = html.replace(/\*([^*\n]+)\*/g, "<strong>$1</strong>");

    // Itálico: _texto_
    html = html.replace(/#([^#\n]+)#/g, "<em>$1</em>");

    // Quebra de linha
    html = html.replace(/\n/g, "<br>");

    return html;
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

// Uma capa que não existe ainda (URL determinística que dá 404 porque o
// prestador só tem 2 das 4 fotos, por exemplo) não é uma FALHA — é
// esperado, e não deve virar um slide de placeholder ocupando lugar no
// rodízio. Por isso o onerror aqui remove o slide de vez em vez de trocar
// o src pelo placeholder — assim o carrossel só alterna entre fotos que
// realmente existem. O placeholder só aparece (ver abaixo) se, depois de
// tentar todas, sobrar zero fotos reais — aí sim é preciso mostrar algo
// no lugar da capa vazia.
function removerSlideCapa(img) {
    const container = img.closest(".ProviderProfileCover");
    if (!container) return;
    const eraAtivo = img.classList.contains("is-active");
    img.remove();

    const restantes = container.querySelectorAll(".ProviderProfileCoverImg");
    if (restantes.length === 0) {
        const placeholder = document.createElement("img");
        placeholder.className = "ProviderProfileCoverImg is-active";
        placeholder.src = CAPA_PLACEHOLDER;
        placeholder.alt = "";
        container.insertBefore(placeholder, container.firstElementChild);
    } else if (eraAtivo) {
        restantes[0].classList.add("is-active");
    }
}

// Alterna a classe is-active entre os slides da capa a cada 2s. Roda
// enquanto o perfil estiver aberto — a própria fecharPerfilPrestador()
// limpa o intervalo, então não fica rodando em segundo plano depois que
// o overlay já foi removido do DOM.
//
// Consulta os slides de novo a cada tick (em vez de guardar uma lista
// fixa uma vez só) porque removerSlideCapa pode tirar slides do ar a
// qualquer momento, conforme cada <img> termina de carregar (ou falha)
// de forma assíncrona — uma lista guardada de antemão ficaria
// referenciando elementos que já não existem mais no DOM.

function iniciarRotacaoCapa(container) {
    perfilCapaIntervalId = setInterval(() => {
        const slides = [...container.querySelectorAll(".ProviderProfileCoverImg")];
        if (slides.length <= 1) return;

        const indiceAtivo = slides.findIndex(s => s.classList.contains("is-active"));
        const atual = indiceAtivo === -1 ? 0 : indiceAtivo;
        const proximo = (atual + 1) % slides.length;
        slides[atual].classList.remove("is-active");
        slides[proximo].classList.add("is-active");
    }, INTERVALO_ROTACAO_CAPA_MS);
}

// Mesmo prazo do backend (ver backend/src/jobs/expirarAvaliacoes.js) —
// usado só pra exibir "expira em Xd" na fila de pendentes; quem decide de
// verdade quando publicar sozinho é o job do servidor, isso aqui é só o
// texto informativo.

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
// routes/avaliacoes.js). Funciona sem login (cabecalhosAuth() não manda
// Authorization sem tokenSessao) — o servidor só não grava nada nesse caso.
function registrarCliqueWhatsapp(prestadorId) {
    fetch(`${API_BASE}/prestadores/${prestadorId}/whatsapp-clique`, {
        method: "POST",
        headers: cabecalhosAuth()
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

// Lightbox de tela cheia — z-index acima do .ProviderProfile (30), já
// que abre por cima dele. É um carrossel: abre na foto tocada, mas dá
// pra arrastar (touch no celular, mouse no desktop) pra esquerda/direita
// entre TODAS as fotos publicadas desse prestador sem fechar e reabrir —
// mesmo gesto de "arrastar pra trocar" das stories do Instagram/
// AliExpress. lightboxFotos/lightboxIndice guardam o estado do carrossel
// enquanto ele está aberto (limpos de novo em fecharLightbox).
let lightboxEl = null;
let lightboxFotos = [];
let lightboxIndice = 0;

function fecharLightbox(viaPopstate) {
    registrarFechamentoOverlay(fecharLightbox, viaPopstate);
    if (lightboxEl) {
        lightboxEl.remove();
        lightboxEl = null;
    }
    lightboxFotos = [];
    lightboxIndice = 0;
}

// Preenche a tela inteira (foto mestre já vem 9:19.5 do backend, ver
// LARGURA/ALTURA_FOTO_AVALIACAO em routes/avaliacoes.js) e mostra nota +
// comentário da avaliação sobrepostos por cima da foto, na parte de
// baixo — mesmo estilo "story" do AliExpress. `fotos` é a lista INTEIRA
// vinda de fotosClientesPrestador (não só a foto tocada) e `indiceInicial`
// é a posição dela nessa lista — o carrossel (arrastarLightbox abaixo) só
// navega dentro dessa mesma lista, então cada slide já nasce pronto no
// DOM em vez de recarregar a foto a cada arrasto.
function abrirLightbox(fotos, indiceInicial) {
    fecharLightbox();
    if (!fotos || fotos.length === 0) return;

    lightboxFotos = fotos;
    lightboxIndice = Math.min(Math.max(indiceInicial, 0), fotos.length - 1);

    const overlay = document.createElement("div");
    overlay.className = "PhotoLightbox";
    overlay.innerHTML = `
        <button type="button" class="PhotoLightboxClose" aria-label="Fechar foto">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                    stroke-linecap="round" stroke-linejoin="round"></path>
            </svg>
        </button>
        ${fotos.length > 1 ? `
            <div class="PhotoLightboxDots">
                ${fotos.map(() => `<span class="PhotoLightboxDot"></span>`).join("")}
            </div>
        ` : ""}
        <div class="PhotoLightboxTrack">
            ${fotos.map(foto => {
        const autorSeguro = escapeHTML(foto.autor || "");
        const comentarioSeguro = foto.comentario ? escapeHTML(foto.comentario) : "";
        const notaNumero = Number(foto.nota) || 0;
        return `
                    <div class="PhotoLightboxSlide">
                        <img class="PhotoLightboxImg" src="${foto.src}" alt="Foto de serviço enviada por ${autorSeguro}"
                            draggable="false" onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
                        <div class="PhotoLightboxCaption">
                            <div class="PhotoLightboxAutor">${autorSeguro}</div>
                            ${notaNumero > 0 ? `<div class="PhotoLightboxStars">${"★".repeat(notaNumero)}${"☆".repeat(5 - notaNumero)}</div>` : ""}
                            ${comentarioSeguro ? `<div class="PhotoLightboxComentario">${comentarioSeguro}</div>` : ""}
                        </div>
                    </div>
                `;
    }).join("")}
        </div>
    `;

    const track = overlay.querySelector(".PhotoLightboxTrack");

    overlay.querySelector(".PhotoLightboxClose").addEventListener("click", () => fecharLightbox());
    configurarArrasteLightbox(overlay, track);
    posicionarLightboxTrack(overlay, track, false);

    document.body.appendChild(overlay);
    lightboxEl = overlay;
    registrarAberturaOverlay(fecharLightbox);
}

// Move o track pro slide de lightboxIndice atual (com ou sem animação,
// conforme `animar`) e acende a bolinha correspondente no indicador.
function posicionarLightboxTrack(overlay, track, animar) {
    track.style.transition = animar ? "transform 0.25s ease" : "none";
    track.style.transform = `translateX(-${lightboxIndice * 100}%)`;

    overlay.querySelectorAll(".PhotoLightboxDot").forEach((ponto, indice) => {
        ponto.classList.toggle("is-active", indice === lightboxIndice);
    });
}

// Arrastar (pointerdown/move/up cobre touch e mouse com a mesma API) pra
// trocar de foto sem fechar o overlay. Segue o dedo/cursor em tempo real
// (translateX = posição do slide atual, ajustada pelo quanto já foi
// arrastado); ao soltar, se passou de 1/3 da largura da tela OU o gesto
// foi rápido o bastante (mesmo arrasto curto, mas "de flick"), avança ou
// volta um slide — senão volta pro slide atual com uma animação de mola.
// Um toque/clique que NÃO arrastou nada (deltaX pequeno) não faz NADA —
// de propósito: a única forma de fechar é o botão X, arrastar é a única
// forma de trocar de foto. Antes um toque parado fechava o lightbox
// (mesmo comportamento de "tocar fecha" de app de foto simples), mas
// isso conflitava com qualquer toque acidental na área da legenda/foto
// enquanto a pessoa só queria olhar — ver conversa sobre isso.
function configurarArrasteLightbox(overlay, track) {
    let arrastando = false;
    let inicioX = 0;
    let deltaX = 0;
    let inicioTempo = 0;

    function aoMover(evento) {
        if (!arrastando) return;
        deltaX = evento.clientX - inicioX;
        const largura = overlay.clientWidth || 1;
        const percentual = (deltaX / largura) * 100;
        track.style.transform = `translateX(calc(-${lightboxIndice * 100}% + ${percentual}%))`;
    }

    function aoSoltar() {
        if (!arrastando) return;
        arrastando = false;
        window.removeEventListener("pointermove", aoMover);
        window.removeEventListener("pointerup", aoSoltar);
        window.removeEventListener("pointercancel", aoSoltar);

        const largura = overlay.clientWidth || 1;
        const duracaoMs = Date.now() - inicioTempo;
        const velocidade = Math.abs(deltaX) / Math.max(duracaoMs, 1); // px/ms
        const passouLimite = Math.abs(deltaX) > largura / 3 || velocidade > 0.5;

        if (Math.abs(deltaX) <= 10) {
            // Gesto foi essencialmente um toque parado, não um arrasto —
            // NÃO faz nada (nem fecha, nem troca de foto). Só desfaz
            // qualquer micro-deslocamento visual que o dedo possa ter
            // causado. Fechar é só pelo botão X; a única ação de toque
            // que existe aqui dentro é arrastar pra trocar de imagem.
            posicionarLightboxTrack(overlay, track, false);
            return;
        }

        if (passouLimite && deltaX < 0 && lightboxIndice < lightboxFotos.length - 1) {
            lightboxIndice += 1;
        } else if (passouLimite && deltaX > 0 && lightboxIndice > 0) {
            lightboxIndice -= 1;
        }

        posicionarLightboxTrack(overlay, track, true);
    }

    overlay.addEventListener("pointerdown", (evento) => {
        if (evento.pointerType === "mouse" && evento.button !== 0) return; // ignora botão direito/meio
        if (evento.target.closest(".PhotoLightboxClose")) return; // não inicia arrasto tocando no X
        arrastando = true;
        inicioX = evento.clientX;
        deltaX = 0;
        inicioTempo = Date.now();
        track.style.transition = "none";
        window.addEventListener("pointermove", aoMover);
        window.addEventListener("pointerup", aoSoltar);
        window.addEventListener("pointercancel", aoSoltar);
    });

    // Setas do teclado — só faz sentido ter foco de teclado no desktop,
    // onde não existe gesto de arrastar; ArrowRight avança, ArrowLeft
    // volta, mesmo padrão de qualquer carrossel/story conhecido.
    function aoTeclado(evento) {
        if (evento.key === "ArrowRight" && lightboxIndice < lightboxFotos.length - 1) {
            lightboxIndice += 1;
            posicionarLightboxTrack(overlay, track, true);
        } else if (evento.key === "ArrowLeft" && lightboxIndice > 0) {
            lightboxIndice -= 1;
            posicionarLightboxTrack(overlay, track, true);
        }
    }
    document.addEventListener("keydown", aoTeclado);

    // Some junto quando o lightbox fecha por qualquer caminho (X, arrasto
    // de "toque parado", botão física de voltar) — sem isso o listener
    // de teclado ficaria vazando pra sempre, mexendo num overlay que já
    // nem existe mais.
    const observadorRemocao = new MutationObserver(() => {
        if (!document.body.contains(overlay)) {
            document.removeEventListener("keydown", aoTeclado);
            observadorRemocao.disconnect();
        }
    });
    observadorRemocao.observe(document.body, { childList: true });
}

/* ==========================================================================
   AVALIAR PRESTADOR — POST /api/prestadores/:id/avaliacoes
   Nasce "pendente" no backend (fila cega), não aparece na hora no perfil.
   Por isso a mensagem de sucesso é explícita sobre isso, pra não parecer
   que a avaliação sumiu ou falhou silenciosamente. Exige login, igual
   salvar na lista — o backend também recusa sem sessão válida
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
                <span class="CadastroLabel">Fotos do serviço (opcional, até 3)</span>
                <div class="AvaliarFotosGrade" id="avaliarFotosGrade">
                    ${[0, 1, 2].map(i => `
                        <div class="AvaliarFotoSlot">
                            <input type="file" accept="image/*" id="avaliarFotoInput${i}" hidden>
                            <label for="avaliarFotoInput${i}" class="AvaliarFotoBtn" id="avaliarFotoBtn${i}" aria-label="Adicionar foto ${i + 1}">
                                <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                    <path d="M4 7h3l2-2h6l2 2h3a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1Z"
                                        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                                    <circle cx="12" cy="13" r="3.2" stroke="currentColor" stroke-width="1.6"></circle>
                                </svg>
                            </label>
                            <div class="AvaliarFotoPreview" id="avaliarFotoPreview${i}" hidden>
                                <img id="avaliarFotoPreviewImg${i}" alt="Prévia da foto ${i + 1} selecionada">
                                <span id="avaliarFotoPreviewFallback${i}" class="AvaliarFotoPreviewFallback" hidden>Sem prévia</span>
                                <button type="button" class="AvaliarFotoRemover" id="avaliarFotoRemover${i}" aria-label="Remover foto ${i + 1}">
                                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"></path>
                                    </svg>
                                </button>
                            </div>
                        </div>
                    `).join("")}
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
                <div class="CadastroSuccessText">Fica em análise até ${prestador.nome.split(" ")[0]} responder — ou até 7 dias, se não responder será descartado.</div>
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

    // ---- Campos de foto (3 slots): seleção, preview e remoção ----
    // Ficam só no cliente até o submit (nenhum upload acontece aqui) — os
    // arquivos escolhidos viajam juntos no FormData do envio final, todos
    // sob o campo "fotos" (plural — ver receberFotosOpcionais em
    // avaliacoes.js, que aceita até 3). Validar tipo aqui é só pra dar
    // feedback rápido; o backend valida de novo de qualquer forma (nunca
    // confiar só no que o navegador manda).
    //
    // criarSlotFoto(i) monta UM slot independente — os 3 são idênticos em
    // comportamento, só reaproveitados por índice em vez de triplicar o
    // código à mão. Retorna um getter pro arquivo atual (ou null), que o
    // submit usa pra montar o FormData.
    function criarSlotFoto(indice) {
        const input = overlay.querySelector(`#avaliarFotoInput${indice}`);
        const btn = overlay.querySelector(`#avaliarFotoBtn${indice}`);
        const preview = overlay.querySelector(`#avaliarFotoPreview${indice}`);
        const previewImg = overlay.querySelector(`#avaliarFotoPreviewImg${indice}`);
        const previewFallback = overlay.querySelector(`#avaliarFotoPreviewFallback${indice}`);
        const remover = overlay.querySelector(`#avaliarFotoRemover${indice}`);
        let previewUrl = null;

        function limpar() {
            input.value = "";
            if (previewUrl) {
                URL.revokeObjectURL(previewUrl);
                previewUrl = null;
            }
            preview.hidden = true;
            btn.hidden = false;
        }

        // Se o navegador não conseguir decodificar o arquivo pra prévia
        // (caso comum: foto tirada em HEIC, formato padrão da câmera do
        // iPhone — Chrome/Firefox/Android não sabem exibir HEIC num
        // <img>, só o Safari), mostra um aviso simples em vez de deixar o
        // ícone de imagem quebrada. O arquivo continua selecionado
        // normalmente: a falta de prévia não impede o envio, quem decide
        // se manda ou não é comprimirImagemParaUpload() no submit.
        previewImg.addEventListener("error", () => {
            previewImg.hidden = true;
            previewFallback.hidden = false;
        });

        input.addEventListener("change", () => {
            const arquivo = input.files[0];
            if (!arquivo) return;

            if (!arquivo.type.startsWith("image/")) {
                erroEl.textContent = "Escolha um arquivo de imagem (JPG, PNG, WEBP...).";
                erroEl.hidden = false;
                limpar();
                return;
            }

            erroEl.hidden = true;
            previewImg.hidden = false;
            previewFallback.hidden = true;
            if (previewUrl) URL.revokeObjectURL(previewUrl);
            previewUrl = URL.createObjectURL(arquivo);
            previewImg.src = previewUrl;
            preview.hidden = false;
            btn.hidden = true;
        });

        remover.addEventListener("click", limpar);

        return { obterArquivo: () => input.files[0] || null };
    }

    const slotsFoto = [0, 1, 2].map(criarSlotFoto);

    form.addEventListener("submit", async (event) => {
        event.preventDefault();
        erroEl.hidden = true;

        const nota = Number(notaInput.value);
        if (!nota) {
            erroEl.textContent = "Escolha uma nota de 1 a 5 estrelas.";
            erroEl.hidden = false;
            return;
        }

        // FormData em vez de JSON: precisa levar os arquivos (se houver)
        // junto com nota/comentário no mesmo POST multipart. Não define
        // Content-Type manualmente — o navegador monta o header com o
        // boundary certo sozinho; fixar "multipart/form-data" na mão
        // quebra o parsing porque falta o boundary.
        const dadosForm = new FormData(form);
        dadosForm.set("nota", String(nota));

        // Cada slot preenchido vira um campo "fotos" (mesmo nome
        // repetido — é assim que multer.array("fotos", 3) espera
        // receber múltiplos arquivos, ver receberFotosOpcionais em
        // avaliacoes.js). Slots vazios simplesmente não entram no
        // FormData, não manda posição "em branco" nenhuma. Recomprime
        // cada arquivo antes de mandar (ver comprimirImagemParaUpload) —
        // evita "Failed to fetch" por estourar o limite de corpo da
        // requisição da Vercel com foto de celular sem compressão. Se a
        // compressão de alguma falhar (ex: HEIC do iPhone que o
        // Canvas/Image do navegador não decodifica), manda o arquivo
        // original em vez de bloquear o envio inteiro — o backend
        // (sharp) tem mais chance de dar conta do formato do que travar
        // a pessoa aqui.
        for (const slot of slotsFoto) {
            const arquivo = slot.obterArquivo();
            if (!arquivo) continue;

            try {
                const fotoComprimida = await comprimirImagemParaUpload(arquivo);
                dadosForm.append("fotos", fotoComprimida, "foto.jpg");
            } catch (erro) {
                console.warn("Não foi possível comprimir uma foto no navegador, enviando original:", erro);
                dadosForm.append("fotos", arquivo);
            }
        }

        botao.disabled = true;
        botao.textContent = "Enviando...";

        try {
            const resp = await fetch(`${API_BASE}/prestadores/${prestador.id}/avaliacoes`, {
                method: "POST",
                headers: cabecalhosAuth(),
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
    overlay.appendChild(await carregarTemplateHTML("05-perfil-prestador.tpl", "tpl-perfil-prestador"));

    const slot = nomeSlot => overlay.querySelector(`[data-slot="${nomeSlot}"]`);


    const coverEl = slot("cover");
    const closeBtnCover = coverEl.querySelector(".ProviderProfileClose");
    if (prestador.capaTipo === "video") {
        const video = document.createElement("video");
        video.className = "ProviderProfileCoverVideo";
        video.src = fotoCapaVideoPrestador(prestador.id);
        video.muted = true;
        video.loop = true;
        video.autoplay = true;
        video.playsInline = true;
        coverEl.insertBefore(video, closeBtnCover);
    } else {
        fotosCapaPrestador(prestador.id).forEach((src, indice) => {
            const img = document.createElement("img");
            img.className = `ProviderProfileCoverImg${indice === 0 ? " is-active" : ""}`;
            img.src = src;
            img.alt = `Foto do local de ${prestador.nome}`;
            img.onerror = () => { img.onerror = null; removerSlideCapa(img); };
            coverEl.insertBefore(img, closeBtnCover);
        });
    }

    slot("avatar").outerHTML = avatarHTML(prestador, "ProviderProfileAvatar");
    slot("nome").innerHTML = `${prestador.nome}${seloDocumentoHTML(prestador)}`;
    slot("categoria").textContent = prestador.categoria;

    const ratingEl = slot("rating");
    ratingEl.className = `ProviderProfileRating${nota.temNota ? "" : " is-empty"}`;
    ratingEl.innerHTML = `${nota.estrelas}${nota.temNota ? ` <span>(${nota.contagem})</span>` : ""}`;

    slot("status").innerHTML = badgeHorarioHTML(prestador);

    const bioEl = slot("bio");
    bioEl.className = `ProviderProfileBio${prestador.descricao ? "" : " is-empty"}`;
    bioEl.innerHTML = prestador.descricao
        ? renderBioMarkdown(prestador.descricao)
        : escapeHTML("Este prestador ainda não escreveu uma descrição.");

    slot("avaliacao").innerHTML = avaliacao ? `
        <div class="ProviderProfileReview">
            <div class="ProviderProfileReviewHeader">
                ${avatarClienteHTML(avaliacao.nome, avaliacao.avatarUrl, "ProviderProfileReviewAvatar", avaliacao.usuarioId, avaliacao.avatarCustomizado)}
                <div>
                    <div class="ProviderProfileReviewName">${avaliacao.nome}</div>
                    <div class="ProviderProfileReviewStars">${"★".repeat(avaliacao.nota)}${"☆".repeat(5 - avaliacao.nota)}</div>
                </div>
            </div>
            <div class="ProviderProfileReviewText">"${avaliacao.comentario}"</div>
        </div>
    ` : `<div class="ProviderProfileReviewEmpty">Esse prestador ainda não recebeu avaliações.</div>`;

    slot("galeria").innerHTML = fotos.length > 0 ? `
        <div class="ProviderProfileGallery">
            ${fotos.map(grupo => `
                <button type="button" class="ProviderProfileGalleryItem">
                    <img src="${grupo.fotos[0]}" alt="Foto de serviço enviada por ${grupo.autor}"
                        onerror="this.onerror=null; this.src='${CAPA_PLACEHOLDER}';">
                    ${grupo.fotos.length > 1 ? `<span class="ProviderProfileGalleryCount">+${grupo.fotos.length}</span>` : ""}
                    <span class="ProviderProfileGalleryCaption">${grupo.autor}</span>
                </button>
            `).join("")}
        </div>
    ` : `<div class="ProviderProfileGalleryEmpty">Nenhuma foto de cliente ainda — a primeira avaliação com foto aparece aqui.</div>`;

    slot("whatsapp").href = linkWhatsapp(prestador);
    slot("whatsapp-texto").textContent = `Chamar ${prestador.nome.split(" ")[0]} no WhatsApp`;

    const salvo = prestadorEstaSalvo(prestador.id);
    const salvarBtn = overlay.querySelector('[data-action="salvar-lista"]');
    salvarBtn.classList.toggle("is-saved", salvo);
    slot("salvar-label").textContent = salvo ? "Salvo" : "Salvar na lista";


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

    // Lista GLOBAL e contínua, achatada a partir dos grupos por
    // avaliação — as fotos da mesma avaliação ficam seguidas (mesma
    // legenda repetida nelas), mas arrastar na última foto de uma
    // avaliação continua pra primeira foto da PRÓXIMA, sem travar dentro
    // do grupo. `indiceInicioGrupo[i]` guarda em que posição dessa lista
    // achatada o grupo `i` começa, pra cada tile da galeria abrir o
    // lightbox já na foto certa (não sempre em 0).
    const slidesGaleria = [];
    const indiceInicioGrupo = [];
    fotos.forEach(grupo => {
        indiceInicioGrupo.push(slidesGaleria.length);
        grupo.fotos.forEach(src => {
            slidesGaleria.push({ src, autor: grupo.autor, comentario: grupo.comentario, nota: grupo.nota });
        });
    });

    overlay.querySelectorAll(".ProviderProfileGalleryItem").forEach((item, indice) => {
        item.addEventListener("click", () => {
            abrirLightbox(slidesGaleria, indiceInicioGrupo[indice]);
        });
    });

    document.body.appendChild(overlay);
    perfilOverlayEl = overlay;
    registrarAberturaOverlay(fecharPerfilPrestador);
    if (prestador.capaTipo !== "video") {
        iniciarRotacaoCapa(overlay.querySelector(".ProviderProfileCover"));
    }
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
            <circle cx="${CENTRO_X}" cy="${CENTRO_Y}" r="9" fill="#4285F4" stroke="#ffffff" stroke-width="3" />
        </svg>
    `;

    userLocationMarker = new google.maps.marker.AdvancedMarkerElement({
        map,
        position: posicao,
        title: "Sua localização",
        content: wrapper,
        zIndex: 999,
        gmpClickable: false
    });
}

function criarOuAtualizarMarcadorUsuario(latitude, longitude) {
    const posicao = { lat: latitude, lng: longitude };

    // Guarda a posição real mais recente do usuário — é essa que vai
    // ser usada como referência de distância na busca, não o centro do mapa.
    usuarioLat = latitude;
    usuarioLng = longitude;

    criarMarcadorUsuarioSeNecessario(posicao);
    userLocationMarker.position = posicao;

    if (!mapaCentralizadoNoUsuario) {
        map.panTo(posicao);
        map.setZoom(16);
        mapaCentralizadoNoUsuario = true;
    }
}

/* ---- Bússola do dispositivo (fallback pra quando o usuário está parado,
   já que position.coords.heading só vem preenchido em movimento) ---- */

function iniciarRastreioLocalizacao() {
    if (!navigator.geolocation) {
        console.warn("Geolocalização não é suportada neste navegador.");
        return;
    }

    watchId = navigator.geolocation.watchPosition(
        (position) => {
            criarOuAtualizarMarcadorUsuario(
                position.coords.latitude,
                position.coords.longitude
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

/* Escolhe um avatar-placeholder ilustrado de forma determinística a partir
   de QUALQUER id (conta de usuário, prestador demo etc.) — o mesmo id
   sempre cai no mesmo desenho, então a pessoa não vê o avatar "pulando"
   entre pin do mapa, popup, lista, perfil público e "Meu perfil"/
   "Preferências da conta". Puxado sempre que não existe foto nenhuma pra
   mostrar (nem Google, nem upload próprio) — a maioria das contas Google
   não vem com payload.picture preenchido, então esse é o caminho comum,
   não uma exceção rara. */
function placeholderAvatarPara(id) {
    const hash = String(id || "")
        .split("")
        .reduce((acc, char) => acc + char.charCodeAt(0), 0);

    return AVATAR_PLACEHOLDER[hash % AVATAR_PLACEHOLDER.length];
}

/* Marcador em formato de avatar (substitui o PinElement padrão do Google).
   Reaproveita o fallback de avatarHTML(): tenta a foto de perfil, e se
   der 404 mostra a inicial da categoria sobre a cor do prestador — igual
   já acontece no popup e na lista. Círculo + "rabinho" triangular embaixo
   em fluxo normal (sem position:absolute) de propósito: o
   AdvancedMarkerElement ancora pelo centro-inferior da caixa do content,
   então a ponta do rabinho já cai exatamente sobre a coordenada real. */
function placeholderAvatar(prestador) {
    // Prestador com dono: usa a identidade da CONTA, não do prestador —
    // assim os até 3 prestadores de uma mesma conta (e "Meu perfil"/
    // "Preferências da conta" dela) mostram sempre o mesmo desenho, em vez
    // de um sorteio diferente por cadastro. Só cai no id do próprio
    // prestador pros 6 demos, que não têm conta nenhuma por trás.
    return placeholderAvatarPara(prestador.donoUsuarioId || prestador.id);
}

function criarConteudoAvatarMarcador(prestador) {
    const avatarUrl = avatarUrlEfetivo(prestador.donoUsuarioId, prestador.avatarUrl, prestador.avatarCustomizado);
    const wrapper = document.createElement("div");
    wrapper.className = "AvatarPin";
    wrapper.innerHTML = `
        <div class="AvatarPinCircle" style="background-color:${prestador.cor};">
            <span class="AvatarPinInitial" >${prestador.categoria.charAt(0)}</span>
            <img
                src="${avatarUrl || placeholderAvatar(prestador)}"
                alt=""
                referrerpolicy="no-referrer"
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
    const painel = document.getElementById("resultsList");
    const container = document.getElementById("resultsListScroll");
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

    painel.hidden = false;
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
    const painel = document.getElementById("resultsList");
    const container = document.getElementById("resultsListScroll");
    container.innerHTML = "";

    if (resultados.length === 0) {
        painel.hidden = false;
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
            <div class="ResultTopSection">
                ${avatarHTML(prestador, "ResultAvatar")}
                <div class="ResultInfo">
                    <div class="ResultTopRow">
                        <div class="ResultName">${prestador.nome}${seloDocumentoHTML(prestador)}</div>
                        <div class="ResultDistance">${formatarDistancia(distancia)}</div>
                    </div>
                    <div class="ResultMeta">
                        <span>${prestador.categoria}</span>
                        <span class="ResultRating${nota.temNota ? "" : " is-empty"}">${nota.estrelas}</span>
                        ${nota.temNota ? `<span>(${nota.contagem})</span>` : ""}
                    </div>
                </div>
            </div>
            <div class="ResultStatusRow">${badgeHorarioHTML(prestador)}</div>
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

    painel.hidden = false;
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
            headers: cabecalhosAuth()
        });
        if (!resp.ok) throw new Error(`GET /usuarios/${usuarioId}/salvos respondeu ${resp.status}`);

        salvos = (await resp.json()).map(mapearPrestadorDoBackend);
        idsSalvosSet = new Set(salvos.map(p => String(p.id))); // realinha o cache com a fonte de verdade
    } catch (erro) {
        console.warn("Não foi possível carregar a lista de salvos:", erro);
        container.innerHTML = `<div class="CadastroHint">Não foi possível carregar seus contatos salvos agora. Tente reabrir esta aba.</div>`;
        return;
    }

    if (salvos.length === 0) {
        container.innerHTML = `
            <div class="ResultsEmpty">
                <svg class="ResultsEmptyIcon" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                    <path d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1Z"
                        stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                </svg>
                <div class="ResultsEmptyText">Você ainda não salvou nenhum contato.</div>
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
                    <div class="ResultName">${prestador.nome}${seloDocumentoHTML(prestador)}</div>
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

    const encontrados = PRESTADORES.filter(prestador => {
        if (filtroAbertoAgora && !estaAberto(prestador)) return false;

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