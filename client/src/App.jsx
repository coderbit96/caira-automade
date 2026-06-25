import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowUp,
  Bot,
  Code2,
  FileText,
  Image,
  Loader2,
  Menu,
  MousePointer2,
  Paperclip,
  PanelLeftClose,
  Plus,
  Sparkles,
  Wand2,
  X
} from "lucide-react";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:5001";

const starterMessages = [
  {
    role: "assistant",
    content:
      "Hi, I am Caira Automade. Give me a task, ask for a project summary, generate code, or create an image prompt."
  }
];

const modes = [
  { id: "task", label: "Task", icon: Sparkles },
  { id: "summary", label: "Summary", icon: FileText },
  { id: "code", label: "Code", icon: Code2 },
  { id: "image", label: "Image", icon: Image }
];

export default function App() {
  const [messages, setMessages] = useState(starterMessages);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState("task");
  const [imageMode, setImageMode] = useState("generate");
  const [imageFile, setImageFile] = useState(null);
  const [attachedFile, setAttachedFile] = useState(null);
  const [busy, setBusy] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [error, setError] = useState("");
  const [cursor, setCursor] = useState({ x: 0, y: 0 });
  const chatEndRef = useRef(null);

  const currentSuggestion = useMemo(() => {
    if (mode === "image") return "Describe subject, style, lighting, mood, and format for a better image.";
    if (mode === "code") return "Mention language, framework, inputs, outputs, and edge cases.";
    if (mode === "summary") return "Paste files, a folder tree, or project notes for a clean summary.";
    return "Give the goal, context, and what a finished answer should look like.";
  }, [mode]);

  useEffect(() => {
    const move = (event) => setCursor({ x: event.clientX, y: event.clientY });
    window.addEventListener("pointermove", move);
    return () => window.removeEventListener("pointermove", move);
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  async function request(path, options = {}) {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        ...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
        ...options.headers
      }
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || "Request failed");
    return data;
  }

  async function submitPrompt(customPrompt) {
    const text = (customPrompt || prompt).trim();
    if (!text && mode !== "image") return;

    setError("");
    setBusy(true);

    if (attachedFile) {
      await submitAttachment(text);
      setBusy(false);
      return;
    }

    if (mode === "image" || looksLikeImagePrompt(text)) {
      await submitImage(text);
      setBusy(false);
      return;
    }

    const instruction = decoratePrompt(text);
    setMessages((items) => [...items, { role: "user", content: text }]);
    setPrompt("");

    try {
      const data = await request("/api/agent/chat", {
        method: "POST",
        body: JSON.stringify({ prompt: instruction })
      });
      setMessages((items) => [...items, { role: "assistant", content: data.reply }]);
    } catch (err) {
      setError(err.message);
      setMessages((items) => [...items, { role: "assistant", content: err.message }]);
    } finally {
      setBusy(false);
    }
  }

  async function submitImage(text) {
    const form = new FormData();
    form.append("mode", imageMode);
    form.append("prompt", text);
    if (imageFile) form.append("image", imageFile);

    setMessages((items) => [
      ...items,
      { role: "user", content: `${imageMode === "enhance" ? "Enhance image" : "Generate image"}: ${text || imageFile?.name}` }
    ]);
    setPrompt("");

    try {
      const data = await request("/api/agent/image", { method: "POST", body: form });
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content: "Image ready. You can refine it with a more specific prompt.",
          imageUrl: data.imageUrl
        }
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((items) => [...items, { role: "assistant", content: err.message }]);
    }
  }

  async function submitAttachment(text) {
    const form = new FormData();
    form.append("prompt", text);
    form.append("file", attachedFile);

    setMessages((items) => [
      ...items,
      { role: "user", content: `${text || "Edit this attachment"}\n\nAttached: ${attachedFile.name}` }
    ]);
    setPrompt("");
    setAttachedFile(null);

    try {
      const data = await request("/api/agent/attachment", { method: "POST", body: form });
      setMessages((items) => [
        ...items,
        {
          role: "assistant",
          content: data.reply,
          imageUrl: data.imageUrl
        }
      ]);
    } catch (err) {
      setError(err.message);
      setMessages((items) => [...items, { role: "assistant", content: err.message }]);
    }
  }

  function decoratePrompt(text) {
    if (mode === "summary") return `Create a concise project or file summary. Input:\n${text}`;
    if (mode === "code") return `Generate simple, basic, working code for this request:\n${text}`;
    return text;
  }

  function looksLikeImagePrompt(text) {
    const value = text.toLowerCase();
    return (
      value.includes("generate image") ||
      value.includes("generate an image") ||
      value.includes("generate a image") ||
      value.includes("create image") ||
      value.includes("create an image") ||
      value.includes("make image") ||
      value.includes("draw") ||
      value.includes("picture") ||
      value.includes("photo")
    );
  }

  return (
    <main className="app-shell">
      <div className="cursor-aura" style={{ transform: `translate(${cursor.x - 160}px, ${cursor.y - 160}px)` }} />
      <aside className={`sidebar ${sidebarOpen ? "open" : "closed"}`}>
        <div className="brand">
          <div className="brand-mark">
            <Bot size={22} />
          </div>
          <div>
            <strong>Caira Automade</strong>
            <span>AI command agent</span>
          </div>
        </div>

        <button className="new-chat" onClick={() => setMessages(starterMessages)}>
          <Plus size={17} />
          New chat
        </button>

        <nav className="mode-list" aria-label="Prompt modes">
          {modes.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={mode === item.id ? "active" : ""} onClick={() => setMode(item.id)}>
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="suggestion-box">
          <MousePointer2 size={17} />
          <p>{currentSuggestion}</p>
        </div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <button className="icon-button" onClick={() => setSidebarOpen((value) => !value)} aria-label="Toggle sidebar">
            {sidebarOpen ? <PanelLeftClose size={20} /> : <Menu size={20} />}
          </button>
          <div>
            <h1>Caira Automade</h1>
            <p>Free AI command workspace</p>
          </div>
        </header>

        <div className="chat-layout">
          <section className="chat-panel" aria-label="Caira chat">
            <div className="messages">
              {messages.map((message, index) => (
                <article key={`${message.role}-${index}`} className={`message ${message.role}`}>
                  <div className="avatar">{message.role === "assistant" ? <Sparkles size={17} /> : "U"}</div>
                  <div className="bubble">
                    <pre>{message.content}</pre>
                    {message.imageUrl && (
                      <img className="chat-image-result" src={message.imageUrl} alt="Generated by Caira Automade" />
                    )}
                  </div>
                </article>
              ))}
              {busy && (
                <article className="message assistant">
                  <div className="avatar">
                    <Loader2 className="spin" size={17} />
                  </div>
                  <div className="bubble typing">Caira is working...</div>
                </article>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="prompt-dock">
              {attachedFile && (
                <div className="attachment-chip">
                  <FileText size={16} />
                  <span>{attachedFile.name}</span>
                  <button type="button" onClick={() => setAttachedFile(null)} aria-label="Remove attachment">
                    <X size={15} />
                  </button>
                </div>
              )}

              {mode === "image" && (
                <div className="image-controls">
                  <div className="segmented">
                    <button className={imageMode === "generate" ? "active" : ""} onClick={() => setImageMode("generate")}>
                      <Wand2 size={16} />
                      Generate
                    </button>
                    <button className={imageMode === "enhance" ? "active" : ""} onClick={() => setImageMode("enhance")}>
                      <Sparkles size={16} />
                      Enhance
                    </button>
                  </div>
                  {imageMode === "enhance" && (
                    <label className="file-picker">
                      <Image size={16} />
                      <span>{imageFile ? imageFile.name : "Choose image"}</span>
                      <input type="file" accept="image/*" onChange={(event) => setImageFile(event.target.files?.[0] || null)} />
                    </label>
                  )}
                </div>
              )}

              <form
                className="composer"
                onSubmit={(event) => {
                  event.preventDefault();
                  submitPrompt();
                }}
              >
                <label className="attach-button" title="Attach document, image, PDF, or video">
                  <Paperclip size={19} />
                  <input
                    type="file"
                    accept="image/*,application/pdf,video/*,.doc,.docx,.txt,.md,.csv,.json,.rtf"
                    onChange={(event) => setAttachedFile(event.target.files?.[0] || null)}
                  />
                </label>
                <textarea
                  value={prompt}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder="Message Caira Automade..."
                  rows={1}
                />
                <button className="send-button" disabled={busy} aria-label="Send prompt">
                  {busy ? <Loader2 className="spin" size={18} /> : <ArrowUp size={19} />}
                </button>
              </form>
              {error && <p className="error-line">{error}</p>}
            </div>
          </section>
        </div>
      </section>

    </main>
  );
}
