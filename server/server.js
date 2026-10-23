"use strict";

const express = require("express");
const rateLimit = require("express-rate-limit");

const PORT = process.env.PORT || 3001;
const N8N_WEBHOOK_URL = process.env.N8N_WEBHOOK_URL || "";
const N8N_WEBHOOK_SECRET = process.env.N8N_WEBHOOK_SECRET || "";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "";
const WEBHOOK_TIMEOUT_MS = 8000;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const app = express();

app.disable("x-powered-by");
app.use(express.json({ limit: "20kb" }));

// Same-origin requests (via the nginx proxy) need no CORS header at all.
// Only set one when a different origin was explicitly allowed, e.g. local dev.
if (ALLOWED_ORIGIN) {
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
    res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type");
    if (req.method === "OPTIONS") return res.sendStatus(204);
    next();
  });
}

const contactLimiter = rateLimit({
  windowMs: 10 * 60 * 1000,
  limit: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { ok: false, error: "Demasiados intentos. Probá de nuevo en un rato." },
});

function validateContact(body) {
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const message = typeof body.message === "string" ? body.message.trim() : "";

  if (!name || name.length > 100) return "Nombre inválido.";
  if (!email || email.length > 200 || !EMAIL_RE.test(email)) return "Email inválido.";
  if (!message || message.length > 2000) return "Mensaje inválido.";
  return null;
}

app.get("/healthz", (req, res) => {
  res.json({ ok: true });
});

app.post("/contact", contactLimiter, async (req, res) => {
  const body = req.body || {};

  // Honeypot: a real visitor never fills this hidden field. Accept
  // silently so a bot can't tell it was dropped, but never forward it.
  if (typeof body.company === "string" && body.company.trim() !== "") {
    return res.json({ ok: true });
  }

  const error = validateContact(body);
  if (error) {
    return res.status(400).json({ ok: false, error });
  }

  if (!N8N_WEBHOOK_URL) {
    console.error("N8N_WEBHOOK_URL no configurada — no se puede enviar el mensaje.");
    return res.status(503).json({ ok: false, error: "El formulario no está disponible ahora. Escribime por Telegram." });
  }

  const payload = {
    name: body.name.trim(),
    email: body.email.trim(),
    message: body.message.trim(),
    source: "calvopa.net",
    submittedAt: new Date().toISOString(),
    ip: req.ip,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), WEBHOOK_TIMEOUT_MS);

  try {
    const headers = { "Content-Type": "application/json" };
    if (N8N_WEBHOOK_SECRET) headers["X-Webhook-Secret"] = N8N_WEBHOOK_SECRET;

    const resp = await fetch(N8N_WEBHOOK_URL, {
      method: "POST",
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!resp.ok) {
      console.error("n8n webhook respondió", resp.status, await resp.text().catch(() => ""));
      return res.status(502).json({ ok: false, error: "No pudimos enviar tu mensaje. Escribime por Telegram mientras tanto." });
    }

    return res.json({ ok: true });
  } catch (err) {
    console.error("Error enviando al webhook de n8n:", err.message);
    return res.status(502).json({ ok: false, error: "No pudimos enviar tu mensaje. Escribime por Telegram mientras tanto." });
  } finally {
    clearTimeout(timeout);
  }
});

app.listen(PORT, () => {
  console.log(`calvopa-landing-api escuchando en :${PORT}`);
  if (!N8N_WEBHOOK_URL) {
    console.warn("Aviso: N8N_WEBHOOK_URL no está configurada.");
  }
});
