// fetch wrapper for the JSON API; throws Error with the server's message.
export async function api(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : {},
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401 && !path.startsWith("/api/login")) {
    location.href = `/login?next=${encodeURIComponent(location.pathname)}`;
    throw new Error("Du behöver logga in.");
  }
  if (res.status === 204) return null;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Fel ${res.status}`);
  return data;
}

// Top bar for signed-in pages: brand, page links (Admin only for admins) and log out.
export function renderNav(user, active) {
  const nav = document.getElementById("nav");
  const links = [["/app", "Tallriken"], ["/konto", "Konto"], ...(user?.is_admin ? [["/admin", "Admin"]] : [])];
  nav.innerHTML = `<a class="brand" href="/app">Tallriken</a>
    <span class="who">${links.map(([href, label]) =>
      `<a href="${href}"${href === active ? ' aria-current="page"' : ""}>${label}</a>`).join("")}
      <button type="button" class="linkbtn" id="logout">Logga ut</button></span>`;
  document.getElementById("logout").onclick = async () => {
    await api("/api/logout", { method: "POST", body: {} }).catch(() => {});
    location.href = "/";
  };
}

let toastTimer;
export function toast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("on"), 2800);
}
