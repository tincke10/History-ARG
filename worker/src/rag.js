import { SYSTEM_PROMPT, buildUserPrompt } from "./prompts.js";
import { preprocessQuery } from "./preprocessing.js";

const TOP_K = 5;
const LLM_MODEL = "@cf/meta/llama-3.1-8b-instruct";
const EMBED_MODEL = "@cf/baai/bge-small-en-v1.5";

/**
 * Pipeline RAG completo: query → embed → search → context → generate.
 * Retorna un ReadableStream con la respuesta en streaming.
 */
export async function ragPipeline(env, query, filters) {
  // 1. Preprocesar query
  const enhancedQuery = preprocessQuery(query);

  // 2. Embed query con Workers AI
  const embeddingResponse = await env.AI.run(EMBED_MODEL, {
    text: [enhancedQuery],
  });
  const queryVector = embeddingResponse.data[0];

  // 3. Buscar en Vectorize
  const vectorQuery = { topK: TOP_K, returnMetadata: "all" };
  if (filters?.source) {
    vectorQuery.filter = { source: filters.source };
  }
  const vectorResults = await env.VECTORIZE.query(queryVector, vectorQuery);

  if (!vectorResults.matches || vectorResults.matches.length === 0) {
    return noResultsResponse();
  }

  // 4. Recuperar texto completo de D1
  const chunkIds = vectorResults.matches.map((m) => m.id);
  const placeholders = chunkIds.map(() => "?").join(", ");
  const dbResults = await env.DB.prepare(
    `SELECT id, text, source, doc_id, title, date, type, tags, provincia
     FROM chunks WHERE id IN (${placeholders})`
  )
    .bind(...chunkIds)
    .all();

  // Mapear por ID para mantener el orden de relevancia
  const chunksById = {};
  for (const row of dbResults.results) {
    chunksById[row.id] = row;
  }

  const contextChunks = [];
  for (const match of vectorResults.matches) {
    const chunk = chunksById[match.id];
    if (chunk) {
      contextChunks.push({
        text: chunk.text,
        source: chunk.source,
        title: chunk.title || "",
        date: chunk.date || "",
        doc_id: chunk.doc_id || "",
        type: chunk.type || "",
        score: match.score,
      });
    }
  }

  // 5. Generar respuesta con LLM (streaming)
  const userPrompt = buildUserPrompt(query, contextChunks);

  const stream = await env.AI.run(LLM_MODEL, {
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
    stream: true,
    max_tokens: 2048,
    temperature: 0.1,
  });

  // 6. Transformar stream de Workers AI a SSE con metadata de fuentes
  return createSSEResponse(stream, contextChunks);
}

/**
 * Retorna las fuentes disponibles desde D1.
 */
export async function getSources(env) {
  const result = await env.DB.prepare(
    "SELECT id, name, description, url, license FROM sources"
  ).all();
  return result.results;
}

/**
 * Crea una respuesta SSE que incluye los tokens del LLM y las fuentes al final.
 */
function createSSEResponse(aiStream, contextChunks) {
  const encoder = new TextEncoder();

  const readable = new ReadableStream({
    async start(controller) {
      // Enviar fuentes como primer evento
      const sourcesEvent = {
        type: "sources",
        data: contextChunks.map((c, i) => ({
          num: i + 1,
          source: c.source,
          title: c.title,
          date: c.date,
          doc_id: c.doc_id,
          score: c.score,
          text_preview: c.text.substring(0, 200),
        })),
      };
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify(sourcesEvent)}\n\n`)
      );

      // Stream de tokens del LLM
      const reader = aiStream.getReader();
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const text = new TextDecoder().decode(value);
          // Workers AI streaming devuelve líneas "data: {...}"
          const lines = text.split("\n").filter((l) => l.startsWith("data: "));
          for (const line of lines) {
            const jsonStr = line.slice(6);
            if (jsonStr === "[DONE]") continue;
            try {
              const parsed = JSON.parse(jsonStr);
              const token = parsed.response || "";
              if (token) {
                controller.enqueue(
                  encoder.encode(
                    `data: ${JSON.stringify({ type: "token", data: token })}\n\n`
                  )
                );
              }
            } catch {
              // Skip malformed lines
            }
          }
        }
      } catch (err) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: "error", data: err.message })}\n\n`
          )
        );
      }

      // Señal de fin
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: "done" })}\n\n`)
      );
      controller.close();
    },
  });

  return new Response(readable, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
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
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
    },
  });
}
