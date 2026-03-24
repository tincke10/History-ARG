import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { preprocessQuery } from "./preprocessing.js";

const TOP_K = 5;
const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";
const GROQ_MODEL = "llama-3.1-70b-versatile";
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";
const MAX_CONTEXT_CHARS = 4000;
const MAX_OUTPUT_TOKENS = 512;
const CACHE_TTL = 3600;

/**
 * Pipeline RAG: query → cache check → embed → search → context → Groq → stream
 */
export async function ragPipeline(env, query, filters, request) {
  // 1. Check cache
  const cacheKey = new Request(
    `https://cache.internal/chat/${encodeURIComponent(query)}${filters?.source ? `?source=${filters.source}` : ""}`,
    { method: "GET" }
  );
  const cache = caches.default;
  const cached = await cache.match(cacheKey);
  if (cached) return cached;

  // 2. Preprocesar query
  const enhancedQuery = preprocessQuery(query);

  // 3. Embed query con Workers AI
  const embeddingResponse = await env.AI.run(EMBED_MODEL, {
    text: [enhancedQuery],
  });
  const queryVector = embeddingResponse.data[0];

  // 4. Buscar en Vectorize
  const vectorQuery = { topK: TOP_K, returnMetadata: "all" };
  if (filters?.source) {
    vectorQuery.filter = { source: filters.source };
  }
  const vectorResults = await env.VECTORIZE.query(queryVector, vectorQuery);

  if (!vectorResults.matches || vectorResults.matches.length === 0) {
    return noResultsResponse();
  }

  // 5. Recuperar texto completo de D1
  const chunkIds = vectorResults.matches.map((m) => m.id);
  const placeholders = chunkIds.map(() => "?").join(", ");
  const dbResults = await env.DB.prepare(
    `SELECT id, text, source, doc_id, title, date, type, classification, tags, historical_period, provincia
     FROM chunks WHERE id IN (${placeholders})`
  )
    .bind(...chunkIds)
    .all();

  const chunksById = {};
  for (const row of dbResults.results) {
    chunksById[row.id] = row;
  }

  const contextChunks = [];
  let totalChars = 0;
  for (const match of vectorResults.matches) {
    const chunk = chunksById[match.id];
    if (!chunk) continue;
    if (totalChars + chunk.text.length > MAX_CONTEXT_CHARS) {
      const remaining = MAX_CONTEXT_CHARS - totalChars;
      if (remaining > 200) {
        contextChunks.push(buildChunkObj(chunk, match.score, remaining));
      }
      break;
    }
    totalChars += chunk.text.length;
    contextChunks.push(buildChunkObj(chunk, match.score));
  }

  // 6. Generar con Groq (streaming)
  const userPrompt = buildUserPrompt(query, contextChunks);

  const groqRes = await fetch(GROQ_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1,
    }),
  });

  // Fallback a Workers AI si Groq falla
  if (!groqRes.ok) {
    console.warn("Groq failed, falling back to Workers AI:", groqRes.status);
    const fallbackStream = await env.AI.run("@cf/meta/llama-3.1-8b-instruct", {
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      stream: true,
      max_tokens: MAX_OUTPUT_TOKENS,
      temperature: 0.1,
    });
    return createWorkersAISSEResponse(fallbackStream, contextChunks);
  }

  // 7. Transform Groq SSE → our SSE format
  const response = createGroqSSEResponse(groqRes.body, contextChunks);

  // 8. Cache (background)
  const responseToCache = response.clone();
  const cacheableResponse = new Response(responseToCache.body, {
    headers: {
      ...Object.fromEntries(responseToCache.headers),
      "Cache-Control": `s-maxage=${CACHE_TTL}`,
    },
  });
  cache.put(cacheKey, cacheableResponse).catch(() => {});

  return response;
}

function buildChunkObj(chunk, score, truncateAt) {
  return {
    text: truncateAt ? chunk.text.substring(0, truncateAt) + "..." : chunk.text,
    source: chunk.source,
    title: chunk.title || "",
    date: chunk.date || "",
    doc_id: chunk.doc_id || "",
    type: chunk.type || "",
    classification: chunk.classification || "",
    tags: chunk.tags || "",
    historical_period: chunk.historical_period || "",
    provincia: chunk.provincia || "",
    score,
  };
}

export async function getSources(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, description, url, license FROM sources"
  ).all();
  return result.results;
}

function buildSourcesEvent(contextChunks) {
  return {
    type: "sources",
    data: contextChunks.map((c, i) => ({
      num: i + 1,
      source: c.source,
      title: c.title,
      date: c.date,
      doc_id: c.doc_id,
      type: c.type,
      classification: c.classification,
      tags: c.tags,
      historical_period: c.historical_period,
      provincia: c.provincia,
      score: c.score,
      text_preview: c.text.substring(0, 300),
    })),
  };
}

/**
 * Transforma Groq SSE (formato OpenAI) a nuestro formato SSE.
 */
function createGroqSSEResponse(groqStream, contextChunks) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(buildSourcesEvent(contextChunks))}\n\n`)
      );

      const reader = groqStream.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const jsonStr = line.slice(6).trim();
            if (!jsonStr || jsonStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(jsonStr);
              const delta = parsed.choices?.[0]?.delta?.content;
              if (delta) {
                controller.enqueue(
                  encoder.encode(`data: ${JSON.stringify({ type: "token", data: delta })}\n\n`)
                );
              }
            } catch { /* skip */ }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`)
        );
      }

      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

/**
 * Fallback: Workers AI stream → nuestro formato SSE.
 */
function createWorkersAISSEResponse(aiStream, contextChunks) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(buildSourcesEvent(contextChunks))}\n\n`)
      );

      const reader = aiStream.getReader();
      const decoder = new TextDecoder();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          const text = decoder.decode(value, { stream: true });
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const token = parsed.response || "";
              if (token) {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "token", data: token })}\n\n`));
              }
            } catch { /* skip */ }
          }
        }
      } catch (err) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`));
      }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`));
      controller.close();
    },
  });

  return new Response(readable, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" },
  });
}

function noResultsResponse() {
  const encoder = new TextEncoder();
  const body = [
    `data: ${JSON.stringify({ type: "sources", data: [] })}\n\n`,
    `data: ${JSON.stringify({ type: "token", data: "No encontré información relevante en los archivos consultados. Probá reformular tu pregunta o usar términos más específicos." })}\n\n`,
    `data: ${JSON.stringify({ type: "done" })}\n\n`,
  ].join("");

  return new Response(body, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache" },
  });
}
