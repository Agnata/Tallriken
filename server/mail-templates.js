// Plain-text and HTML versions of every e-mail the app sends.
const esc = s => String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

function layout(title, body) {
  return `<!doctype html><html lang="sv"><body style="margin:0;background:#F5F7F3;padding:24px 12px;font-family:Figtree,system-ui,-apple-system,'Segoe UI',sans-serif;color:#1B2421">
<div style="max-width:560px;margin:0 auto;background:#FFFFFF;border:1px solid #DDE3DE;border-radius:18px;padding:28px 24px">
<p style="margin:0 0 4px;font-size:13px;letter-spacing:.12em;text-transform:uppercase;color:#5E6B66">Tallriken</p>
<h1 style="margin:0 0 18px;font-weight:700;font-size:28px;line-height:1.15;color:#1F4A3E">${esc(title)}</h1>
${body}
</div>
</body></html>`;
}
const button = (href, label) =>
  `<p style="margin:22px 0"><a href="${esc(href)}" style="background:#1F4A3E;color:#fff;text-decoration:none;padding:12px 20px;border-radius:12px;display:inline-block;font-weight:600">${esc(label)}</a></p>`;
const p = s => `<p style="margin:0 0 12px;font-size:16px;line-height:1.5">${s}</p>`;

export function inviteMail({ name, link, invitedBy }) {
  return {
    subject: "Välkommen till Tallriken",
    text: `Hej ${name}!\n\n${invitedBy} har bjudit in dig till Tallriken, för poäng, rörelse och vikt.\n\nVälj ditt lösenord här (länken gäller i 7 dagar):\n${link}\n`,
    html: layout(`Välkommen, ${name}`,
      p(`${esc(invitedBy)} har bjudit in dig till Tallriken, för poäng, rörelse och vikt.`) +
      p("Välj ett lösenord för att komma igång. Länken gäller i 7 dagar.") + button(link, "Välj lösenord")),
  };
}

export function resetMail({ name, link }) {
  return {
    subject: "Nytt lösenord till Tallriken",
    text: `Hej ${name}!\n\nNågon bad om ett nytt lösenord för ditt konto. Välj ett nytt här (länken gäller i 2 timmar):\n${link}\n\nOm det inte var du kan du strunta i det här mejlet.\n`,
    html: layout("Nytt lösenord",
      p(`Hej ${esc(name)}! Någon bad om ett nytt lösenord för ditt konto. Länken gäller i 2 timmar.`) +
      button(link, "Välj nytt lösenord") + p("Om det inte var du kan du strunta i det här mejlet.")),
  };
}
