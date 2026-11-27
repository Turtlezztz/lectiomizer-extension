# Privatlivspolitik for Lectiomizer

*Senest opdateret: 27. november 2026*

Lectiomizer er en browserudvidelse til Chrome og Firefox, der giver elever en ny og hurtigere brugerflade
til Lectio. Denne politik beskriver, hvilke oplysninger udvidelsen læser, hvor de gemmes, og hvornår de sendes
videre.

## Kort fortalt

- **Vi har ingen server og modtager ingen data.** Lectiomizer sender aldrig dine oplysninger til os, og vi
  kan ikke se, hvad du laver i udvidelsen.
- **Ingen analyse, sporing eller reklamer.** Der er ingen statistik, crash-rapportering eller
  tredjepartssporing.
- **Alt gemmes lokalt i din browser.** Data forlader kun din computer, hvis du selv slår en funktion til, der
  kræver det (Google Kalender, Assistenten eller MCP-serveren). I så fald sendes de direkte fra din browser til
  den tjeneste, du har valgt.
- **Vi sælger eller deler aldrig data**, og de bruges ikke til andet end de funktioner, du bruger.

## Hvad Lectiomizer læser fra Lectio

Lectiomizer bruger din egen, eksisterende Lectio-session i browseren. Udvidelsen ser aldrig dit brugernavn,
din adgangskode eller dit UniLogin, og den læser eller gemmer ikke dine cookies.

For at vise dig dine sider henter udvidelsen de samme sider fra `lectio.dk`, som du selv kan åbne, bl.a.:

- skema og lektioner (tidspunkt, hold, lærer, lokale, lektier og noter)
- opgaver og afleveringer
- beskeder
- karakterer og fravær
- dokumenter og din skoles navn og nummer

Oplysningerne vises i udvidelsen, og det meste bliver ikke gemt. Undtagelserne står i næste afsnit.

## Hvad der gemmes i din browser

Lectiomizer gemmer følgende i browserens lager til udvidelser (`storage.local`):

| Data | Formål |
| --- | --- |
| Indstillinger (valgt skole, tema, fagfarver, sidebjælke) | Huske dine valg |
| Seneste kendte skema, beskeder og opgaver samt notifikationer fra de sidste 90 dage | Finde ændringer og aflysninger og give dig besked om nye beskeder og opgaver |
| Indstillinger for Google Kalender (forbundet ja/nej, din Google-e-mail, kalender-id, evt. dit eget OAuth-klient-id) | Synkronisere skemaet og forny login i baggrunden |
| ChatGPT-login (klient-id, konto-id, e-mail, id-token og refresh-token) | Holde dig logget ind i Assistenten |
| Assistent-samtaler (højst de 30 seneste) | Vise dine tidligere samtaler. Der gemmes kun det, du og assistenten skrev, og *hvilke* Lectio-sider der blev læst, ikke deres indhold |
| MCP-indstillinger (slået til/fra, port og parringsnøgle) | Forbinde til din lokale MCP-server |

Kortlivede adgangstokens til Google og ChatGPT gemmes kun i sessionslageret (`storage.session`). Det bliver
tømt, når browseren lukkes.

Alt dette bliver på din computer. Det slettes, når du afinstallerer udvidelsen. Samtaler kan du slette i
Assistenten, og forbindelser kan du afbryde i **Indstillinger**.

## Når data sendes til andre tjenester

Data sendes kun til følgende tjenester, og kun når du selv bruger funktionen.

### Google Kalender (valgfrit)

Når du forbinder Google Kalender, logger du ind direkte hos Google. Lectiomizer beder kun om to tilladelser:

- `calendar.app.created`, så udvidelsen kun kan se og ændre den kalender, den selv opretter ("Lectio"). Den
  kan ikke se dine andre kalendere.
- `email`, så udvidelsen kan vise, hvilken konto der er forbundet, og forny login uden at spørge igen.

Lektionerne i dit skema sendes til Google og gemmes i din "Lectio"-kalender. Det gælder tidspunkt, titel,
hold, lærer, lokale, lektier og noter samt om lektionen er ændret eller aflyst. Synkroniseringen kører højst
én gang i timen, og kun mens Lectio er åben, eller når du trykker på **Synkronisér nu**. Når du trykker på
**Afbryd**, tilbagekaldes adgangen hos Google. Selve kalenderen bliver liggende i din Google-konto, indtil du
sletter den.

Lectiomizers brug af oplysninger fra Google API'er overholder
[Google API Services User Data Policy](https://developers.google.com/terms/api-services-user-data-policy),
herunder kravene om begrænset brug (Limited Use). Data fra Google bruges kun til at vise og synkronisere din
kalender. De overføres ikke til andre, bruges ikke til reklamer og læses ikke af mennesker.

Googles behandling af dine data er omfattet af [Googles privatlivspolitik](https://policies.google.com/privacy).

### Assistenten med ChatGPT (valgfrit)

Assistenten virker kun, hvis du vælger **Fortsæt med ChatGPT** og logger ind med din egen OpenAI-konto.
Browseren beder dig om tilladelse, før udvidelsen kontakter OpenAI.

Når du skriver til Assistenten, sendes følgende til OpenAI:

- dine beskeder og samtalens tidligere beskeder
- dit navn, din skole og det aktuelle tidspunkt, så svarene passer til dig
- indholdet af de Lectio-sider og dokumenter, som assistenten vælger at læse for at svare. Det kan være
  skema, opgaver, beskeder, karakterer, fravær og dokumenter

Assistenten kan kun *læse* Lectio. Den kan ikke sende beskeder, aflevere opgaver eller ændre noget.
Forespørgslerne sendes med `store: false`, så OpenAI bliver bedt om ikke at gemme svarene. OpenAIs
behandling er dog omfattet af OpenAIs egne vilkår og [privatlivspolitik](https://openai.com/policies/privacy-policy).
Du kan logge ud af Assistenten igen. Så tilbagekaldes dit login hos OpenAI.

### MCP-server (valgfrit)

Hvis du slår **Tillad MCP-klienter** til, forbinder udvidelsen sig til en MCP-server, som du selv kører på
din egen computer (`127.0.0.1`). Den kan kun bruges med den parringsnøgle, du får vist. Serveren kan bruge de
samme skrivebeskyttede Lectio-værktøjer som Assistenten. Hvad der derefter sker med dataene, afhænger af den
MCP-klient, du selv har tilsluttet (fx Claude eller Cursor), og af dens vilkår.

### Andre forespørgsler

- **YouTube:** Når en lektie eller besked indeholder et YouTube-link, henter udvidelsen videoens titel og
  miniaturebillede fra YouTube uden cookies. YouTube kan se din IP-adresse og videoens id.
- **Opdateringer:** Browseren henter opdateringer fra Chrome Web Store, Firefox Add-ons eller GitHub,
  afhængigt af hvor du har installeret udvidelsen.

## Tilladelser

| Tilladelse | Hvorfor |
| --- | --- |
| `lectio.dk` | Læse dine Lectio-sider med din egen session |
| `storage` | Gemme indstillinger og data lokalt |
| `alarms` | Tjekke Lectio for ændringer med det interval, du vælger |
| `notifications` | Give dig besked om ændringer, beskeder og opgaver |
| `tabs` | Åbne Lectiomizer og Lectio-faner og finde dit login-vindue |
| `identity` | Logge ind hos Google og ChatGPT |
| `googleapis.com` | Google Kalender (kun når du har forbundet) |
| `openai.com` (valgfri) | Assistenten. Der spørges først, når du slår den til |
| `127.0.0.1` (valgfri) | MCP-serveren. Der spørges først, når du slår den til |
| `offscreen` (kun Chrome) | Køre baggrundsopgaver, som Chrome ellers ikke tillader |

I Firefox erklærer udvidelsen, at den sender *webstedsindhold* (dit skema til Google Kalender). Samtykke til
*personlig kommunikation* (Assistenten) bliver først spurgt om, når du bruger den.

## Børn og unge

Lectiomizer er lavet til gymnasieelever, og nogle brugere kan være under 18 år. Vi indsamler ingen data om
dig. Hvis du forbinder Google eller ChatGPT, gælder de tjenesters egne aldersgrænser og vilkår.

## Dine rettigheder

Vi opbevarer ingen oplysninger om dig, så vi har ikke noget at udlevere, rette eller slette. Du har selv fuld
kontrol over de lokale data:

- Slet samtaler i Assistenten.
- Afbryd Google Kalender og ChatGPT under **Indstillinger**.
- Afinstaller udvidelsen for at slette alt, den har gemt.

For data hos Google eller OpenAI skal du kontakte dem direkte.

## Ændringer

Hvis vi ændrer, hvad udvidelsen gør med dine data, opdaterer vi denne politik og datoen øverst. Større
ændringer bliver også nævnt i udgivelsesnoterne.

## Kontakt

Har du spørgsmål om privatliv, så opret en sag på
[GitHub](https://github.com/Turtlezztz/lectiomizer-extension/issues).

Lectiomizer er et uafhængigt projekt og er ikke tilknyttet eller godkendt af Lectio, Macom, Google eller
OpenAI.
