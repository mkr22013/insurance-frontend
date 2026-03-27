import React, { useState, useEffect, useRef } from "react";
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

// --- API CONFIG ---
const API_BASE = "http://localhost:8000";

export default function App() {
  const [messages, setMessages] = useState<{ role: string; content: string }[]>(
    [],
  );
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  // 1. Add these refs at the top of your App component
  const videoRef = useRef<HTMLVideoElement>(null);
  const [streaming, setStreaming] = useState(false);

  // 2. Add the Camera Toggle Function
  const toggleCamera = async () => {
    if (streaming) {
      const stream = videoRef.current?.srcObject as MediaStream;
      stream?.getTracks().forEach((track) => track.stop());
      setStreaming(false);
    } else {
      // Just set the state to true; the useEffect below will handle the rest
      setStreaming(true);
    }
  };

  // 3. Add the Capture & Scan Function
  const scanCard = async () => {
    if (!videoRef.current) return;

    setLoading(true);
    console.log("[*] Starting Scan Process...");

    // 1. Capture and Stop Camera
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
          console.error("[!] Failed to create image blob.");
          return;
        }

        const formData = new FormData();
        formData.append("file", blob, "scan.jpg");

        try {
          console.log("[*] Sending image to API...");
          const res = await axios.post(`${API_BASE}/scan-card`, formData);

          // --- THE SURGICAL LOGS ---
          console.log("[*] API Response Received:", res.data);

          // 2. NUCLEAR DATA PROTECTION
          // We force 'rawText' to be a string. This prevents the "White Screen"
          // crash that happens if the AI returns a JSON object instead of text.
          let rawText = "No data received";
          if (res.data && res.data.data) {
            rawText =
              typeof res.data.data === "object"
                ? JSON.stringify(res.data.data, null, 2)
                : String(res.data.data);
          }

          console.log("[*] Final String for UI:", rawText);

          // 3. SUPER SAFE APPEND
          // We use the spread operator to create a NEW array so React notices the change
          const newMessage = {
            role: "assistant",
            content: "✅ **Scan Result:**\n\n" + rawText,
          };
          setMessages((prevMessages) => [...prevMessages, newMessage]);
          console.log("[*] React State Update Called.");
        } catch (err: any) {
          console.error("[X] API Fetch Failed:", err.message);
          const errorMsg = {
            role: "assistant",
            content: "❌ **Scan Failed.** Check the console (F12) for details.",
          };
          setMessages((prev) => [...prev, errorMsg]);
        } finally {
          setLoading(false);
          console.log("[*] Loading State Cleared.");
        }
      },
      "image/jpeg",
      0.7,
    );
  };

  // Auto-scroll to bottom of chat
  useEffect(() => {
    let currentStream: MediaStream | null = null;

    const startCamera = async () => {
      if (streaming && videoRef.current) {
        try {
          currentStream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" }, // Use 'user' for webcam, 'environment' for phone back camera
            audio: false,
          });
          videoRef.current.srcObject = currentStream;
          // The play() call is the secret to stopping the "dark screen"
          await videoRef.current.play();
        } catch (err) {
          console.error("Camera Error:", err);
          setStreaming(false);
        }
      }
    };

    startCamera();

    // Cleanup: Stop camera when component unmounts or streaming is toggled off
    return () => {
      currentStream?.getTracks().forEach((track) => track.stop());
    };
  }, [streaming]);

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = { role: "user", content: input };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);

    try {
      const formData = new FormData();
      formData.append("prompt", input);
      formData.append("history", JSON.stringify(messages));

      const res = await axios.post(`${API_BASE}/chat`, formData);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: res.data.answer },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "⚠️ API Error: Connection failed." },
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
        responseType: "blob", // Critical for binary files
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
      window.URL.revokeObjectURL(url); // Clean up memory
    } catch (err) {
      console.error("PDF Download Error:", err);
      alert("Connection Error: Is FastAPI running on port 8000?");
    }
  };

  return (
    <div className="flex h-screen bg-slate-50 font-sans text-slate-900">
      {/* --- MAIN CHAT AREA --- */}
      <div className="flex flex-col flex-1 border-r border-slate-200">
        <header className="flex items-center justify-between p-4 bg-white border-b border-slate-200 shadow-sm">
          <div className="flex items-center gap-2">
            <Building2 className="text-blue-600" />
            <h1 className="font-bold text-lg tracking-tight">
              Insurance Policy Assistant
            </h1>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((msg, i) => (
            <div
              key={i}
              className={`flex gap-4 ${msg.role === "user" ? "justify-end" : ""}`}
            >
              {msg.role !== "user" && (
                <Bot className="text-blue-600 mt-1 shrink-0" />
              )}

              <div
                className={`max-w-4xl p-6 rounded-2xl shadow-sm ${msg.role === "user" ? "bg-blue-600 text-white" : "bg-white border border-slate-200"}`}
              >
                {/* --- THE "BEAUTIFUL" BORDERED TABLE FIX --- */}
                <div
                  className={`prose ${msg.role === "user" ? "prose-invert" : "prose-slate"} prose-sm max-w-none 
    prose-table:border prose-table:border-slate-300 prose-table:rounded-lg
    prose-th:bg-slate-100 prose-th:text-slate-900 prose-th:font-bold prose-th:p-3 prose-th:border prose-th:border-slate-300
    prose-td:p-3 prose-td:border prose-td:border-slate-200 prose-td:text-slate-700
    overflow-x-auto`}
                >
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {msg.content}
                  </ReactMarkdown>
                </div>

                {/* PDF Download Button */}
                {msg.role === "assistant" && msg.content.includes("|") && (
                  <button
                    onClick={() => downloadPDF(msg.content)}
                    className="mt-6 flex items-center justify-center gap-2 py-3 w-full border-t border-slate-100 text-[10px] font-black text-blue-600 hover:text-blue-800 uppercase tracking-widest transition-colors"
                  >
                    <FileDown size={14} /> Download Comparison PDF
                  </button>
                )}
              </div>

              {msg.role === "user" && (
                <UserCircle className="text-slate-400 mt-1 shrink-0" />
              )}
            </div>
          ))}

          {/* --- THE THINKING / LOADING SIGN --- */}
          {loading && (
            <div className="flex gap-4 items-center animate-pulse">
              <Bot className="text-blue-400 shrink-0" />
              <div className="bg-slate-200 h-10 w-48 rounded-2xl flex items-center px-4">
                <span className="text-xs font-bold text-slate-500 tracking-widest uppercase">
                  Analyzing Data...
                </span>
              </div>
            </div>
          )}

          <div ref={chatEndRef} />
        </main>

        <footer className="p-4 bg-white border-t border-slate-200">
          <div className="max-w-3xl mx-auto flex gap-4">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Compare my 2024 vs 2026 plans..."
              className="flex-1 p-3 bg-slate-100 border border-transparent rounded-xl focus:bg-white focus:ring-2 focus:ring-blue-500 outline-none transition-all"
            />
            <button
              onClick={handleSend}
              className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-colors shadow-lg"
            >
              <Send size={20} />
            </button>
          </div>
        </footer>
      </div>

      {/* --- RIGHT SIDEBAR: VISION SCANNER --- */}
      <aside className="w-80 bg-white p-6 hidden lg:block border-l border-slate-200">
        <div className="space-y-6 sticky top-6">
          <div className="p-4 bg-blue-50 rounded-2xl border border-blue-100 shadow-sm">
            <h2 className="flex items-center gap-2 font-bold text-blue-900 mb-2">
              <Camera size={18} /> Vision Scanner
            </h2>
            <p className="text-[10px] text-blue-600 mb-4 uppercase font-bold tracking-wider">
              Llama 3.2-Vision Active
            </p>

            {/* The Video Preview Box */}
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

            {/* Action Buttons */}
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
            </div>
          </div>

          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100">
            <h3 className="text-xs font-bold text-slate-500 uppercase tracking-widest mb-2">
              Quick Tip
            </h3>
            <p className="text-xs text-slate-600 leading-relaxed">
              Position your insurance card clearly within the frame. Our AI will
              automatically detect the **Carrier**, **Plan Year**, and **Member
              Tier**.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
