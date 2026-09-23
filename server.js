// Text Pantry - save text snippets and find them by MEANING, not just exact words.
// The AI (QVAC "embed") runs on YOUR machine. Open http://localhost:3002 after starting.

import http from "node:http";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { loadModel, embed, EMBEDDINGGEMMA_300M_Q4_0 } from "@qvac/sdk";

const PORT = 3002;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_FILE = path.join(__dirname, "data", "snippets.json");

// ---- Storage: a plain JSON file on your computer ----
let snippets = []; // { id, title, text, tag, created, embedding }

async function loadData() {
  try { snippets = JSON.parse(await readFile(DATA_FILE, "utf8")); } catch { snippets = []; }
}
async function saveData() {
  await mkdir(path.dirname(DATA_FILE), { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(snippets));
}
const publicView = (s) => ({ id: s.id, title: s.title, text: s.text, tag: s.tag, created: s.created });

// ---- Step 1: load the embedding model (downloads the first time) ----
let modelId = null;
const status = { ready: false, message: "Starting...", percent: null, error: null };

async function startModel() {
  try {
    status.message = "Loading the smart-search model (first run downloads it)...";
    modelId = await loadModel({
      modelSrc: EMBEDDINGGEMMA_300M_Q4_0,
      modelType: "embeddings",
      onProgress: (p) => {
        const value = typeof p === "number" ? p : p?.percentage;
        if (typeof value === "number") status.percent = Math.round(value);
      },
    });
    status.ready = true;
    status.message = "Smart search ready";
    console.log("Model loaded. Open http://localhost:" + PORT);
  } catch (err) {
    status.error = String(err?.message || err);
    console.error("Could not load model:", err);
  }
}

// ---- Step 2: turn text into a list of numbers (an "embedding") with QVAC ----
async function embedOne(text) {
  const out = await embed({ modelId, text: [text.slice(0, 1500)] });
  const emb = out.embedding ?? out;
  return Array.isArray(emb[0]) ? emb[0] : emb;
}
const snippetText = (s) => `${s.title}. ${s.tag}. ${s.text}`;

// How similar are two embeddings? 1 = same meaning, 0 = unrelated.
function cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] ** 2; nb += b[i] ** 2; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
}

// ---- Step 3: search = meaning score + a small bonus for exact word matches ----
async function search(query) {
  const q = query.trim().toLowerCase();
  if (!q) return [...snippets].reverse().map(publicView); // newest first

  let queryVec = null;
  if (status.ready) {
    try {
      queryVec = await embedOne(query);
      let changed = false;
      for (const s of snippets) {
        if (!s.embedding) { s.embedding = await embedOne(snippetText(s)); changed = true; }
      }
      if (changed) await saveData();
    } catch (err) { console.error("Embedding failed, using keywords only:", err); }
  }

  const words = q.split(/\s+/).filter((w) => w.length > 1);
  const scored = snippets.map((s) => {
    const hay = snippetText(s).toLowerCase();
    const keyword = words.length ? words.filter((w) => hay.includes(w)).length / words.length : 0;
    const meaning = queryVec && s.embedding ? cosine(queryVec, s.embedding) : 0;
    return { s, score: meaning + keyword * 0.3, keyword };
  });

  return scored
    .filter((r) => queryVec || r.keyword > 0) // without AI, only show keyword hits
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((r) => publicView(r.s));
}

// ---- Step 4: a small web server ----
function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}
const json = (res, code, obj) => { res.writeHead(code, { "Content-Type": "application/json" }); res.end(JSON.stringify(obj)); };

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === "GET" && req.url === "/") {
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
      return res.end(await readFile(path.join(__dirname, "public", "index.html")));
    }
    if (req.method === "GET" && req.url === "/api/status") return json(res, 200, { ...status, count: snippets.length });

    if (req.method === "POST" && req.url === "/api/search") {
      const { query = "" } = JSON.parse(await readBody(req));
      return json(res, 200, await search(query));
    }

    if (req.method === "POST" && req.url === "/api/snippets") {
      const { title = "", text = "", tag = "note" } = JSON.parse(await readBody(req));
      if (!text.trim()) return json(res, 400, { error: "Text is empty" });
      const s = {
        id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
        title: title.trim() || text.trim().slice(0, 40),
        text: text.trim(), tag, created: Date.now(), embedding: null,
      };
      if (status.ready) { try { s.embedding = await embedOne(snippetText(s)); } catch (e) { console.error(e); } }
      snippets.push(s);
      await saveData();
      return json(res, 201, publicView(s));
    }

    if (req.method === "DELETE" && req.url.startsWith("/api/snippets/")) {
      const id = req.url.split("/").pop();
      snippets = snippets.filter((s) => s.id !== id);
      await saveData();
      return json(res, 200, { ok: true });
    }

    res.writeHead(404); res.end("Not found");
  } catch (err) {
    console.error(err);
    json(res, 500, { error: String(err?.message || err) });
  }
});

await loadData();
server.listen(PORT, () => console.log("Server running at http://localhost:" + PORT));
startModel();
