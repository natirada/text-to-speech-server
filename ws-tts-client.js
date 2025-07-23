import WebSocket from "ws";
import fs from "fs";

const ws = new WebSocket("ws://localhost:4300/ws/tts");

let audioChunks = [];
let chunkCount = 0;

ws.on("open", function open() {
  ws.send(JSON.stringify({ text: "Hello, this is a streaming TTS test!" }));
});

ws.on("message", function incoming(data) {
  chunkCount++;
  let buf;
  let isJson = false;
  try {
    // Try to parse as JSON (for JSON-wrapped base64)
    const obj = JSON.parse(data);
    if (obj && obj.audio) {
      buf = Buffer.from(obj.audio, "base64");
      isJson = true;
    } else {
      buf = Buffer.from(data, "base64");
    }
  } catch (e) {
    // Not JSON, treat as raw base64
    buf = Buffer.from(data, "base64");
  }
  audioChunks.push(buf);
  console.log(
    `Chunk #${chunkCount}: length=${buf.length}, first bytes=`,
    buf.slice(0, 16),
    isJson ? "(JSON-wrapped)" : "(raw base64)"
  );
  if (chunkCount === 1) {
    fs.writeFileSync("first_chunk.bin", buf);
    console.log("Saved first chunk as first_chunk.bin");
    // Also save the raw data for inspection
    fs.writeFileSync("first_chunk_raw.txt", data);
    if (isJson) {
      fs.writeFileSync(
        "first_chunk_json.txt",
        JSON.stringify(JSON.parse(data), null, 2)
      );
    }
  }
});

ws.on("close", function close() {
  // Combine all chunks and save as a PCM file (or process as needed)
  const audioBuffer = Buffer.concat(audioChunks);
  fs.writeFileSync("streamed_audio.pcm", audioBuffer);
  console.log("Audio stream saved as streamed_audio.pcm");
});
