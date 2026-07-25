# Backend do REFLEXO/Mase

Node + Express + SQLite (`better-sqlite3`). Login com Google (OAuth) —
sem senha própria pra criar ou vazar.

## Rodando

```bash
cd backend
npm install
npm start          # ou: npm run dev (reinicia sozinho ao salvar)
```

Sobe em `http://localhost:3000`. Na primeira execução cria `data/mase.db` e
semeia os 6 prestadores de demonstração (mesmos ids `1`–`6` que o
`script.js` já usa, pra não quebrar nada que dependa desses ids). Reiniciar
o servidor não duplica nem reseta o que já foi cadastrado de verdade por
cima disso.

**Se você já tinha um `data/mase.db` de antes desta mudança** (schema
antigo, telefone como identidade): apague a pasta `data/` e deixe subir de
novo — o schema mudou (usuários agora têm `email`/`google_sub`, telefone
virou opcional) e não é dado de produção ainda, então recriar é mais
simples que migrar.

## Configurando o login com Google (obrigatório antes de testar)

1. Acesse https://console.cloud.google.com/apis/credentials (crie um
   projeto novo se não tiver um).
2. Configure a "tela de consentimento OAuth" (tipo Externo, só precisa do
   nome do app e seu e-mail — não precisa publicar, funciona em modo de
   teste com as contas Google que você adicionar como testador).
3. Crie uma credencial: **Create Credentials → OAuth client ID → tipo
   "Web application"**. Em "Authorized JavaScript origins", adicione a
   URL de onde o front vai ser servido (ex: `http://localhost:5500`, ou o
   que você estiver usando pra abrir o `index.html`).
4. Copie o Client ID gerado (termina em `.apps.googleusercontent.com`) e
   coloque em **dois lugares**, que precisam ser exatamente o mesmo valor:
   - Backend: `.env` → `GOOGLE_CLIENT_ID=...`
   - Front: `script.js` → constante `GOOGLE_CLIENT_ID` (perto do topo,
     junto de `API_BASE`)

Sem isso, `POST /usuarios/entrar-google` responde 500 (client id ausente
no servidor) e o botão do Google no front nem aparece direito.

**Importante — isso só funciona como site normal.** O Google recusa OAuth
dentro de WebView embutida (bloqueio deles, desde 2016) — então isso não
vai funcionar se o `index.html` for aberto de dentro do app Android via
`WebView`. Pra quando o REFLEXO virar app de novo, a tela de login
precisa abrir numa Custom Tab do Chrome (ou usar o SDK nativo do Google),
não dentro da WebView — é mudança do lado do app Android, não deste
backend.

## Como a identidade funciona agora

1. O front carrega o botão "Sign in with Google" (Google Identity
   Services). A pessoa escolhe a conta Google dela.
2. O Google devolve um **ID token** (JWT assinado por eles) direto pro
   navegador — o front nunca vê senha nenhuma.
3. Front manda esse token pro backend: `POST /api/usuarios/entrar-google
   { credential }`.
4. O servidor confere a **assinatura** do token com o próprio Google
   (`verifyIdToken`) — um token forjado não passa. Cria (ou recupera) o
   usuário por `google_sub` e devolve `{ id, nome, email, telefone }`.
5. Cliente guarda esse `id` e manda em toda request seguinte que precisa
   de identidade, no header:

   ```
   x-usuario-id: <id retornado>
   ```

A criação da conta agora é real (verificada pelo Google) — mas a
**sessão** em si ainda é simples: esse id não expira nem gira sozinho, é
um bearer id "eterno" guardado no `localStorage` do cliente. Quem
descobrir o id de outra pessoa (vazamento, XSS) ainda consegue se passar
por ela nas chamadas à API. Evoluir isso é trocar esse id por um token de
sessão de curta duração (JWT assinado pelo servidor, com expiração) — a
parte de criar a conta com Google não muda.

## Endpoints

| Rota | O que faz | Substitui no `script.js` |
|---|---|---|
| `POST /api/usuarios/entrar-google` `{credential}` | login com Google (verifica o token, upsert por `google_sub`) | botão "Sign in with Google" |
| `GET /api/usuarios/:id` | perfil | `perfilUsuarioCache` |
| `PATCH /api/usuarios/:id` | editar nome | `abrirEditarPerfil` |
| `GET /api/prestadores` | lista todos (com nota calculada) | array `PRESTADORES` |
| `GET /api/prestadores/:id` | um prestador | `PRESTADORES.find(...)` |
| `GET /api/prestadores/meus` | cadastrados por mim | `renderizarMeusCadastros` |
| `POST /api/prestadores` | cadastrar | `salvarPrestadorCadastrado` |
| `DELETE /api/prestadores/:id` | remover (só o dono) | `removerPrestadorCadastrado` |
| `GET /api/usuarios/:id/salvos` | lista salvos | `carregarIdsSalvos` |
| `POST /api/usuarios/:id/salvos/:prestadorId` | salvar | `alternarPrestadorSalvo` (parte "salvar") |
| `DELETE /api/usuarios/:id/salvos/:prestadorId` | remover salvo | `alternarPrestadorSalvo` (parte "remover") |
| `POST /api/prestadores/:id/avaliacoes` | cliente avalia (nasce pendente) | `abrirAvaliarPrestador` (submit) |
| `GET /api/prestadores/:id/avaliacoes/pendentes` | fila cega (só dono) | `renderizarAvaliacoesPendentes` |
| `POST /api/avaliacoes/:id/aceitar` | dono publica | botão "Aceitar" |
| `POST /api/avaliacoes/:id/rejeitar` `{motivo}` | dono rejeita | botão "Rejeitar" |
| `GET /api/prestadores/:id/avaliacoes/ultima` | última review real publicada | `avaliacaoParaExibir` |
| `POST /api/prestadores/:id/whatsapp-clique` | registra clique (sem exigir login) | `registrarCliqueWhatsapp` |

`nota` já vem embutida em todo objeto de prestador: `{ quantidade, media }`,
`media: null` quando `quantidade` é 0 — usado por `textoNotaPrestador()`
no front pra mostrar "Nenhuma avaliação" em vez de um número inventado.

**`CHAVE_CONFIG_APP` não tem endpoint** — tema, notificação, raio de busca
são preferência de aparelho, não faz sentido morar no servidor. Continua
100% `localStorage`.

## Segurança — o que este backend já resolve e o que ainda não

- **Identidade da conta é real** — verificada pelo Google, não mais um
  telefone auto-declarado. Ver ressalva sobre a sessão em si, acima.
- **Sanitiza** `nome`, `categoria`, `comentario` e `autorNome` antes de
  gravar (`utils/sanitizar.js`) — remove tags HTML. Isso é defesa no
  servidor; **não substitui** escapar no front na hora de montar
  `innerHTML` (os ~20 pontos sem escape que já identificamos continuam
  precisando de correção lá).
- **Posse checada de verdade**: remover prestador, decidir avaliação
  pendente e mexer em salvos exigem que o `x-usuario-id` bata com o dono.
- **Job de expiração real** (`jobs/expirarAvaliacoes.js`): roda a cada
  hora no servidor, publica pendente vencida sem depender de alguém abrir
  a tela.
- **Não resolvido ainda**: sessão com expiração/rotação (ver acima), rate
  limiting (nada impede spam de avaliações ou cadastros), upload de foto
  (capa/perfil/serviço continuam sendo arquivo estático em
  `/mase/img/...` — não tem endpoint de upload).

