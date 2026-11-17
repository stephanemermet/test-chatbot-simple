const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const welcome = document.getElementById("welcome");
let history = [];
let busy = false;

fetch("/api/health").then(r => r.json()).then(h => {
  document.getElementById("model").textContent = h.configured ? h.model : "clé API manquante";
  if (!h.configured) document.querySelector(".pulse").classList.add("off");
}).catch(() => {
  document.getElementById("model").textContent = "hors ligne";
  document.querySelector(".pulse").classList.add("off");
});

const esc = s => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

function inline(s) {
  return esc(s)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

// Rendu Markdown minimal et sûr (tout est échappé avant mise en forme).
function render(text) {
  const parts = text.split(/```/);
  return parts.map((part, i) => {
    if (i % 2 === 1) { // bloc de code (éventuellement non terminé pendant le streaming)
      const nl = part.indexOf("\n");
      const lang = nl > -1 ? part.slice(0, nl).trim() : "";
      const code = nl > -1 ? part.slice(nl + 1) : part;
      return `<div class="codeblock"><div class="codehead"><span>${esc(lang) || "code"}</span>` +
             `<button class="copy" type="button">Copier</button></div><pre><code>${esc(code)}</code></pre></div>`;
    }
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of part.split("\n")) {
      let m;
      if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== "ul") { close(); out.push("<ul>"); list = "ul"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== "ol") { close(); out.push("<ol>"); list = "ol"; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^#{1,4}\s+(.*)/))) { close(); out.push(`<h3>${inline(m[1])}</h3>`); }
      else if (line.trim()) { close(); out.push(`<p>${inline(line)}</p>`); }
      else close();
    }
    close();
    return out.join("");
  }).join("");
}

function addRow(role, text = "") {
  welcome.style.display = "none";
  const row = document.createElement("div");
  row.className = `row ${role}`;
  row.innerHTML = `<div class="avatar">${role === "user" ? "Moi" : "AI"}</div><div class="msg"></div>`;
  const msg = row.querySelector(".msg");
  if (role === "user") msg.textContent = text; else msg.innerHTML = text;
  chat.appendChild(row);
  chat.scrollTop = chat.scrollHeight;
  return msg;
}

async function ask(text) {
  history.push({ role: "user", content: text });
  addRow("user", text);
  const bubble = addRow("bot", '<span class="dots"><i></i><i></i><i></i></span>');
  let answer = "";
  try {
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: history }),
    });
    if (!res.ok) throw new Error((await res.json()).error || `Erreur ${res.status}`);
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        try {
          answer += JSON.parse(data).choices[0].delta.content || "";
          bubble.innerHTML = render(answer);
          chat.scrollTop = chat.scrollHeight;
        } catch {}
      }
    }
    if (!answer) throw new Error("Réponse vide du modèle.");
    history.push({ role: "assistant", content: answer });
  } catch (err) {
    history.pop();
    bubble.parentElement.classList.replace("bot", "error");
    bubble.textContent = err.message;
  }
}

async function submit(text) {
  text = text.trim();
  if (!text || busy) return;
  busy = true; send.disabled = true;
  input.value = ""; input.style.height = "auto";
  await ask(text);
  busy = false; send.disabled = false; input.focus();
}

form.addEventListener("submit", e => { e.preventDefault(); submit(input.value); });
input.addEventListener("keydown", e => {
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); form.requestSubmit(); }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 180) + "px";
});
document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => submit(c.textContent)));
document.getElementById("reset").addEventListener("click", () => {
  history = [];
  chat.querySelectorAll(".row").forEach(r => r.remove());
  welcome.style.display = "";
});
chat.addEventListener("click", e => {
  const btn = e.target.closest(".copy");
  if (!btn) return;
  navigator.clipboard.writeText(btn.closest(".codeblock").querySelector("code").textContent).then(() => {
    btn.textContent = "Copié ✓"; setTimeout(() => (btn.textContent = "Copier"), 1500);
  });
});
