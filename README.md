# Tallriken

Poäng, rörelse och vikt på **https://tallriken.parnes.com**: artefakten Tallriken som en egen app på servern, med inloggning och en egen dagbok per användare. Upplägget är detsamma som för Vinkällaren (vin.parnes.com).

- **Appen** är artefakten: Idag (poäng, måltider, smakbitar, rörelse, vatten, mående), Vikt (kurva och kroppsmått), Hälsa (träningsmål, hemmapass, dagsljus), Framsteg (veckosummering, delmål, märken) och Inställningar
- **Lagring på servern** i stället för i artefakten: varje användares dagbok är ett JSON-dokument i SQLite, med versionsnummer så att två enheter inte skriver över varandra
- **Withings-våg:** varje användare kan koppla sin våg, och vikten kommer in automatiskt när hen väger sig
- **Kopia:** ladda ned dagboken som JSON och läs in en kopia, till exempel det du loggat i artefakten
- **Node 24 / Express** bakom **Apache**, **SQLite** via `node:sqlite`, inga native-beroenden
- **Inloggning** med e-post och lösenord, "Glömt lösenord", **tvåstegsverifiering** (TOTP med reservkoder, krävs för administratörer)
- **Admin:** bjud in och hantera användare, driftstatus, backuper och återställning. Ingen ser någon annans dagbok.
- **Backup** varje natt inuti tjänsten, extern kopia med rsync, `/api/health`

## Kör lokalt

```bash
npm install
npm run add-user -- du@exempel.se "Ditt namn" --admin   # frågar efter lösenord
npm run dev                                             # http://127.0.0.1:3000
npm test
```

## Installera och uppgradera på servern

```bash
cd /home/parnes/work/Tallriken
git pull
./deploy/install.sh --check
sudo ./deploy/install.sh
```

Allt om drift finns i **[docs/drift.md](docs/drift.md)**: sökvägar, miljöfil, systemd, Apache, backup, extern kopia, health, rollback, hur data flyttas från artefakten och vad som ska verifieras på servern.

## Struktur

```
server/    app.js (routes), auth.js, totp.js, twofactor.js, db.js (schema), backups.js, health.js,
           scheduler.js, mailer.js, mail-templates.js, clock.js, config.js, withings.js, routes/ (data, account, admin, withings)
public/    index.html (framsida), app.html (appen), login.html, losenord.html, konto.html, admin.html,
           css/ (app.css från artefakten, style.css), js/ (app.js, logic.js, …)
scripts/   add-user.js, reset-2fa.js, backup.js
deploy/    install.sh, systemd- och Apache-mallar, offsite-skript, env-mall
test/      api.test.js (server), logic.test.js (beräkningar), static.test.js (CSP och referenser),
           withings.test.js (mot ett låtsas-Withings)
docs/      drift.md
```
