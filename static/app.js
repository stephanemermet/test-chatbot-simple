const chat = document.getElementById("chat");
const form = document.getElementById("form");
const input = document.getElementById("input");
const send = document.getElementById("send");
const empty = document.getElementById("empty");
let history = [];
let busy = false;

fetch("/api/health").then(r => r.json()).then(h => {
  document.getElementById("model").textContent = h.model + (h.configured ? "" : " · clé manquante");
}).catch(() => {});

// Rendu minimal et sûr : on échappe tout, puis on met en forme ``` et `code`.
function render(text) {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return esc
    .replace(/```(?:\w+)?\n?([\s\S]*?)```/g, (_, c) => `<pre><code>${c}</code></pre>`)
    .replace(/`([^`\n]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*\n]+)\*\*/g, "<strong>$1</strong>");
}

function addMessage(role, text = "") {
  empty.style.display = "none";
  const el = document.createElement("div");
  el.className = `msg ${role}`;
  el.innerHTML = render(text);
  chat.appendChild(el);
  chat.scrollTop = chat.scrollHeight;
  return el;
}

async function ask(text) {
  history.push({ role: "user", content: text });
  addMessage("user", text);
  const bubble = addMessage("bot");
  bubble.classList.add("typing");
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
    history.push({ role: "assistant", content: answer });
  } catch (err) {
    history.pop(); // on retire la question restée sans réponse
    bubble.classList.add("error");
    bubble.textContent = err.message;
  } finally {
    bubble.classList.remove("typing");
  }
}

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = input.value.trim();
  if (!text || busy) return;
  busy = true; send.disabled = true;
  input.value = ""; input.style.height = "auto";
  await ask(text);
  busy = false; send.disabled = false; input.focus();
});

input.addEventListener("keydown", (e) => {
  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); form.requestSubmit(); }
});
input.addEventListener("input", () => {
  input.style.height = "auto";
  input.style.height = Math.min(input.scrollHeight, 160) + "px";
});
document.getElementById("reset").addEventListener("click", () => {
  history = [];
  chat.querySelectorAll(".msg").forEach(m => m.remove());
  empty.style.display = "";
});
