import "dotenv/config";
import { GoogleGenAI, Modality } from "@google/genai";
import http from "http";
import { WebSocketServer } from "ws";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });

// Create lightweight HTTP server optimized for WebSocket only
const server = http.createServer();

// High-performance WebSocket server for real-time TTS streaming
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  console.log("[WS] New client connected");

  ws.on("message", async (message) => {
    try {
      const data = JSON.parse(message.toString());
      const { text } = data;

      if (!text || typeof text !== "string") {
        ws.send(JSON.stringify({ error: "Missing or invalid text" }));
        return;
      }

      console.log(`[WS] Processing TTS for: "${text.substring(0, 50)}..."`);
      await handleLiveStreamingTTS(ws, text);
    } catch (e) {
      console.error("[WS] Error processing message:", e.message);
      ws.send(JSON.stringify({ error: "Invalid message format" }));
    }
  });

  ws.on("close", () => {
    console.log("[WS] Client disconnected");
  });

  ws.on("error", (error) => {
    console.error("[WS] WebSocket error:", error);
  });
});

async function handleLiveStreamingTTS(ws, text) {
  const responseQueue = [];
  let session;

  // Check if we should use mock mode for testing
  const USE_MOCK_MODE = !GEMINI_API_KEY || GEMINI_API_KEY.includes('your-api-key') || process.env.MOCK_MODE === 'true';

  if (USE_MOCK_MODE) {
    console.log("[MOCK] Using mock TTS response for testing");
    
    // Send status
    ws.send(JSON.stringify({ type: "status", message: "connected" }));
    
    // Simulate processing delay
    setTimeout(() => {
      // Send mock audio response
      const mockResponse = `Thank you for saying: "${text}". This is a mock response while your Gemini API is being configured.`;
      
      ws.send(JSON.stringify({
        type: "complete",
        totalChunks: 0,
        mockResponse: mockResponse
      }));
    }, 1000);
    
    return;
  }

  function waitMessage(timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
      const start = Date.now();
      const check = () => {
        if (responseQueue.length > 0) {
          resolve(responseQueue.shift());
        } else if (Date.now() - start > timeoutMs) {
          reject(new Error("Timeout waiting for Gemini response"));
        } else {
          setTimeout(check, 10); // Reduced interval for better responsiveness
        }
      };
      check();
    });
  }

  async function streamAudioToClient() {
    let done = false;
    let chunkCount = 0;

    try {
      while (!done) {
        const message = await waitMessage();

        // Forward audio chunks immediately to minimize latency
        if (message.data) {
          chunkCount++;
          ws.send(
            JSON.stringify({
              type: "audio",
              data: message.data,
              chunk: chunkCount,
            })
          );
        }

        if (message.serverContent && message.serverContent.turnComplete) {
          done = true;
          ws.send(
            JSON.stringify({
              type: "complete",
              totalChunks: chunkCount,
            })
          );
        }
      }
    } catch (err) {
      console.error("[WS] Streaming error:", err.message);
      ws.send(
        JSON.stringify({
          type: "error",
          error: err.message,
        })
      );
    }
  }

  try {
    // Check if API key is available and try to connect
    if (!GEMINI_API_KEY || GEMINI_API_KEY === "your-api-key-here") {
      throw new Error("No valid API key configured");
    }

    session = await ai.live.connect({
      model: "gemini-2.5-flash-preview-native-audio-dialog",
      callbacks: {
        onopen: () => {
          console.log("[Gemini] Live session opened");
          ws.send(JSON.stringify({ type: "status", message: "connected" }));
        },
        onmessage: (message) => {
          responseQueue.push(message);
        },
        onerror: (e) => {
          console.error("[Gemini] Live session error:", e.message);
          ws.send(
            JSON.stringify({
              type: "error",
              error: `Gemini API error: ${e.message}`,
            })
          );
        },
        onclose: (e) => {
          console.log("[Gemini] Live session closed:", e?.reason);
        },
      },
      config: {
        responseModalities: [Modality.AUDIO],
        systemInstruction:
          "You are a helpful assistant. Respond in a friendly, conversational tone.",
      },
    });

    // Send text to Gemini and start streaming
    session.sendRealtimeInput({ text });
    await streamAudioToClient();
  } catch (error) {
    console.error("[WS] Failed to establish Gemini session:", error.message);

    // Send a more informative error message
    let errorMessage = error.message;
    if (error.message.includes("quota") || error.message.includes("billing")) {
      errorMessage =
        "Gemini API quota exceeded. Please check your billing and quota limits.";
    } else if (error.message.includes("API key")) {
      errorMessage =
        "Invalid or missing Gemini API key. Please check your .env file.";
    }

    ws.send(
      JSON.stringify({
        type: "error",
        error: errorMessage,
      })
    );
  } finally {
    if (session) {
      session.close();
    }
  }
}

console.log("GEMINI_API_KEY configured:", GEMINI_API_KEY ? "✓" : "✗");

const PORT = process.env.PORT || 4300;
server.listen(PORT, () => {
  console.log(
    `🚀 High-performance TTS WebSocket server running on port ${PORT}`
  );
  console.log(`📡 WebSocket endpoint: ws://localhost:${PORT}`);
  console.log(`🎤 Ready for real-time audio streaming!`);
});
