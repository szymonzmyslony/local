# Przewodnik: odpowiedzi agenta Zine

## Gdzie zmieniać zachowanie

- `src/prompts.ts` — wspólny prompt i osobne instrukcje dla Web/WhatsApp.
- `src/tools.ts` — opisy i schematy narzędzi wyszukujących galerie i wydarzenia.
- `src/server.ts` — model, limit kroków, recovery i konfiguracja kanału WhatsApp.
- `src/components/messages/` — prezentacja tekstu i wyników narzędzi w przeglądarce.

Nie dodawaj własnego formatowania ani wywołań Meta Graph API. Oficjalny adapter
`@chat-adapter/whatsapp` konwertuje Markdown do składni WhatsApp, dzieli długie
odpowiedzi, obsługuje typing/read receipts i weryfikuje webhook.

## Format WhatsApp

Adapter obsługuje między innymi:

- `*tekst*` — pogrubienie
- `_tekst_` — kursywa
- `~tekst~` — przekreślenie
- `` `tekst` `` — kod

Instrukcje dotyczące długości, tonu i układu wydarzeń są w
`getZineSystemPrompt("whatsapp")` w `src/prompts.ts`.

## Testowanie zmian

```bash
cd apps/app
bun run test
bun run typecheck
bun run dev
```

Przetestuj co najmniej:

1. Pytanie o wydarzenia po polsku i po angielsku.
2. Pytanie o galerię z dzielnicą lub preferowanym klimatem.
3. Wynik bez dopasowań.
4. Wiadomość WhatsApp i interaktywną odpowiedź.
5. Podpis webhooka błędny lub brakujący — żądanie powinno zostać odrzucone.
