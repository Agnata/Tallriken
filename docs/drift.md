# Drift och installation: Tallriken

Tallriken körs på samma server som LB3 och Vinkällaren och följer samma upplägg:
- rootägd kod i `/opt`, data i `/var/lib` och konfiguration i `/etc`
- en Node-tjänst under systemd bakom Apache
- backup inuti tjänsten och extern kopia med rsync
- ett installationsskript med `--check`

Sökvägarna nedan är standardvärdena i `deploy/install.sh`. De har ännu inte verifierats mot den körande servern (se avsnitt 14).

## 1. Övergripande arkitektur

| | |
|---|---|
| Publik adress | https://tallriken.parnes.com/ (framsida), `/app` (appen, kräver inloggning) |
| Admin | https://tallriken.parnes.com/admin (administratör med tvåstegsverifiering) |
| Trafikflöde | Besökare → Apache/HTTPS → proxy till Node för **alla** sökvägar |

**Apache**
- Avslutar HTTPS i en egen vhost för `tallriken.parnes.com`.
- Proxyar allt till Node via en genererad include. Ingen DocumentRoot med appfiler, inget frontendbygge.
- Sätter HSTS.

**Backend**
- Node 24 (`/usr/local/bin/node`), minst 22.13 eftersom `node:sqlite` används.
- Express. Startpunkten är `server/app.js`.
- Lyssnar på `127.0.0.1:3105`. LB3 har 3103 och Vinkällaren 3104.
- SQLite i WAL-läge via `node:sqlite`, inga native-beroenden.
- Sätter själv CSP (inga inline-skript), `Cache-Control: no-store` för API och inloggade sidor, och övriga säkerhetsheaders (helmet).

**Frontend**
- Vanlig HTML, CSS och JavaScript i `public/`. Appen (`app.html`, `css/app.css`, `js/app.js`) är artefakten Tallriken, med lagringen bytt från artefaktens databas till serverns API. Beräkningarna ligger i `js/logic.js` och testas i `test/logic.test.js`.

**Data**
- Varje användare har en egen dagbok: ett JSON-dokument i tabellen `user_data`, samma form som artefakten sparade (dagar, vikt, mått, inställningar, recept …).
- `PUT /api/data` skickar med versionen dokumentet byggde på. Har en annan enhet sparat emellan svarar servern 409 med den senaste versionen, och appen visar den. Inget skrivs över i tysthet.
- Appen har en cache i `localStorage` per användare. En ändring som inte hann sparas (till exempel utan nät) skickas nästa gång, om ingen annan enhet har sparat emellan.
- Ingen, inte heller administratörer, kan se någon annans dagbok i appen.

**Schemalagt i tjänsten** (kontrolleras varje minut, ingen cron behövs): backup varje natt från kl. 03 svensk tid, och en gång i timmen hämtning från Withings för den som inte fått nya vikter på 6 timmar.

## 2. Viktiga sökvägar

| Vad | Sökväg |
|---|---|
| Utvecklings-/deploycheckout | `/home/parnes/work/Tallriken` |
| Bygganvändare | `parnes` |
| Node / npm | `/usr/local/bin/node`, `/usr/local/bin/npm` |
| Installerad applikation | `/opt/tallriken/app` (arbetskatalog för tjänsten) |
| Installerad commit | `/opt/tallriken/app/REVISION` |
| Tidigare versioner | `/opt/tallriken/app.previous.<UTC-tid>` (de 5 senaste sparas) |
| Miljökonfiguration | `/etc/tallriken.env` |
| Datakatalog | `/var/lib/tallriken` |
| Databas | `/var/lib/tallriken/tallriken.db` (+ `-wal`, `-shm`) |
| Applikationsbackuper | `/var/lib/tallriken/backups/` |
| HTTP-vhost (port 80) | `/etc/apache2/sites-available/tallriken.parnes.com.conf` |
| HTTPS-vhost | `/etc/apache2/sites-available/tallriken.parnes.com-le-ssl.conf` (skapas av certbot) |
| Genererad Apache-include | `/etc/apache2/tallriken-proxy.conf` |
| systemd-tjänst | `/etc/systemd/system/tallriken.service` |
| Extern backup | `/etc/systemd/system/tallriken-backup-offsite.{service,timer}` |
| Installationsbackup av konfiguration | `/var/backups/tallriken/install-<UTC-tid>/` |

## 3. Miljöfil och konfiguration

systemd läser `/etc/tallriken.env`, ägd av `root:root` med rättigheterna `0600`, utanför Git och appkatalogen. Mallen finns i `deploy/tallriken.env.example`.

Grundinställningar (skrivs av installern):

```
NODE_ENV=production
HOST=127.0.0.1
PORT=3105
PUBLIC_ORIGIN=https://tallriken.parnes.com
DB_PATH=/var/lib/tallriken/tallriken.db
COOKIE_SECURE=true
BACKUP_OFFSITE_TARGET=
```

`PUBLIC_ORIGIN` ska vara exakt origin (`https://`, ingen avslutande snedstreck). Den används för origin-kontrollen av alla skrivande API-anrop (CSRF-skydd) och för länkarna i e-post. Ändringar kräver `sudo systemctl restart tallriken`.

| Nyckel | Standard | |
|---|---|---|
| `MAIL_FROM` | `"Tallriken <tallriken@parnes.com>"` | Avsändare |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS` | tomt, 587 | Tomt `SMTP_HOST` = inga mejl (de loggas, och Admin visar länkarna). Lokal postfix: `127.0.0.1` och port `25`. |
| `SMTP_SECURE` | `false` | `true` för port 465 |
| `SESSION_DAYS` | `30` | Sessionslängd |
| `BACKUP_KEEP` | `30` | Antal lokala backuper |
| `WITHINGS_CLIENT_ID`, `WITHINGS_CLIENT_SECRET` | tomt | Withings-vågen (avsnitt 9). Tomt = av. |

E-post används bara till inbjudningar och "Glömt lösenord". Använd SMTP, inte `/usr/sbin/sendmail`: tjänstens sandbox hindrar skrivning till Postfix-kön.

## 4. systemd-tjänsten

Mallen är `deploy/tallriken.service`. Tjänsteanvändaren `tallriken` är ett systemkonto med hemkatalogen `/var/lib/tallriken` och skalet `/usr/sbin/nologin`. Sandbox: `NoNewPrivileges`, `PrivateTmp`, `ProtectSystem=strict`, `ProtectHome`, skrivbart bara i `/var/lib/tallriken`.

```bash
sudo systemctl status tallriken --no-pager
sudo systemctl restart tallriken
sudo journalctl -u tallriken -n 100 --no-pager
```

## 5. Apache

- `deploy/apache.conf` blir `/etc/apache2/tallriken-proxy.conf` och inkluderas i HTTPS-vhosten med `IncludeOptional /etc/apache2/tallriken-proxy.conf`.
- `deploy/apache-http.conf` blir port 80-vhosten, men bara om ingen HTTPS-vhost finns. Därefter körs `certbot --apache -d tallriken.parnes.com --redirect` (ange gärna `CERTBOT_EMAIL=…`, eller `--no-certbot` för att avbryta med instruktioner).
- Moduler: `proxy`, `proxy_http`, `headers`, `ssl`. Installern aktiverar dem vid behov.
- **Adressen i `<VirtualHost …>` måste vara samma som de andra sajternas** (på servern `192.168.2.80`). Installern läser den ur `apache2ctl -S` (`VHOST_ADDR`, överstyrbar) och kontrollerar efter omladdningen att rätt certifikat kommer tillbaka för `tallriken.parnes.com`. Se Vinkällarens `docs/drift.md` avsnitt 5 för bakgrunden.

## 6. Installation och uppgradering

Skalet på servern är tcsh. Kör kommandona i `bash` om du använder `2>&1` och liknande.

```bash
cd /home/parnes/work
git clone https://github.com/Agnata/Tallriken.git   # första gången
cd Tallriken
git pull
./deploy/install.sh --check
sudo ./deploy/install.sh
```

| Flagga | |
|---|---|
| `--check` | Kontrollerar förutsättningarna och avslutar. Kräver inte sudo. |
| `--create-admin` | Skapar en administratör även om det redan finns en (interaktivt). |
| `--skip-tests` | Hoppar över testerna. |
| `--no-certbot` | Kör aldrig certbot. |

Installern gör, i ordning:

1. **Kontroller:** `PUBLIC_ORIGIN`, port, sökvägar, repot, Node (minst 22.13), bygganvändaren, systemkommandon, att porten är ledig, HTTPS-vhost eller certbot, rsync om extern backup är på.
2. **Beroenden och tester:** `npm ci --omit=dev --ignore-scripts` och `npm test` som `parnes`.
3. **Backup av konfiguration** till `/var/backups/tallriken/install-<tid>/`.
4. **Tjänsteanvändare och datakatalog** (`/var/lib/tallriken` `0750`, `backups/` `0700`).
5. **Applikationen:** kopieras till `/opt/tallriken/app.staging-<tid>`, görs rootägd, provladdas, och byter sedan plats med `app` (föregående blir `app.previous.<tid>`).
6. **Miljöfilen:** hanterade nycklar skrivs om, övriga `KEY=value` bevaras, kommentarer tas bort. `root:root 0600`.
7. **Databasen:** skapas tom vid första starten. Finns ingen administratör frågar installern efter e-post, namn och lösenord (minst 12 tecken).
8. **systemd:** units skrivs, tjänsten aktiveras, offsite-timern slås på eller av.
9. **Apache:** moduler, proxy-include, vid behov port 80-vhost och certbot, `IncludeOptional` och `configtest`. Misslyckas configtest återställs filerna.
10. **Start:** tjänsten startas om och installern väntar på `http://127.0.0.1:3105/api/public`. Svarar den inte laddas Apache **inte** om.
11. **Apache** laddas om och `https://tallriken.parnes.com/api/health` kontrolleras.

Variabler som kan anges: `REPO_DIR`, `NODE_BIN`, `NPM_BIN`, `BUILD_USER`, `PUBLIC_ORIGIN`, `PORT`, `INSTALL_ROOT`, `ENV_FILE`, `UNIT_FILE`, `OFFSITE_UNIT`, `OFFSITE_TIMER`, `PROXY_FILE`, `HTTP_VHOST`, `APACHE_VHOST`, `VHOST_ADDR`, `SERVICE_USER`, `SERVICE_GROUP`, `DATA_DIR`, `DB_PATH`, `CONFIG_BACKUP_ROOT`, `KEEP_PREVIOUS`, `CERTBOT_EMAIL`, `BACKUP_OFFSITE_TARGET`.

## 7. Användare och inloggning

- Första administratören skapas av installern. Övriga bjuds in från sidan Admin (länken gäller 7 dagar) och får en tom dagbok.
- Sessionerna lagras hashade i databasen och gäller i `SESSION_DAYS` dagar. Lösenordsbyte loggar ut andra sessioner.
- Tvåstegsverifiering (TOTP med 10 reservkoder) kan slås på av alla under Konto och krävs för Admin. En länk för nytt lösenord kringgår aldrig tvåsteg.
- Tas en användare bort raderas också personens dagbok. Den finns kvar i backuperna.

Stänga av tvåsteg för någon som är utelåst, eller sätta ett nytt lösenord från kommandoraden:

```bash
cd /opt/tallriken/app && sudo runuser -u tallriken -- env DB_PATH=/var/lib/tallriken/tallriken.db \
  /usr/local/bin/node --disable-warning=ExperimentalWarning scripts/reset-2fa.js namn@exempel.se
cd /opt/tallriken/app && sudo runuser -u tallriken -- env DB_PATH=/var/lib/tallriken/tallriken.db \
  /usr/local/bin/node --disable-warning=ExperimentalWarning scripts/add-user.js namn@exempel.se "Namn" [--admin]
```

## 8. Flytta in data från artefakten

Artefakten sparade dagboken i Claudes artefaktdatabas och i webbläsarens `localStorage`, som servern inte kommer åt. Så här flyttas den:

1. Ta fram dagboken som en JSON-fil (samma objekt som artefakten sparade, med bland annat `settings` och `days`).
2. Logga in på https://tallriken.parnes.com, gå till Inställningar → Kopia av dagboken → **Läs in kopia** och välj filen.

Samma knapp läser in filer från **Ladda ned kopia**.

## 9. Withings-våg

Varje användare kan koppla sin Withings-våg under Inställningar. Vikten hamnar då under Vikt när personen väger sig.

**Så fungerar det**
- "Koppla Withings" skickar webbläsaren till Withings, där personen godkänner att Tallriken får läsa mätningar (`user.metrics`). Withings skickar tillbaka till `https://tallriken.parnes.com/withings/callback`, servern hämtar nycklar och alla tidigare vägningar och prenumererar på notiser.
- Vid varje ny vägning skickar Withings en notis till `/withings/notify?k=…`. Nyckeln `k` räknas fram från klienthemligheten, så notiser från andra ignoreras. Servern hämtar då bara det som är nytt.
- En gång i timmen hämtar tjänsten för den som inte fått något på 6 timmar, ifall en notis har tappats bort.
- Varje dag får en vikt: dagens första vägning, i svensk tid. En vikt som personen skrivit in själv ändras aldrig. Vikter från Withings är märkta "från Withings" i listan.
- Nycklarna lagras per användare i tabellen `withings` och följer med i backuperna. Åtkomstnyckeln gäller 3 timmar och förnyas automatiskt. Withings byter förnyelsenyckeln varje gång, och den nya sparas direkt. En Withings-våg kan bara vara kopplad till en användare.
- "Koppla från" avslutar notiserna och raderar nycklarna. Vikterna som redan hämtats finns kvar. Tas användaren bort försvinner kopplingen också.

**Inställning**
1. Skapa ett konto på https://developer.withings.com och en app (Public API, för personligt bruk).
2. Ange återkopplingsadressen (callback URL) `https://tallriken.parnes.com/withings/callback`.
3. Lägg in appens Client ID och Client Secret i `/etc/tallriken.env`:
   ```
   WITHINGS_CLIENT_ID=…
   WITHINGS_CLIENT_SECRET=…
   ```
   Hemligheten ska bara finnas i miljöfilen, aldrig i Git. Installern bevarar raderna.
4. `sudo systemctl restart tallriken`. Journalen visar "(Withings på)" när tjänsten startar.

**Felsökning:** ett fel från Withings visas under Inställningar ("Senaste hämtningen misslyckades …") och i journalen. Fel 401 betyder oftast att personen har tagit bort åtkomsten hos Withings. Koppla då från och koppla igen.

## 9b. Livsmedel från Livsmedelsverket och Open Food Facts

Sökningen i matrutan visar, utöver appens egen lista:
- **Livsmedelsverkets livsmedelsdatabas** (cirka 2 500 livsmedel, öppna data, källa och version anges i appen). API:et (`https://dataportal.livsmedelsverket.se/livsmedel/api/v1`) saknar textsökning, så tjänsten hämtar hela listan med energi, protein, socker och mättat fett per 100 g och sparar den i `/var/lib/tallriken/livsmedel.json`. Första gången sker det strax efter start, sedan en gång i månaden kl. 04 (högst ett försök per dygn). Hämtningen tar några minuter. Status och knappen "Hämta nu" finns under Admin → Drift.
- **Open Food Facts** för märkesvaror, sökt direkt via servern med deras söktjänst search-a-licious (`https://search.openfoodfacts.org`). Den gamla sökningen `cgi/search.pl` svarar 503 och används inte. Produkter som säljs i Sverige visas först. Saknas näringsvärden i en träff hämtas de från produkt-API:et (`https://world.openfoodfacts.org/api/v2/product/<streckkod>`). Sökningar sparas i minnet ett dygn och produkter en vecka. Fel loggas i journalen ("Open Food Facts, …") och visas i appen.

Poängen räknas med samma modell som "Egen matvara": per 100 g, eller per portion när förpackningen anger en i gram. Det man väljer sparas under ★ Mina.

| Nyckel | Standard | |
|---|---|---|
| `LIVSMEDEL_URL` | `https://dataportal.livsmedelsverket.se/livsmedel/api/v1` | Livsmedelsverkets API |
| `OFF_SEARCH_URL` | `https://search.openfoodfacts.org` | Open Food Facts söktjänst |
| `OFF_URL` | `https://world.openfoodfacts.org` | Open Food Facts produkt-API |
| `FOODS_FILE` | `$DATA_DIR/livsmedel.json` | Den hämtade listan |

Tjänsten behöver kunna nå båda adresserna utåt (HTTPS). Misslyckas hämtningen behålls den gamla listan, och felet visas under Admin.

## 10. Lokal automatisk backup

Backupen sköts inuti Node-tjänsten: direkt om ingen backup finns, därefter dagligen från kl. 03.00 Europe/Stockholm. Efter ett fel väntar den minst en timme, och felet visas på sidan Admin.

Varje backup är en katalog `backups/tallriken-YYYYMMDD-HHMMSS/` med `tallriken.db` (gjord med SQLites `VACUUM INTO`, säker under drift) och `manifest.json` (schemaversion, storlek, sha256, antal användare och dagböcker). Ofärdiga backuper heter `.partial` och listas, laddas ned och kopieras aldrig. De 30 senaste behålls.

Sidan Admin, under "Drift", visar hälsokontrollerna, backuperna med nedladdning, "Ta backup nu" och **Återställ**:
1. Administratören skriver ÅTERSTÄLL.
2. Kontrollsumman och schemaversionen kontrolleras.
3. En räddningskopia av nuläget sparas.
4. **Allas dagböcker** ersätts med backupens. Konton, sessioner och tvåsteg rörs inte. Versionsnumren räknas upp, så öppna appar hämtar den återställda dagboken i stället för att skriva över den.

## 11. Extern backup med rsync och systemd-timer

| | |
|---|---|
| Skript | `deploy/tallriken-backup-offsite.sh` |
| Tjänst / timer | `tallriken-backup-offsite.service` / `.timer` |
| Tid | 05.00 Europe/Stockholm, `RandomizedDelaySec=15min`, `Persistent=true` (LB3 04.30, Vinkällaren 04.45) |

Kopierar bara färdiga `tallriken-*`-kataloger, raderar inget hos mottagaren och skriver status till `backups/offsite.json`, som `/api/health` och Admin läser.

```bash
sudo BACKUP_OFFSITE_TARGET=backup@nas.example:/srv/tallriken ./deploy/install.sh
sudo BACKUP_OFFSITE_TARGET=/mnt/usb/tallriken ./deploy/install.sh   # lokal disk
sudo BACKUP_OFFSITE_TARGET= ./deploy/install.sh                     # stäng av

sudo install -d -o tallriken -g tallriken -m 700 /var/lib/tallriken/.ssh
sudo -u tallriken ssh-keygen -t ed25519 -N '' -f /var/lib/tallriken/.ssh/id_ed25519
sudo cat /var/lib/tallriken/.ssh/id_ed25519.pub   # lägg i mottagarens authorized_keys
```

## 12. Health endpoint och felsökning

`https://tallriken.parnes.com/api/health` svarar 200 när allt är godkänt och 503 annars: `database`, `backup` (högst 30 timmar gammal), `offsite` (lyckad inom 30 timmar, eller `"status": "off"`), `disk` (minst 500 MB ledigt).

```bash
sudo systemctl status tallriken --no-pager
sudo journalctl -u tallriken -n 100 --no-pager
sudo ss -ltnp | grep -E '310[345]'
sudo apache2ctl configtest && sudo apache2ctl -S
curl --fail --show-error http://127.0.0.1:3105/api/public
curl --show-error https://tallriken.parnes.com/api/health
cat /opt/tallriken/app/REVISION
sudo sed 's/=.*//' /etc/tallriken.env   # bara nycklarna
```

## 13. Rollback och återställning

| | |
|---|---|
| A. Applikationsversion | `/opt/tallriken/app.previous.<tid>` |
| B. Installationskonfiguration | `/var/backups/tallriken/install-<tid>/` |
| C. Data | `/var/lib/tallriken/backups/tallriken-*/` (och den externa kopian) |

```bash
# kod
sudo systemctl stop tallriken
sudo mv /opt/tallriken/app /opt/tallriken/app.broken.$(date -u +%Y%m%dT%H%M%SZ)
sudo mv /opt/tallriken/app.previous.<tid> /opt/tallriken/app
sudo systemctl start tallriken

# hela databasen, inklusive konton
sudo systemctl stop tallriken
cd /var/lib/tallriken
sudo -u tallriken mkdir -p restore-saved && sudo -u tallriken mv tallriken.db tallriken.db-wal tallriken.db-shm restore-saved/ 2>/dev/null
sudo -u tallriken sha256sum backups/tallriken-<tid>/tallriken.db   # jämför med manifest.json
sudo -u tallriken cp backups/tallriken-<tid>/tallriken.db tallriken.db
sudo systemctl start tallriken
```

Databasen migreras bara framåt (`PRAGMA user_version`, se `server/db.js`).

## 14. Verifiera på den faktiska servern

- [ ] Att port 3105 är ledig: `sudo ss -ltnp`.
- [ ] Att DNS för `tallriken.parnes.com` pekar på servern.
- [ ] Att den skapade HTTPS-vhosten heter `tallriken.parnes.com-le-ssl.conf`, annars `APACHE_VHOST=…`.
- [ ] Att `apache2ctl -S` visar `tallriken.parnes.com` på samma adress som de andra sajterna, och att LB3 och Vinkällaren är opåverkade.
- [ ] SMTP (samma som Vinkällaren?).
- [ ] Mål för extern backup (egen underkatalog) och SSH-nyckel för `tallriken`.
- [ ] Efter ett dygn: att `/api/health` svarar 200.
- [ ] Att första administratören har slagit på tvåstegsverifiering.
- [ ] Att dagboken från artefakten är inläst (avsnitt 8).
- [ ] Withings: appen registrerad med rätt återkopplingsadress, nycklarna i miljöfilen, och att en vägning dyker upp under Vikt inom någon minut.
