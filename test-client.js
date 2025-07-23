import WebSocket from "ws";
import fs from "fs";

const ws = new WebSocket("ws://localhost:4300");

let audioChunks = [];
let chunkCount = 0;

ws.on("open", function open() {
  console.log("✅ Connected to TTS server");

  // Send text for TTS
  const message = {
    text: "Hello! This is a test of the high-performance streaming TTS server. How does it sound?",
  };
  ws.send(JSON.stringify(message));
  console.log("📤 Sent text:", message.text);
});

ws.on("message", function incoming(data) {
  try {
    const message = JSON.parse(data);

    switch (message.type) {
      case "status":
        console.log("📊 Status:", message.message);
        break;

      case "audio":
        chunkCount++;
        const audioBuffer = Buffer.from(message.data, "base64");
        audioChunks.push(audioBuffer);
        console.log(
          `🎵 Audio chunk #${message.chunk}: ${audioBuffer.length} bytes`
        );
        break;

      case "complete":
        console.log(
          `✅ Stream complete! Received ${message.totalChunks} audio chunks`
        );

        // Save combined audio for testing
        if (audioChunks.length > 0) {
          const combinedAudio = Buffer.concat(audioChunks);
          fs.writeFileSync("test_output.pcm", combinedAudio);
          console.log(
            `💾 Saved ${combinedAudio.length} bytes to test_output.pcm`
          );
        }

        ws.close();
        break;

      case "error":
        console.error("❌ Error:", message.error);
        ws.close();
        break;

      default:
        console.log("📨 Unknown message type:", message.type);
    }
  } catch (e) {
    console.error("❌ Failed to parse message:", e.message);
  }
});

ws.on("close", function close() {
  console.log("🔌 Connection closed");
  process.exit(0);
});

ws.on("error", function error(err) {
  console.error("❌ WebSocket error:", err.message);
  process.exit(1);
});
