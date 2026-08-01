<!--
  Diferente do template de cadastro, este é bem mais orientado a dados: quase
  todo bloco tem algo específico do prestador (nome, nota, fotos, whatsapp,
  estado "salvo"). Os pontos marcados com data-slot="..." são preenchidos
  pelo JS logo depois de clonar o template — ver 00-script.js.
-->
<template id="tpl-perfil-prestador">
    <!-- Botão de fechar é IRMÃO do wrapper que rola, não filho dele — de
         propósito. .ProviderProfile (o elemento pai deste template) tem
         backdrop-filter, que faz qualquer position:fixed dentro dele virar
         na prática um position:absolute relativo A ELE MESMO (é assim que
         a spec de CSS define containing block pra filter/backdrop-filter/
         transform em ancestrais). Se o scroll também estivesse no mesmo
         nível do botão, ele rolaria junto com o resto — foi exatamente o
         bug relatado. Agora quem rola é só o .ProviderProfileScroll logo
         abaixo; o botão, sendo irmão dele (fora da área que rola), fica
         sempre no mesmo lugar visualmente — mesmo efeito de "fixo",
         mesmo sem depender de position:fixed pra isso (ver
         .ProviderProfileClose em style.css: position:absolute agora). -->
    <button type="button" class="ProviderProfileClose" aria-label="Fechar perfil">
        <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" stroke-width="2"
                stroke-linecap="round" stroke-linejoin="round"></path>
        </svg>
    </button>
    <div class="ProviderProfileScroll">
        <div class="ProviderProfileCover" data-slot="cover">
            <!-- as <img> de capa são inseridas aqui via JS (fotosCapaPrestador) -->
        </div>
        <div class="ProviderProfileBody">
            <div class="ProviderProfileHeader">
                <div data-slot="avatar"></div>
                <div>
                    <div class="ProviderProfileName" data-slot="nome"></div>
                    <div class="ProviderProfileCategory" data-slot="categoria"></div>
                </div>
            </div>
            <div class="ProviderProfileRating" data-slot="rating"></div>
            <div class="ProviderProfileStatusRow" data-slot="status"></div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Sobre</div>
                <div class="ProviderProfileBio" data-slot="bio" maxlength="1000"></div>
            </div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Última avaliação</div>
                <div data-slot="avaliacao"></div>
            </div>
            <div class="ProviderProfileSection">
                <div class="ProviderProfileSectionTitle">Fotos dos clientes</div>
                <div data-slot="galeria"></div>
            </div>
            <a class="ProviderProfileWhatsapp" target="_blank" rel="noopener noreferrer" data-slot="whatsapp">
                <svg viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
                    <path d="M12 2C6.48 2 2 6.48 2 12c0 1.85.5 3.58 1.35 5.07L2 22l5.06-1.33A9.94 9.94 0 0 0 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2Zm0 18a7.9 7.9 0 0 1-4.03-1.1l-.29-.17-3 .79.8-2.93-.19-.3A7.93 7.93 0 1 1 12 20Zm4.4-5.6c-.24-.12-1.42-.7-1.64-.78-.22-.08-.38-.12-.54.12-.16.24-.62.78-.76.94-.14.16-.28.18-.52.06-.24-.12-1-.37-1.9-1.17-.7-.62-1.18-1.39-1.32-1.63-.14-.24-.02-.37.1-.49.11-.11.24-.28.36-.42.12-.14.16-.24.24-.4.08-.16.04-.3-.02-.42-.06-.12-.54-1.3-.74-1.78-.2-.47-.4-.4-.54-.4h-.46c-.16 0-.42.06-.64.3-.22.24-.84.82-.84 2 0 1.18.86 2.32.98 2.48.12.16 1.7 2.6 4.12 3.64.58.25 1.03.4 1.38.51.58.18 1.1.16 1.52.1.46-.07 1.42-.58 1.62-1.14.2-.56.2-1.04.14-1.14-.06-.1-.22-.16-.46-.28Z"></path>
                </svg>
                <span data-slot="whatsapp-texto"></span>
            </a>
            <div class="ProviderProfileSecondaryActions">
                <button type="button" class="ProviderProfileSecondaryBtn" data-action="salvar-lista">
                    <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path class="SaveIconShape" d="M6 3.5h12a1 1 0 0 1 1 1V21l-7-4.2L5 21V4.5a1 1 0 0 1 1-1Z"
                            stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"></path>
                    </svg>
                    <span class="ProviderProfileSecondaryBtnLabel" data-slot="salvar-label"></span>
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
    </div>
</template>
