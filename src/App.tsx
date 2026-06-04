import { useState, useEffect, useRef } from "react";
import {
  Send,
  FileDown,
  Camera,
  Building2,
  UserCircle,
  Bot,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import axios from "axios";

const API_BASE = "http://localhost:8000";

type Message = {
  role: string;
  content: string;
  pages?: number[];
  source?: string;
};

interface AppProps {
  groupNumber?: string;
  memberKeys?: string[];
  targetMemberKey?: string;
}

export default function App({
  groupNumber,
  memberKeys = [],
  targetMemberKey,
}: AppProps = {}) {
  const isAuthenticated = memberKeys.length > 0;

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [memberInfo, setMemberInfo] = useState<Record<string, unknown>>({});
  const [currentCategory, setCurrentCategory] = useState<string>("");
  const [activeMemberKey, setActiveMemberKey] = useState<string>(
    targetMemberKey || "",
  );
  const chatEndRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);

  // ── Build plan summary bubble from member_info ─────────────────────────────
  const buildPlanBubble = (info: Record<string, unknown>): string | null => {
    const plans = info?.plans as
      | Record<string, Record<string, string>>
      | undefined;
    if (!plans) return null;

    const ICONS: Record<string, string> = {
      medical: "🏥",
      dental: "🦷",
      vision: "👁️",
    };
    const ORDER = ["medical", "dental", "vision"];

    const lines = ORDER.filter((k) => plans[k])
      .map(
        (k) =>
          `${ICONS[k]} **${k.charAt(0).toUpperCase() + k.slice(1)}** — ${plans[k].plan}`,
      )
      .join("\n");

    if (!lines) return null;
    return `**Your active plans:**\n\n${lines}`;
  };

  // ── On mount: load welcome message + member plan info ──────────────────────
  useEffect(() => {
    const loadWelcome = async () => {
      // Unauthenticated with no member key — skip API call, show scan prompt only
      if (!isAuthenticated && !activeMemberKey) {
        setMessages([
          {
            role: "assistant",
            content:
              "👋 Hi! I'm your **Premera Insurance Plan Assistant**.\n\nTo get started, please **scan your insurance card** using the scanner on the right, or click **Use Demo Member** to try a demo.",
          },
        ]);
        return;
      }

      try {
        const params = new URLSearchParams();
        if (activeMemberKey) params.append("member_key", activeMemberKey);
        if (groupNumber) params.append("group_number", groupNumber);
        const res = await axios.get(`${API_BASE}/welcome?${params}`);
        const msgs: Message[] = [];
        if (res.data.member_info) {
          setMemberInfo(res.data.member_info);
          const planBubble = buildPlanBubble(res.data.member_info);
          if (planBubble) msgs.push({ role: "assistant", content: planBubble });
        }
        if (res.data.answer) {
          msgs.push({ role: "assistant", content: res.data.answer });
        }
        if (msgs.length) setMessages(msgs);
      } catch (err) {
        console.error("Failed to load welcome:", err);
        setMessages([
          {
            role: "assistant",
            content:
              "👋 Welcome! I'm your insurance plan assistant. Ask me about your Medical, Dental, or Vision benefits.",
          },
        ]);
      }
    };
    loadWelcome();
  }, [activeMemberKey]);

  // ── Auto-scroll to latest message ──────────────────────────────────────────
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // ── Camera stream ───────────────────────────────────────────────────────────
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      if (streaming && videoRef.current) {
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
            audio: false,
          });
          videoRef.current.srcObject = currentStream;
          await videoRef.current.play();
        } catch (err) {
          console.error("Camera Error:", err);
          setStreaming(false);
        }
      }
    };

    startCamera();

    return () => {
      currentStream?.getTracks().forEach((track) => track.stop());
    };
  }, [streaming]);

  const toggleCamera = async () => {
    if (streaming) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setStreaming(false);
    } else {
      setStreaming(true);
    }
  };

  const scanCard = async () => {
    if (!videoRef.current) return;
    setLoading(true);

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(videoRef.current, 0, 0);

    const stream = videoRef.current.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setStreaming(false);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setLoading(false);
          return;
        }

        const formData = new FormData();
        formData.append("file", blob, "scan.jpg");

        try {
          const res = await axios.post(`${API_BASE}/scan-card`, formData);

          if (res.data?.member_info) {
            setMemberInfo(res.data.member_info);
          }

          const newMsgs: Message[] = [];
          if (res.data?.member_info) {
            const planBubble = buildPlanBubble(res.data.member_info);
            if (planBubble)
              newMsgs.push({ role: "assistant", content: planBubble });
          }
          newMsgs.push({
            role: "assistant",
            content:
              '👋 Hi! I\'m your **Premera Insurance Plan Assistant**.\n\nI can answer specific questions about your **Medical**, **Dental**, and **Vision** benefits.\n\nHere are some examples to get you started:\n\n🏥 **Medical** • *"What is my PCP copay?"* • *"How much is an ER visit?"* • *"What is my deductible?"*\n\n🦷 **Dental** • *"How much is a teeth cleaning?"* • *"What does a crown cost?"* • *"What is my dental annual maximum benefit?"*\n\n👁️ **Vision** • *"What is my vision exam copay?"* • *"How much is my glasses allowance?"*\n\nWhat would you like to know?',
          });
          setMessages(newMsgs);
        } catch (err: unknown) {
          const message = err instanceof Error ? err.message : "Unknown error";
          console.error("[X] API Fetch Failed:", message);
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content:
                "❌ **Scan Failed.** Check the console (F12) for details.",
            },
          ]);
        } finally {
          setLoading(false);
        }
      },
      "image/jpeg",
      0.7,
    );
  };

  // ── Switch between own plans (authenticated dropdown) ──────────────────────
  const switchPlan = (newMemberKey: string) => {
    if (newMemberKey === activeMemberKey) return;
    setActiveMemberKey(newMemberKey);
    setMessages([]);
    setCurrentCategory("");
    setMemberInfo({});
    // loadWelcome re-fires automatically via useEffect([activeMemberKey])
  };

  // ── Scan dependent card (authenticated mode) ────────────────────────────────
  const scanDependentCard = async () => {
    if (!videoRef.current) return;
    setLoading(true);

    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) ctx.drawImage(videoRef.current, 0, 0);

    const stream = videoRef.current.srcObject as MediaStream;
    stream?.getTracks().forEach((track) => track.stop());
    setStreaming(false);

    canvas.toBlob(
      async (blob) => {
        if (!blob) {
          setLoading(false);
          return;
        }

        // Step 1: scan the card
        const scanForm = new FormData();
        scanForm.append("file", blob, "scan.jpg");
        try {
          const scanRes = await axios.post(`${API_BASE}/scan-card`, scanForm);
          const scannedKey = scanRes.data?.member_key || "";
          const scannedGroup = scanRes.data?.group_number || "";

          if (!scannedKey) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: "⚠️ Could not read the card. Please try again.",
              },
            ]);
            setLoading(false);
            return;
          }

          // Step 2: validate dependent
          const valForm = new FormData();
          valForm.append("scanned_member_key", scannedKey);
          valForm.append("group_number", scannedGroup);
          valForm.append("member_keys", JSON.stringify(memberKeys));
          const valRes = await axios.post(
            `${API_BASE}/validate-dependent`,
            valForm,
          );

          if (!valRes.data.valid) {
            setMessages((prev) => [
              ...prev,
              { role: "assistant", content: `⚠️ ${valRes.data.message}` },
            ]);
            setLoading(false);
            return;
          }

          // Step 3: load dependent plan
          const depInfo = valRes.data.member_info;
          setMemberInfo(depInfo);
          setMessages([]);
          setCurrentCategory("");
          const msgs: Message[] = [];
          msgs.push({
            role: "assistant",
            content: `✅ **Dependent plan loaded.**`,
          });
          const planBubble = buildPlanBubble(depInfo);
          if (planBubble) msgs.push({ role: "assistant", content: planBubble });
          setMessages(msgs);
        } catch {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: "❌ **Scan failed.** Please try again.",
            },
          ]);
        } finally {
          setLoading(false);
        }
      },
      "image/jpeg",
      0.7,
    );
  };

  // ── Demo member load (bypasses vision model for local testing) ───────────────
  const loadDemoMember = async () => {
    try {
      const res = await axios.get(`${API_BASE}/member-info`, {
        params: { member_key: "DEMO000001", group_number: "1000016" },
      });
      setMemberInfo(res.data);
      setCurrentCategory("");
      const newMsgs: Message[] = [];
      const planBubble = buildPlanBubble(res.data);
      if (planBubble) newMsgs.push({ role: "assistant", content: planBubble });
      newMsgs.push({
        role: "assistant",
        content:
          '👋 Hi! I\'m your **Premera Insurance Plan Assistant**.\n\nI can answer specific questions about your **Medical**, **Dental**, and **Vision** benefits.\n\nHere are some examples to get you started:\n\n🏥 **Medical** • *"What is my PCP copay?"* • *"How much is an ER visit?"* • *"What is my deductible?"*\n\n🦷 **Dental** • *"How much is a teeth cleaning?"* • *"What does a crown cost?"* • *"What is my dental annual maximum benefit?"*\n\n👁️ **Vision** • *"What is my vision exam copay?"* • *"How much is my glasses allowance?"*\n\nWhat would you like to know?',
      });
      setMessages(newMsgs);
    } catch {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ Failed to load demo member." },
      ]);
    }
  };

  // ── Send chat message ───────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg: Message = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("prompt", input);
      formData.append("history", JSON.stringify(messages));
      formData.append("member_info", JSON.stringify(memberInfo));
      formData.append("current_category", currentCategory);

      const res = await axios.post(`${API_BASE}/chat`, formData);
      const answer =
        typeof res.data.answer === "string"
          ? res.data.answer
          : JSON.stringify(res.data.answer);

      if (res.data.category) {
        setCurrentCategory(res.data.category);
      }

      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: answer,
          pages: res.data.pages,
          source: res.data.source,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ API Error: Connection failed.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const downloadPDF = async (content: string) => {
    try {
      const formData = new FormData();
      formData.append("content", content);
      const res = await axios.post(`${API_BASE}/download-pdf`, formData, {
        responseType: "blob",
        timeout: 30000,
        headers: { "Content-Type": "multipart/form-data" },
      });
      const blob = new Blob([res.data], { type: "application/pdf" });
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `Insurance_Report_${Date.now()}.pdf`);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error("PDF Download Error:", err);
      alert("Connection Error: Is FastAPI running on port 8000?");
    }
  };

  // ── Sanitize messages for rendering ────────────────────────────────────────
  const safeMessages = messages.map((msg) => {
    let content = msg.content;

    if (typeof content !== "string") {
      try {
        content =
          ((content as Record<string, unknown>)?.answer as string) ||
          JSON.stringify(content);
      } catch {
        content = String(content);
      }
    }

    if (content.startsWith("{") && content.includes('"answer"')) {
      try {
        const parsed = JSON.parse(content);
        content = parsed.answer || content;
      } catch {
        /* keep original */
      }
    }

    content = content.replace(/\\n/g, "\n");
    return { ...msg, content };
  });

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* ── MAIN CHAT AREA ── */}
      <div className="flex flex-col flex-1 border-r border-slate-200">
        <header className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-600" />
            <h1 className="font-bold text-lg tracking-tight">
              Premera Insurance Policy Assistant
            </h1>
          </div>

          {/* Plan switcher — only shown in authenticated mode with multiple keys */}
          {isAuthenticated && memberKeys.length > 1 && (
            <div className="flex items-center gap-2">
              <span className="text-xs text-slate-500 font-medium">Plan:</span>
              <select
                value={activeMemberKey}
                onChange={(e) => switchPlan(e.target.value)}
                className="text-sm border border-slate-200 rounded-lg px-3 py-1.5 bg-white text-slate-700 font-medium focus:ring-2 focus:ring-blue-500 outline-none cursor-pointer"
              >
                {memberKeys.map((key, i) => (
                  <option key={key} value={key}>
                    {key === activeMemberKey
                      ? (
                          (memberInfo as Record<string, unknown>)?.plans as
                            | Record<string, Record<string, string>>
                            | undefined
                        )?.[
                          Object.keys(
                            ((memberInfo as Record<string, unknown>)
                              ?.plans as Record<string, unknown>) || {},
                          )[0]
                        ]?.group_name || `Plan ${i + 1}`
                      : `Plan ${i + 1}`}
                  </option>
                ))}
              </select>
            </div>
          )}
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {safeMessages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-4 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role !== "user" && (
                <Bot className="text-blue-600 mt-1 shrink-0" />
              )}

              <div
                className={`max-w-5xl p-6 rounded-2xl shadow-sm ${
                  msg.role === "user"
                    ? "bg-blue-600 text-white"
                    : "bg-white border border-slate-200"
                }`}
              >
                <div
                  className={`prose ${
                    msg.role === "user" ? "prose-invert" : "prose-slate"
                  } prose-sm max-w-none
                  prose-table:border prose-table:border-slate-300 prose-table:rounded-lg
                  prose-th:bg-slate-100 prose-th:text-slate-900 prose-th:font-bold prose-th:p-3 prose-th:border prose-th:border-slate-300
                  prose-td:p-3 prose-td:border prose-td:border-slate-200 prose-td:text-slate-700
                  overflow-x-auto`}
                >
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      table: ({ children }) => (
                        <table className="w-full border-collapse text-sm">
                          {children}
                        </table>
                      ),
                      th: ({ children }) => (
                        <th className="bg-slate-100 font-bold p-3 border border-slate-300 text-left">
                          {children}
                        </th>
                      ),
                      td: ({ children }) => (
                        <td className="p-3 border border-slate-200">
                          {children}
                        </td>
                      ),
                    }}
                  >
                    {typeof msg.content === "string"
                      ? msg.content.replace(/\\n/g, "\n")
                      : ""}
                  </ReactMarkdown>
                </div>

                {msg.role === "assistant" &&
                  typeof msg.content === "string" &&
                  msg.content.includes("|") && (
                    <button
                      onClick={() => downloadPDF(msg.content)}
                      className="mt-6 flex items-center justify-center gap-2 py-3 w-full border-t border-slate-100 text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                    >
                      <FileDown size={14} /> Download Comparison PDF
                    </button>
                  )}

                {msg.role === "assistant" &&
                  msg.pages &&
                  msg.pages.length > 0 &&
                  msg.source && (
                    <div className="mt-3 pt-3 border-t border-slate-100 flex items-start gap-2">
                      <FileDown
                        size={13}
                        className="shrink-0 text-blue-400 mt-0.5"
                      />
                      <div className="text-[12px] text-slate-500 leading-snug">
                        <span className="font-semibold text-slate-600">
                          Referenced from:{" "}
                        </span>
                        <span>{msg.source}</span>
                        <span className="mx-1 text-slate-300">|</span>
                        <span className="font-medium text-slate-600">
                          Page{msg.pages.length > 1 ? "s" : ""}{" "}
                          {msg.pages.join(", ")}
                        </span>
                      </div>
                    </div>
                  )}
              </div>

              {msg.role === "user" && (
                <UserCircle className="text-slate-400 mt-1 shrink-0" />
              )}
            </div>
          ))}

          {loading && (
            <div className="flex gap-4 items-center">
              <Bot className="text-blue-400 shrink-0" />
              <div className="bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm flex items-center gap-1.5">
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "0ms" }}
                />
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "150ms" }}
                />
                <span
                  className="w-2 h-2 bg-slate-400 rounded-full animate-bounce"
                  style={{ animationDelay: "300ms" }}
                />
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </main>

        <footer className="bg-white border-t border-slate-200 pt-4 pb-2">
          <div className="max-w-3xl mx-auto flex gap-4 px-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !loading && handleSend()}
              placeholder="Ask a question about your benefits..."
              className="flex-1 p-3 bg-slate-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
            <button
              onClick={handleSend}
              disabled={loading}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg disabled:opacity-50"
            >
              <Send size={20} />
            </button>
          </div>
          <p className="text-center text-[11px] text-slate-400 mt-2 pb-1">
            This assistant uses AI and may make mistakes. Always verify benefit
            details with your official plan documents or contact Premera
            directly.
          </p>
        </footer>
      </div>

      {/* ── RIGHT SIDEBAR ── */}
      <aside className="w-80 bg-white p-6 hidden lg:block border-l border-slate-200">
        <div className="space-y-6 sticky top-6">
          {isAuthenticated ? (
            /* ── Authenticated: Check Dependent ── */
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold text-blue-900 mb-1">
                <Camera size={18} /> Check Dependent Benefits
              </h2>
              <p className="text-[11px] text-blue-600 mb-4 leading-relaxed">
                Scan a dependent's insurance card to view their benefit details.
              </p>

              <div className="aspect-square bg-slate-900 rounded-xl mb-4 overflow-hidden flex items-center justify-center border-2 border-slate-200 shadow-inner">
                {streaming ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center p-4">
                    <Camera
                      className="text-slate-700 mx-auto mb-2 opacity-20"
                      size={48}
                    />
                    <p className="text-[10px] text-slate-500 font-medium">
                      Camera Offline
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={toggleCamera}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-md ${
                    streaming
                      ? "bg-slate-800 text-white hover:bg-slate-900"
                      : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {streaming ? "Stop Camera" : "Open Camera"}
                </button>
                {streaming && (
                  <button
                    onClick={scanDependentCard}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    {loading ? "Validating..." : "Scan Dependent Card"}
                  </button>
                )}
              </div>
            </div>
          ) : (
            /* ── Unauthenticated: Full Vision Scanner ── */
            <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
              <h2 className="flex items-center gap-2 font-bold text-blue-900 mb-2">
                <Camera size={18} /> Vision Scanner
              </h2>
              <p className="text-[10px] text-blue-600 mb-4 uppercase font-bold tracking-wider">
                Llama 3.2-Vision Active
              </p>

              <div className="aspect-square bg-slate-900 rounded-xl mb-4 overflow-hidden flex items-center justify-center border-2 border-slate-200 shadow-inner">
                {streaming ? (
                  <video
                    ref={videoRef}
                    autoPlay
                    playsInline
                    className="w-full h-full object-cover scale-x-[-1]"
                  />
                ) : (
                  <div className="text-center p-4">
                    <Camera
                      className="text-slate-700 mx-auto mb-2 opacity-20"
                      size={48}
                    />
                    <p className="text-[10px] text-slate-500 font-medium">
                      Camera Offline
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={toggleCamera}
                  className={`w-full py-3 rounded-xl text-sm font-bold transition-all shadow-md ${
                    streaming
                      ? "bg-slate-800 text-white hover:bg-slate-900"
                      : "bg-white text-slate-800 border border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  {streaming ? "Stop Camera" : "Open Camera"}
                </button>
                {streaming && (
                  <button
                    onClick={scanCard}
                    disabled={loading}
                    className="w-full py-3 bg-blue-600 text-white text-sm font-bold rounded-xl hover:bg-blue-700 transition-all shadow-lg shadow-blue-200 flex items-center justify-center gap-2"
                  >
                    {loading ? "Processing..." : "Capture & Scan Card"}
                  </button>
                )}
                <button
                  onClick={loadDemoMember}
                  disabled={loading}
                  className="w-full py-2 bg-slate-100 text-slate-600 text-xs font-bold rounded-xl hover:bg-slate-200 transition-all border border-slate-200"
                >
                  Use Demo Member
                </button>
              </div>
            </div>
          )}

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Quick Tip
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              {isAuthenticated
                ? "Scan a dependent's card to check their specific benefit details and coverage."
                : "Position your insurance card clearly within the frame. Our AI will automatically detect the Carrier, Plan Year, and Member Tier."}
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
