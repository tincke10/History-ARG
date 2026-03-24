import { useState, useRef, useEffect } from "react"
import { Send, User, Bot, Loader2 } from "lucide-react"
import { cn } from "../lib/utils"

const API_URL = import.meta.env.PUBLIC_API_URL || "https://history-arg-api.project-backoffice.workers.dev"

interface Source {
  num: number
  source: string
  title: string
  date: string
  doc_id: string
  type: string
  classification: string
  tags: string
  historical_period: string
  provincia: string
  score: number
  text_preview: string
}

interface Message {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: Date
  sources?: Source[]
}

const EXAMPLE_QUESTIONS = [
  "Que informacion tienen los archivos desclasificados de la SIDE?",
  "Cuantas victimas registra el RUVTE en Buenos Aires?",
  "Que era la Comision Asesora de Antecedentes?",
  "Hay informacion sobre desaparecidos en Cordoba?",
]

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }

  useEffect(() => {
    scrollToBottom()
  }, [messages])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    const query = input.trim()
    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: query,
      timestamp: new Date(),
    }

    setMessages((prev) => [...prev, userMessage])
    setInput("")
    setIsLoading(true)

    const assistantId = (Date.now() + 1).toString()
    setMessages((prev) => [
      ...prev,
      { id: assistantId, role: "assistant", content: "", timestamp: new Date(), sources: [] },
    ])

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      })

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: "Error de conexion" }))
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId ? { ...m, content: `Error: ${err.error || "No se pudo procesar la consulta."}` } : m
          )
        )
        setIsLoading(false)
        return
      }

      const reader = res.body!.getReader()
      const decoder = new TextDecoder()
      let buffer = ""
      let fullText = ""
      let sources: Source[] = []

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split("\n\n")
        buffer = lines.pop() || ""

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue
          try {
            const event = JSON.parse(line.slice(6))

            if (event.type === "sources") {
              sources = event.data
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, sources } : m))
              )
            } else if (event.type === "token") {
              fullText += event.data
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
              )
            } else if (event.type === "error") {
              fullText += `\n\nError: ${event.data}`
              setMessages((prev) =>
                prev.map((m) => (m.id === assistantId ? { ...m, content: fullText } : m))
              )
            }
          } catch {
            // Skip malformed events
          }
        }
      }
    } catch {
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, content: "Error de conexion. Verifica tu conexion a internet e intenta de nuevo." }
            : m
        )
      )
    }

    setIsLoading(false)
  }

  const handleExampleClick = (question: string) => {
    setInput(question)
    inputRef.current?.focus()
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault()
      handleSubmit(e)
    }
  }

  return (
    <div className="flex-1 flex flex-col max-w-4xl mx-auto w-full">
      {/* Area de mensajes */}
      <div className="flex-1 overflow-y-auto px-4 py-6">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center">
            <div className="text-center mb-8">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-[#74ACDF]/10 border border-[#74ACDF]/20 mb-4">
                <Bot className="h-8 w-8 text-[#74ACDF]" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">
                Consulta los Archivos
              </h2>
              <p className="text-sm text-muted-foreground max-w-md">
                Realiza preguntas sobre los archivos desclasificados de la SIDE
                y el Registro de Victimas del Terrorismo de Estado.
              </p>
            </div>

            <div className="w-full max-w-lg space-y-2">
              <p className="text-xs text-muted-foreground text-center mb-3 font-mono tracking-wider uppercase">
                Preguntas sugeridas
              </p>
              <div className="grid gap-2">
                {EXAMPLE_QUESTIONS.map((question, index) => (
                  <button
                    key={index}
                    onClick={() => handleExampleClick(question)}
                    className="text-left px-4 py-3 bg-secondary/50 hover:bg-secondary border border-border/50 hover:border-[#74ACDF]/30 rounded text-sm text-foreground/80 hover:text-foreground transition-all duration-200"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message) => {
              const isLastAssistant = isLoading && message.role === "assistant" && message === messages[messages.length - 1]
              // No renderear la burbuja vacía del asistente mientras carga - mostramos LoadingIndicator en su lugar
              if (isLastAssistant && !message.content) return null
              return <MessageBubble key={message.id} message={message} isStreaming={isLastAssistant && !!message.content} />
            })}
            {isLoading && messages[messages.length - 1]?.content === "" && <LoadingIndicator />}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Input */}
      <div className="border-t border-border/50 bg-card/50 backdrop-blur-sm p-4">
        <form onSubmit={handleSubmit} className="max-w-3xl mx-auto">
          <div className="relative flex items-end gap-2 bg-secondary/30 border border-border/50 rounded-lg focus-within:border-[#74ACDF]/50 transition-colors">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Escribe tu consulta sobre los archivos..."
              maxLength={500}
              className="flex-1 bg-transparent px-4 py-3 text-sm text-foreground placeholder:text-muted-foreground resize-none focus:outline-none min-h-[48px] max-h-[120px]"
              rows={1}
              disabled={isLoading}
            />
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="m-1.5 h-9 w-9 inline-flex items-center justify-center rounded-md bg-[#74ACDF] hover:bg-[#74ACDF]/90 text-[#1a1d2e] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Send className="h-4 w-4" />
              )}
            </button>
          </div>
          <p className="text-xs text-muted-foreground text-center mt-2">
            Las respuestas se basan exclusivamente en documentos oficiales desclasificados
          </p>
        </form>
      </div>
    </div>
  )
}

function MessageBubble({ message, isStreaming }: { message: Message; isStreaming?: boolean }) {
  const isUser = message.role === "user"
  const [sourcesOpen, setSourcesOpen] = useState(false)

  return (
    <div className={cn("flex gap-3", isUser ? "flex-row-reverse" : "flex-row")}>
      <div
        className={cn(
          "flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center",
          isUser
            ? "bg-[#74ACDF]/20 text-[#74ACDF]"
            : "bg-secondary border border-border/50 text-muted-foreground"
        )}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </div>
      <div
        className={cn(
          "max-w-[80%] rounded-lg px-4 py-3",
          isUser
            ? "bg-[#74ACDF] text-[#1a1d2e]"
            : "bg-secondary/70 border border-border/50 text-foreground"
        )}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap">
          {message.content}
          {isStreaming && <span className="inline-block w-1.5 h-4 bg-[#74ACDF] ml-0.5 animate-pulse" />}
        </p>

        {/* Fuentes */}
        {message.sources && message.sources.length > 0 && (
          <div className="mt-3 pt-2 border-t border-border/30">
            <button
              onClick={() => setSourcesOpen(!sourcesOpen)}
              className="text-xs text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
            >
              <svg className={cn("w-3 h-3 transition-transform", sourcesOpen && "rotate-90")} viewBox="0 0 12 12" fill="currentColor">
                <path d="M4 2l4 4-4 4z" />
              </svg>
              {sourcesOpen ? "Ocultar" : "Ver"} fuentes ({message.sources.length})
            </button>
            {sourcesOpen && (
              <div className="mt-2 space-y-2">
                {message.sources.map((s) => (
                  <div key={s.num} className="bg-background/50 rounded px-3 py-2 text-xs border border-border/30">
                    <div className="flex items-start gap-2">
                      <span className="font-mono text-[#74ACDF] font-bold shrink-0">[{s.num}]</span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className={cn(
                            "px-1.5 py-0.5 rounded text-[10px] font-mono font-semibold",
                            s.source === "SIDE" ? "bg-[#F6B40E]/20 text-[#F6B40E]" : "bg-[#74ACDF]/20 text-[#74ACDF]"
                          )}>
                            {s.source}
                          </span>
                          {s.type && <span className="text-muted-foreground">{s.type}</span>}
                          {s.date && <span className="text-muted-foreground opacity-70">{s.date}</span>}
                          <span className="text-muted-foreground/50 ml-auto shrink-0">{(s.score * 100).toFixed(0)}% relevancia</span>
                        </div>
                        {s.title && <p className="text-foreground/80 mt-1 font-medium">{s.title}</p>}
                        {s.tags && <p className="text-muted-foreground mt-0.5">Tags: {s.tags}</p>}
                        {s.provincia && <p className="text-muted-foreground mt-0.5">Provincia: {s.provincia}</p>}
                        {s.text_preview && (
                          <p className="text-muted-foreground/70 mt-1 leading-relaxed line-clamp-3 italic">
                            "{s.text_preview}..."
                          </p>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        <p
          className={cn(
            "text-xs mt-2",
            isUser ? "text-[#1a1d2e]/60" : "text-muted-foreground"
          )}
        >
          {message.timestamp.toLocaleTimeString("es-AR", {
            hour: "2-digit",
            minute: "2-digit",
          })}
        </p>
      </div>
    </div>
  )
}

function LoadingIndicator() {
  return (
    <div className="flex gap-3">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-secondary border border-border/50 flex items-center justify-center">
        <Bot className="h-4 w-4 text-muted-foreground" />
      </div>
      <div className="bg-secondary/70 border border-border/50 rounded-lg px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex gap-1">
            <span className="w-2 h-2 bg-[#74ACDF]/60 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="w-2 h-2 bg-[#74ACDF]/60 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="w-2 h-2 bg-[#74ACDF]/60 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
          </div>
          <span className="text-xs text-muted-foreground font-mono">
            Consultando archivos...
          </span>
        </div>
      </div>
    </div>
  )
}
