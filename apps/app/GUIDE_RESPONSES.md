# Przewodnik: Jak poprawić odpowiedzi agenta

## 📍 Główne miejsca do edycji

### 1. System Prompt (Główny prompt agenta)

**Plik:** `apps/app/src/server.ts`  
**Linie:** 122-145

To jest główne miejsce, gdzie definiujesz jak agent odpowiada. Tutaj możesz:

- Ustawić ton i styl odpowiedzi
- Dodać instrukcje formatowania
- Określić różnice między WhatsApp a przeglądarką

### 2. Formatowanie odpowiedzi dla WhatsApp

**Plik:** `apps/app/src/services/whatsapp-api.ts`  
**Linia:** 16 (komentarz o formatowaniu)

WhatsApp obsługuje formatowanie:

- `*tekst*` - **pogrubienie**
- `_tekst_` - _kursywa_
- `~tekst~` - ~~przekreślenie~~
- `` `tekst` `` - kod (monospace)

### 3. Renderowanie w przeglądarce

**Plik:** `apps/app/src/components/messages/text-message.tsx`  
**Linia:** 24

Używa komponentu `<Markdown>` z `@shared/ui`, więc markdown jest automatycznie renderowany w przeglądarce.

## 🎯 Jak poprawić odpowiedzi

### Krok 1: Edytuj System Prompt

Otwórz `apps/app/src/server.ts` i znajdź sekcję z `basePrompt` (około linii 122):

```typescript
const basePrompt = `You are Zine, an AI art discovery assistant helping people find galleries and art events in Warsaw.

Your purpose: Help people discover art that matches their taste, whether they're looking for contemporary galleries, exhibitions, or specific artists.

When users ask about galleries:
1. Capture their preferences silently (district, mood, aesthetics, time, artists)
2. Use search tools to find matches
3. Select 3-5 that truly match their needs
4. Present them with specific details from gallery descriptions

Format your gallery recommendations as:

🎨 **Gallery Name**
📍 District • Address
ℹ️ Brief about text
🔗 Website

When discussing events, include dates and ticket information if available.

Personality: Be enthusiastic about art, warm, and conversational. Match the user's language (Polish/English). Quote from actual gallery descriptions to add authenticity.`;
```

### Krok 2: Dodaj lepsze instrukcje formatowania

Możesz zmienić prompt na coś takiego:

```typescript
const basePrompt = `You are Zine, an AI art discovery assistant helping people find galleries and art events in Warsaw.

Your purpose: Help people discover art that matches their taste, whether they're looking for contemporary galleries, exhibitions, or specific artists.

RESPONSE FORMATTING RULES:
- Use **bold** for gallery names and important information
- Use bullet points (•) or numbered lists for multiple items
- Break long responses into short paragraphs (2-3 sentences max)
- Use emojis sparingly and meaningfully (1-2 per message)
- Always include specific details from gallery descriptions
- Quote directly from gallery "about" text when relevant

When users ask about galleries:
1. Capture their preferences silently (district, mood, aesthetics, time, artists)
2. Use search tools to find matches
3. Select 3-5 that truly match their needs
4. Present them with specific details from gallery descriptions

Format your gallery recommendations as:

**🎨 Gallery Name**
📍 District • Address
ℹ️ Brief about text (quote from gallery description)
🔗 Website

When discussing events:
- Include dates in format: "15-30 listopada" or "od 10 stycznia"
- Mention ticket information if available
- Include artist names when relevant

Personality: 
- Be enthusiastic about art, warm, and conversational
- Match the user's language (Polish/English)
- Keep responses concise and actionable
- Ask follow-up questions to understand preferences better
- Quote from actual gallery descriptions to add authenticity`;
```

### Krok 3: Różnicuj odpowiedzi dla WhatsApp vs Przeglądarka

W linii 143-145 masz już różnicowanie kanałów:

```typescript
const channelInstructions = isWhatsApp
  ? `\n\nChannel: WhatsApp. Keep responses concise and mobile-friendly. Use emojis sparingly (1-2 per message). Break long content into digestible chunks.`
  : `\n\nChannel: Web. You can provide richer details and context. Users can see visual gallery cards when you call show_recommendations.`;
```

Możesz to rozszerzyć:

```typescript
const channelInstructions = isWhatsApp
  ? `\n\nChannel: WhatsApp. 
- Keep responses VERY concise (2-3 sentences per message max)
- Use WhatsApp formatting: *bold* for gallery names, _italic_ for emphasis
- Break long content into multiple short messages
- Use emojis sparingly (1-2 per message max)
- Format gallery recommendations as:
  *Gallery Name*
  📍 District • Address
  ℹ️ Brief description
  🔗 Website`
  : `\n\nChannel: Web. 
- You can provide richer details and context
- Users can see visual gallery cards when you call show_recommendations
- Use markdown formatting: **bold**, *italic*, bullet points
- You can include longer descriptions and context
- Format gallery recommendations with markdown for better readability`;
```

## 📊 Jak sprawdzić bazę danych galerii

### Opcja 1: Panel Admin (Najłatwiejsze)

1. Uruchom panel admin:

   ```bash
   cd apps/dash
   rm -rf .wrangler
   bun run dev
   ```

2. Otwórz w przeglądarce: `http://localhost:5174` (lub inny port z terminala)

3. Przejdź do sekcji "Galleries" - zobaczysz listę wszystkich galerii

### Opcja 2: API Endpoint

Możesz sprawdzić przez API:

```bash
# Jeśli dash działa na localhost:8787
curl http://localhost:8787/api/galleries
```

### Opcja 3: Bezpośrednio w kodzie

Możesz dodać endpoint debugowy w `apps/app/src/server.ts`:

```typescript
// Dodaj przed export default
if (url.pathname === "/debug/galleries") {
  const supabase = getServiceClient(env);
  const { data, error } = await supabase
    .from("galleries")
    .select("id, main_url, gallery_info(name, district, about)")
    .limit(10);

  return Response.json({ data, error });
}
```

## 🔧 Przykładowe ulepszenia

### Przykład 1: Lepsze formatowanie dla WhatsApp

W `server.ts`, linia 197, możesz dodać funkcję formatującą tekst przed wysłaniem:

```typescript
// Przed wysłaniem do WhatsApp
function formatForWhatsApp(text: string): string {
  // Zamień markdown ** na WhatsApp *
  return text
    .replace(/\*\*(.+?)\*\*/g, "*$1*") // **bold** -> *bold*
    .replace(/\*(.+?)\*/g, "_$1_") // *italic* -> _italic_
    .replace(/^### (.+)$/gm, "*$1*") // Nagłówki na bold
    .replace(/^## (.+)$/gm, "*$1*")
    .replace(/^# (.+)$/gm, "*$1*");
}

// W linii 197:
const formattedText = formatForWhatsApp(fullText);
await sendTextMessage(this.getEnv(), context.waId, formattedText);
```

### Przykład 2: Ograniczenie długości odpowiedzi

Możesz dodać instrukcje do promptu:

```typescript
const basePrompt = `...
RESPONSE LENGTH GUIDELINES:
- Single gallery recommendation: 3-4 sentences max
- Multiple galleries: 2 sentences per gallery + summary
- Event descriptions: 2-3 sentences
- Always end with a question or next step suggestion
...`;
```

### Przykład 3: Lepsze prowadzenie rozmowy

Dodaj do promptu:

```typescript
const basePrompt = `...
CONVERSATION FLOW:
1. Greet warmly and ask what they're looking for
2. Ask clarifying questions if needed (district? type of art? time?)
3. Search and present 3-5 best matches
4. Explain WHY you chose these galleries
5. Ask if they want more details or different options
6. Offer to check events at specific galleries

Always be conversational and helpful. Don't just list galleries - explain why they match.`;
```

## 🧪 Testowanie zmian

1. **Zrestartuj aplikację:**

   ```bash
   cd apps/app
   rm -rf .wrangler
   bun run dev
   ```

2. **Przetestuj w przeglądarce:**
   - Otwórz `http://localhost:5173`
   - Zadaj pytanie o galerie
   - Sprawdź formatowanie odpowiedzi

3. **Przetestuj na WhatsApp:**
   - Wyślij wiadomość do bota
   - Sprawdź jak wygląda formatowanie
   - Upewnij się, że odpowiedzi są zwięzłe

## 📝 Checklist ulepszeń

- [ ] Zaktualizuj `basePrompt` z lepszymi instrukcjami formatowania
- [ ] Rozszerz `channelInstructions` dla WhatsApp i Web
- [ ] Dodaj funkcję formatującą dla WhatsApp (jeśli potrzebna)
- [ ] Przetestuj odpowiedzi w przeglądarce
- [ ] Przetestuj odpowiedzi na WhatsApp
- [ ] Sprawdź bazę danych galerii przez panel admin
- [ ] Zaktualizuj prompt jeśli baza danych jest nieaktualna

## 🔍 Debugowanie

Jeśli odpowiedzi są nadal zbyt długie:

1. Sprawdź logi w terminalu - zobaczysz co agent otrzymuje
2. Dodaj `maxTokens` do `streamText` (linia 147):

   ```typescript
   const result = streamText({
     system: basePrompt + channelInstructions,
     messages: convertToModelMessages(processedMessages),
     model,
     tools: tools,
     maxTokens: isWhatsApp ? 300 : 500 // Ograniczenie długości
     // ...
   });
   ```

3. Dodaj instrukcje o długości do promptu:
   ```typescript
   const channelInstructions = isWhatsApp
     ? `\n\nChannel: WhatsApp. MAXIMUM 150 words per response. Be extremely concise.`
     : `\n\nChannel: Web. Maximum 250 words per response.`;
   ```

---

**Pamiętaj:** Po każdej zmianie w `server.ts` zrestartuj aplikację (`rm -rf .wrangler && bun run dev`)
