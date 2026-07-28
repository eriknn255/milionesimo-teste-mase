<template id="tpl-cad-prestador">
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
                    <!-- texto preenchido via JS: depende de LIMITE_PRESTADORES_POR_CONTA (constantes.js) -->
                    <div class="CadastroMeusContador" id="cadastroMeusContador"></div>
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
                <!-- texto preenchido via JS: também depende de LIMITE_PRESTADORES_POR_CONTA -->
                <div class="CadastroHint" id="cadastroLimiteHint" hidden></div>
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

                        <label class="CadastroField">
                            <span class="CadastroLabel">Descrição (opcional)</span>
                            <textarea name="descricao" class="CadastroInput CadastroTextarea" rows="4" maxlength="1000"
                                placeholder="Conte um pouco sobre seu trabalho, experiência ou diferenciais..."></textarea>
                        </label>
                        <div class="CadastroHint">Aparece na seção "Sobre" do seu perfil público — ajuda quem está decidindo se vai te chamar. Use *asterisco* pra <strong>negrito</strong> e _sublinhado_ pra <em>itálico</em>.</div>
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
                            <div class="CadastroField">
                                <span class="CadastroLabel">Abre às</span>
                                <!-- opções (48 horários) preenchidas via JS com HORARIOS_OPCOES -->
                                <div class="TimePickerField" data-campo="horarioAbre">
                                    <button type="button" class="TimePickerBtn" aria-haspopup="true" aria-expanded="false">
                                        <span class="TimePickerBtnValor">08:00</span>
                                        <svg class="TimePickerBtnChevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </button>
                                    <input type="hidden" name="horarioAbre" value="08:00">
                                    <div class="TimePickerPanel" hidden>
                                        <div class="TimePickerPanelOptions"></div>
                                    </div>
                                </div>
                            </div>
                            <div class="CadastroField">
                                <span class="CadastroLabel">Fecha às</span>
                                <div class="TimePickerField" data-campo="horarioFecha">
                                    <button type="button" class="TimePickerBtn" aria-haspopup="true" aria-expanded="false">
                                        <span class="TimePickerBtnValor">18:00</span>
                                        <svg class="TimePickerBtnChevron" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                            <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"></path>
                                        </svg>
                                    </button>
                                    <input type="hidden" name="horarioFecha" value="18:00">
                                    <div class="TimePickerPanel" hidden>
                                        <div class="TimePickerPanelOptions"></div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        <label class="CadastroField">
                            <span class="CadastroLabel">Dias de funcionamento</span>
                            <!-- chips (Dom..Sáb) preenchidos via JS com NOMES_DIAS_ABREV -->
                            <div class="CadastroDiasRow" id="cadastroDiasRow"></div>
                        </label>

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
                            <div class="CadastroMeusTitle">Capa (até 4 fotos ou 1 vídeo)</div>
                            <div class="FotosPrestadorCapaGrid" id="cadastroFotosCapaGrid">
                                <div class="FotosPrestadorCapaItem" data-indice="1">
                                    <div class="FotosPrestadorCapaTile is-empty">
                                        <label class="FotosPrestadorCapaTileLabel">
                                            <input type="file" accept="image/*,video/mp4" hidden>
                                            <img src="" alt="" hidden
                                                onerror="this.hidden=true; this.closest('.FotosPrestadorCapaTile').classList.add('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=true;"
                                                onload="this.hidden=false; this.closest('.FotosPrestadorCapaTile').classList.remove('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=false;">
                                            <!-- Preview do vídeo de capa — só este slot (o principal) aceita
                                                 vídeo; muted+loop+playsinline pro mesmo comportamento do
                                                 carrossel do perfil (ver renderização em 00-script.js). -->
                                            <video class="FotosPrestadorCapaTileVideo" muted loop playsinline autoplay hidden></video>
                                            <span class="FotosPrestadorCapaTileAdd">+</span>
                                        </label>
                                        <span class="FotosPrestadorCapaBadge">Principal</span>
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
                                <div class="FotosPrestadorCapaItem" data-indice="2">
                                    <div class="FotosPrestadorCapaTile is-empty">
                                        <label class="FotosPrestadorCapaTileLabel">
                                            <input type="file" accept="image/*" hidden>
                                            <img src="" alt="" hidden
                                                onerror="this.hidden=true; this.closest('.FotosPrestadorCapaTile').classList.add('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=true;"
                                                onload="this.hidden=false; this.closest('.FotosPrestadorCapaTile').classList.remove('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=false;">
                                            <span class="FotosPrestadorCapaTileAdd">+</span>
                                        </label>
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
                                <div class="FotosPrestadorCapaItem" data-indice="3">
                                    <div class="FotosPrestadorCapaTile is-empty">
                                        <label class="FotosPrestadorCapaTileLabel">
                                            <input type="file" accept="image/*" hidden>
                                            <img src="" alt="" hidden
                                                onerror="this.hidden=true; this.closest('.FotosPrestadorCapaTile').classList.add('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=true;"
                                                onload="this.hidden=false; this.closest('.FotosPrestadorCapaTile').classList.remove('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=false;">
                                            <span class="FotosPrestadorCapaTileAdd">+</span>
                                        </label>
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
                                <div class="FotosPrestadorCapaItem" data-indice="4">
                                    <div class="FotosPrestadorCapaTile is-empty">
                                        <label class="FotosPrestadorCapaTileLabel">
                                            <input type="file" accept="image/*" hidden>
                                            <img src="" alt="" hidden
                                                onerror="this.hidden=true; this.closest('.FotosPrestadorCapaTile').classList.add('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=true;"
                                                onload="this.hidden=false; this.closest('.FotosPrestadorCapaTile').classList.remove('is-empty'); this.closest('.FotosPrestadorCapaItem').querySelector('.FotosPrestadorCapaGrip').hidden=false;">
                                            <span class="FotosPrestadorCapaTileAdd">+</span>
                                        </label>
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
                            </div>
                            <div class="CadastroHint">A primeira é a que aparece no popup do mapa; as outras giram no carrossel do perfil. Fotos são opcionais — dá pra concluir sem nenhuma e adicionar depois em "Editar". Segure a alça (⠿) pra reordenar entre fotos já enviadas. Prefere vídeo? Envie só no slot principal (.mp4, até 60s e 70MB) — aí os outros 3 ficam desativados, é vídeo OU fotos, nunca os dois.</div>
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
</template>
