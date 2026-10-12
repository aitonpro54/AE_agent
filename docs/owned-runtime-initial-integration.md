# Initial OWNED: проверенные интеграционные границы MSI

13 октября 2026. Это evidence/план дальнейшей интеграции, не production admission.
Основной [контракт](owned-runtime-initial-contract.md) остаётся isolated offline model.

## Проверка genuine issuer

Bounded read-only исследование выполнил `ae_architect` (configured Sol 6.1/XHigh;
effective runtime model metadata не получена). Credentials/tokens не читались,
host/app-server, daemon, AE/CEP/AME jobs не запускались.

- `mcp-server/mcp-adapter.js:59`: общий token и фиксированный marker;
  initialize (176) не сохраняет principal, tools/call (199) не получает trusted context,
  forwarding (153) содержит только name/arguments.
- `mcp-server/bridge-daemon.js:9050`: token/marker и panel autonomy authority,
  без удостоверенного chat principal, per-call binding и revocation epoch.
- `mcp-server/owned-runtime-authority.js:29`: explicit_user_chat/reference — shape check.
  Private file identity не удостоверяет issuer.
- `owned-runtime-initial-model.js` определяет private readCaller с callRef, phase,
  requestHash, expectedPrincipalHash; synchronous fixture port не является host verifier.
- `owned-runtime-service.js:35/47` и `bridge-daemon.js:13106`: общий execution boolean,
  admission-dependent shutdown readiness и retained/cutover wiring. Initial reads и
  independent lifecycle потребуют отдельных проверенных точек интеграции.

Проверены установленный Desktop `OpenAI.Codex 26.1007.2314.0` и SDK
`@openai/codex-sdk 0.131.0` sibling orchestrator. Просмотренные SDK interfaces описывают
MCP events и codex exec, но не предоставляют issuer/verifier для нашего ingress.

В read-only `app.asar/.vite/build/main-BklS_2Y2.js` обработчик attestation/generate
(строка 8, offsets 62983–66200) не связывает params/challenge/chat/request digest;
Windows branch формирует error/app-signals wrapper, DeviceCheck вызывается только
Darwin/arm64. Signals (строка 494, offset 759699) — locale/timezone/display/appSessionId.
Внутренний dynamic-app-tool тракт знает host/thread/turn/call identities, но доступный
registration/verifier port для стороннего stdio MCP в исследованном коде не найден.
Внутренние поля/UUID нельзя импортировать как authority.

[Официальный App Server API](https://learn.chatgpt.com/docs/app-server) описывает
requestAttestation как upstream opaque token и clientInfo как identity интеграции.
[MCP authentication](https://developers.openai.com/plugins/build/auth) описывает проверку
issuer/audience/expiry/scopes account credentials; это само по себе не exact chat binding.
Ни просмотренные interfaces, ни эти страницы не установили необходимый verifier.
Вывод ограничен исследованными версиями и трактом, а не всеми возможными host API.

**Внешний пробел:** доступный trusted host issuer/verifier, audience AE Agent, immutable
chat/controller/per-call binding, expiry/revocation на ingress/enqueue/dispatch.
Без него initial launch/read admission закрыты. UUID/env/clientInfo/private JSON,
подпись locally supplied identity или exclusive session не заменяют требуемую гарантию.

## Следующий независимый prerequisite после GO M1–M8

Native Windows physical-root identity и held exclusive fence, без wiring в daemon:

1. Private factory задаёт root; public AE tools не принимают root/identity/handle.
2. Native reader удерживает directory HANDLE и получает canonical path + volume/file ID;
   reparse/неподдержанная identity отклоняются.
3. Exclusive kernel HANDLE фиксированного lock-file связан с physical root;
   без живого handle операции отвергаются, после reacquire старое право не используется.
4. Cross-process exclusivity, допустимый spelling alias, wrong-root и reparse refusal,
   owner exit/release проверяются на собственных temporary roots реальными Windows APIs.
5. Persistent epochs/CAS/consumption, полное namespace inventory и exact first-daemon
   held-target lifecycle остаются отдельными следующими этапами. Partial fence proof
   не представляется полным production readScope/readFence port.

Отдельный helper предпочтительнее изменения retained launcher/pins. Existing Win32
patterns в `native/ame-snapshot-service/service_win32.cpp` служат только reference.
Test helper processes не являются daemon/native AE fixtures/owned AME jobs; user assets,
transfer package, retained state и настройки не затрагиваются. Runtime outputs ignored.

## Export scope и текущие наблюдения

Пользователь уточнил: DXV, alpha, High. Локальный saved titr_all.aep имеет переданный
SHA-256 e55edfd680a6f4bad222389ffcf5b6d08a18ff4afd2a15a27f944bdcf8856754.
CognacC.ttf найден в user Fonts; это не доказательство actual AE font binding.
User EPR DXV3_titles_NQ и FHD_HQ_alfa_nosound имеют DXVTYPE 1/3 соответственно,
1920×1080, video=true/audio=false. Enum quality/alpha ещё не удостоверены через AME.
13 октября parent при двух занятых helper slots проверил official
[Resolume rendering guide](https://resolume.com/support/en/rendering-to-dxv): для AME
Format DXV3, Compression выбирает quality и alpha отдельно. Это подтверждает смысл
user request, но не mapping DXVTYPE enum и не сохранённый preset/current AME state.
Exact два варианта, actual project/media/queue и полученные видео не проверены.

## Validation

Это read-only source/file evidence, без production/live acceptance. MCP текущего чата:
owned_registration_absent, owned=false, replayAllowed=false; только local owned/usage
tools. Search solutions/project reads недоступны. Наличие AE/AME процессов не project proof.
Параметры/hashes EPR сохранены ignored в
`.codex-runtime/initial-owned-longrun-20261013/preset-file-evidence.json`.
