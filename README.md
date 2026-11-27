# Lectiomizer

En udvidelse til Firefox og Chrome, der giver dig et hurtigt og moderne Lectio. Den
ændrer ikke udseendet på Lectios egne sider. Den åbner sin **egen app** i en fane og
henter dit skema, dine opgaver, beskeder, karakterer og dit fravær fra Lectio med
det login, du allerede har.

- **Overblik**: det nuværende eller næste modul med nedtælling, dagens moduler, kommende afleveringer, de nyeste beskeder og aktuelt.
- **Skema**: en ugekalender med farver pr. fag, ændrede og aflyste moduler og en levende "nu"-linje. På mobil vises en dagsoversigt.
- **Opgaver**: opgaver delt op i kommende, manglende og afleverede, med aflevering, upload og grupper på opgavesiden.
- **Beskeder**: en indbakke som i et mailprogram, samtaletråde, svar og nye beskeder.
- **Spørgeskemaer**: besvar de spørgeskemaer, du får tilsendt (ét valg, flere valg og fritekst), gem en kladde eller aflever. Resultater og oprettelse af dine egne spørgeskemaer åbner i Lectio.
- **Karakterer**, **Fravær** og **Lektion** (lektionsnoter, lektier og materialer).
- **Skolen**: find elever, lærere, hold og lokaler og se deres skema. Under **Hold** ligger alle skolens hold sorteret efter fag, og hvert hold viser sit ugeskema og holdets lærere og elever.
- **Elevfeedback**: på et moduls Elevfeedback-fane kan du læse, hvad læreren og dine klassekammerater har skrevet, og skrive dit eget svar i en editor med overskrifter, fed/kursiv/gennemstreget, sænket/hævet skrift, tekst- og markeringsfarver, justering, lister, indrykning, citater, links, tabeller, billeder og vedhæftede filer (også ved at indsætte eller trække dem ind). Den viser det, når elevfeedback ikke er åben eller kun kan læses på et modul.
- **Notifikationer**: Lectiomizer tjekker Lectio i baggrunden (som standard hver time, ned til hvert 3. minut) og giver besked om ændrede, aflyste, fjernede eller genoprettede moduler, nye beskeder og svar samt nye opgaver. Du får en notifikation i browseren og et tal på ikonet i værktøjslinjen, og historikken ligger under klokken i appen.
- **Assistent** (valgfri): spørg om dit skema, dine opgaver (og deres opgavebeskrivelser), moduler, beskeder, karakterer og fravær. Den svarer med dit eget ChatGPT-abonnement (Log ind med ChatGPT) og kan kun læse.
- **MCP-server** (valgfri): brug de samme skrivebeskyttede Lectio-værktøjer fra Claude, Cursor eller en anden MCP-klient.
- **Google Kalender** (valgfri): kopierer dit skema over i en separat "Lectio"-kalender i Google Kalender og holder den opdateret ved hvert tjek.
- `⌘K` / `Ctrl+K`-søgning, tastaturgenveje `1`–`6` samt lyst, mørkt og systemtema.

Intet sendes andre steder hen end til lectio.dk, Google Kalender når du har forbundet den, OpenAI når du spørger
Assistenten om noget, og en lokal MCP-klient når du slår den til. Handlinger i Lectio (afsendelse, upload,
aflevering) udføres ved at indsende Lectios egne formularer.

## Kom i gang

Klik på knappen i værktøjslinjen for at åbne Lectiomizer, vælg din skole, og log ind
på Lectio i den fane, der åbner. Du kommer automatisk tilbage til appen bagefter.

## Udvikling

```bash
npm install
npm run dev:app        # appen på http://localhost:5199 med data fra fixtures/ (intet login nødvendigt)
node scripts/gen-fixtures.mjs   # (gen)opret syntetiske fixture-sider
npm run dev            # WXT-udviklingstilstand i Chrome (hot reload)
npm run dev:firefox    # WXT-udviklingstilstand i Firefox
npm test               # vitest
npm run typecheck
```

## Byg og installér

```bash
npm run build           # Chrome  → .output/chrome-mv3
npm run build:firefox   # Firefox → .output/firefox-mv2
npm run zip / zip:firefox
```

- **Chrome**: `chrome://extensions` → slå Udviklertilstand til → *Indlæs upakket* → `.output/chrome-mv3`.
- **Firefox**: `about:debugging#/runtime/this-firefox` → *Indlæs midlertidig tilføjelse* → `.output/firefox-mv2/manifest.json`.

## Udgivelse

Udgivelser bygges lokalt og offentliggøres på [GitHub Releases](https://github.com/Turtlezztz/lectiomizer-extension/releases).
Elever henter Firefox- og Chrome-versionen derfra; Chrome-versionen ligger også i Chrome Web Store.

1. Læg dine API-nøgler til addons.mozilla.org ([hent dem her](https://addons.mozilla.org/developers/addon/api/key/)) i `.env`:
   `AMO_JWT_ISSUER=user:…` og `AMO_JWT_SECRET=…`. Tilføj eventuelt `CHROME_WEB_STORE_URL=…` for at linke til butikssiden i udgivelsesnoterne.
2. Hæv `version` i `package.json`, commit det (`Release x.y.z`), og kør så:

```bash
npm run release              # typecheck, test, byg, signér Firefox, tag vX.Y.Z, udgiv
npm run release -- --draft   # gem udgivelsen som kladde, så du kan rette noterne først
npm run release -- --xpi signed.xpi   # brug en XPI, du allerede har signeret, i stedet for at signere igen
```

Firefox-versionen signeres på AMO som en *unlisted* (selvdistribueret) version, fordi Firefox kun installerer
signerede tilføjelser. Udgivelsen får den signerede `.xpi`, Chrome-`.zip`'en, kildekode-zip'en og `updates.json`,
som Firefox-manifestets `update_url` læser, så installerede kopier opdaterer sig selv.

## Notifikationer

Tjekkene kører i baggrunden, mens browseren er åben, også når Lectiomizer-fanen er
lukket. I Chrome bliver siderne fortolket i et offscreen-dokument; i Firefox i
baggrundssiden. Det første tjek gemmer et stille udgangspunkt; derefter meldes
kun ændringer. Moduler, der er overstået, og opgaver, der allerede er afleveret
eller har passeret fristen, giver ingen besked. Historikken (de seneste 100
notifikationer fra de sidste 90 dage) og øjebliksbillederne gemmes lokalt for
hver elev. Hvis din Lectio-session udløber, viser klokken en "log ind"-besked,
og tjekkene fortsætter, når du har logget ind igen.

## Google Kalender

Login med Google kræver et OAuth-klient-id, der tilhører dig selv. **Indstillinger →
Google Kalender** guider dig igennem det og viser den omdirigeringsadresse, du skal kopiere:

1. Opret et projekt i [Google Cloud Console](https://console.cloud.google.com/), og aktivér **Google Calendar API**.
2. Under **Google Auth Platform** sætter du samtykkeskærmen op som **External**, lader den blive i **Testing**, tilføjer dig selv som testbruger og tilføjer scopet `https://www.googleapis.com/auth/calendar.app.created`.
3. Opret en OAuth-klient af typen **Web application**, og tilføj omdirigeringsadressen fra Indstillinger som autoriseret redirect-URI. Den er forskellig i Chrome (`https://<extension-id>.chromiumapp.org/`) og Firefox (`https://<hash>.extensions.allizom.org/`).
4. Indsæt klient-id'et i Indstillinger, og tryk på **Forbind Google Kalender**. I Firefox skal du tillade at sende webstedsindhold, når du bliver spurgt.

Du kan også bage et klient-id ind i buildet med `WXT_GOOGLE_CLIENT_ID=…` i `.env`.

Lectiomizer kan kun se og ændre den kalender, den selv opretter. Google-tokenet
gemmes kun i sessionslageret. **Afbryd** tilbagekalder det; "Lectio"-kalenderen
bliver liggende i Google og genbruges, hvis du forbinder igen.

## Assistent

Åbn **Assistent** i sidebjælken (eller tryk `0`), og vælg **Fortsæt med ChatGPT**. Lectiomizer beder om
tilladelse til at kontakte OpenAI og åbner derefter ChatGPT's login. Svarene bruger dit eget ChatGPT-abonnement;
der skal ingen API-nøgle til. Hvis login-fanen ender på en `127.0.0.1`-side, der ikke kan nås, så indsæt
adressen i feltet under knappen.

Assistenten læser Lectio med særlige, skrivebeskyttede værktøjer (se `src/lib/agent/tool-specs.js`):
`get_overview`, `get_schedule`, `list_assignments`, `get_assignment`, `get_lesson`, `list_messages`,
`read_message`, `get_grades`, `get_absence`, `read_document` og, som nødløsning, `read_page`.
Samtaler gemmes i browseren uden indholdet af det, der blev læst.

## MCP-server

`mcp/server.mjs` gør de samme værktøjer tilgængelige for MCP-klienter (Claude Desktop, Claude Code, Cursor, …).
Browseren holder Lectio-sessionen: serveren lytter på `127.0.0.1:47123`, og udvidelsen spørger den om
værktøjskald, så serveren aldrig ser en adgangskode eller cookie. Kræver Node 18+ og har ingen afhængigheder.

1. I Lectiomizer: **Indstillinger → MCP-server → Tillad MCP-klienter**. Kopiér den nøgle, der vises.
2. Tilføj serveren til din klient med nøglen i `LECTIOMIZER_TOKEN`:

   ```bash
   claude mcp add lectio -e LECTIOMIZER_TOKEN=lx_… -- node /sti/til/lectiomizer/mcp/server.mjs
   ```

   ```json
   { "mcpServers": { "lectio": { "command": "node", "args": ["/sti/til/lectiomizer/mcp/server.mjs"], "env": { "LECTIOMIZER_TOKEN": "lx_…" } } } }
   ```

Browseren skal være åben med Lectiomizer installeret og logget ind på Lectio. Udvidelsen leder efter
serveren én gang i minuttet og med det samme, mens der er forbindelse. Flere klienter kan køre hver deres
kopi på samme tid: den første får porten, og de andre sender videre til den. Sæt `LECTIOMIZER_PORT` (og den
samme port i Indstillinger), hvis 47123 er optaget.

Se [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for, hvordan det hele hænger sammen.
