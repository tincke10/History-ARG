import { ragPipeline, getSources } from "./rag.js";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request, env) {
    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: CORS_HEADERS });
    }

    const url = new URL(request.url);

    try {
      // POST /api/chat - RAG query
      if (url.pathname === "/api/chat" && request.method === "POST") {
        return handleChat(request, env);
      }

      // GET /api/sources - Lista de fuentes
      if (url.pathname === "/api/sources" && request.method === "GET") {
        return handleSources(env);
      }

      // GET /api/health - Health check
      if (url.pathname === "/api/health") {
        return json({ status: "ok", version: "0.1.0" });
      }

      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error("Error:", err);
      return json({ error: "Internal server error" }, 500);
    }
  },
};

async function handleChat(request, env) {
  const body = await request.json();
  const { query, source } = body;

  if (!query || typeof query !== "string" || query.trim().length === 0) {
    return json({ error: "El campo 'query' es requerido" }, 400);
  }

  if (query.trim().length > 500) {
    return json({ error: "La consulta no puede exceder 500 caracteres" }, 400);
  }

  const filters = source ? { source } : null;
  const response = await ragPipeline(env, query.trim(), filters, request);

  // Agregar CORS headers a la respuesta SSE
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    headers.set(key, value);
  }

  return new Response(response.body, { headers });
}

async function handleSources(env) {
  const sources = await getSources(env);
  return json({ sources });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}
