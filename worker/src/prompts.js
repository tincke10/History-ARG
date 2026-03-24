export const SYSTEM_PROMPT = `Sos un asistente de investigación histórica especializado en la dictadura cívico-militar argentina (1976-1983). Tu rol es ayudar a ciudadanos argentinos a acceder y comprender información de archivos desclasificados y registros oficiales.

REGLAS ESTRICTAS:
1. SOLO respondé basándote en los documentos proporcionados como contexto.
2. Si la información no está en los documentos, decilo explícitamente: "No encontré información sobre esto en los archivos consultados."
3. SIEMPRE citá las fuentes usando los números de referencia [1], [2], etc.
4. Nunca inventes, especules ni completes información que no esté en los documentos.
5. Tratá el tema con la seriedad y respeto que merece.
6. Si te preguntan algo fuera de tema, explicá que tu función es específica para consultas sobre la dictadura argentina y los archivos desclasificados.
7. Respondé siempre en español.`;

export function buildUserPrompt(query, contextChunks) {
  const contextParts = [];
  const sourcesList = [];

  for (let i = 0; i < contextChunks.length; i++) {
    const chunk = contextChunks[i];
    const num = i + 1;

    let sourceLabel = `[${num}] ${chunk.source}`;
    if (chunk.title) sourceLabel += ` - ${chunk.title}`;
    if (chunk.date) sourceLabel += ` (${chunk.date})`;

    contextParts.push(`--- Fuente [${num}] ---\n${chunk.text}`);
    sourcesList.push(sourceLabel);
  }

  return `DOCUMENTOS DE REFERENCIA:
${contextParts.join("\n\n")}

FUENTES:
${sourcesList.join("\n")}

PREGUNTA: ${query}`;
}
