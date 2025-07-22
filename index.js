import "dotenv/config";
import express from "express";
import cors from "cors";
import bodyParser from "body-parser";
import { GoogleGenAI } from "@google/genai";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const ai = new GoogleGenAI({ apiKey: GEMINI_API_KEY });
const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "2mb" }));

console.log("GEMINI_API_KEY:", GEMINI_API_KEY);
app.post("/api/tts", async (req, res) => {
  try {
    const { text, voiceName = "Kore" } = req.body;
    if (!text) return res.status(400).json({ error: "Missing text" });

    const t0 = Date.now();
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-tts",
      contents: [{ parts: [{ text }] }],
      config: {
        responseModalities: ["AUDIO"],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName },
          },
        },
      },
    });
    const t1 = Date.now();
    console.log(`[TTS] Gemini API call took ${(t1 - t0) / 1000}s`);

    const data =
      response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!data)
      return res.status(500).json({ error: "No audio returned from Gemini" });

    // Decode base64 to Buffer (LINEAR16 PCM)
    const pcmBuffer = Buffer.from(data, "base64");

    // WAV header parameters
    const numChannels = 1; // mono
    const sampleRate = 24000; // Gemini TTS default is 24kHz
    const bitsPerSample = 16;
    const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
    const blockAlign = (numChannels * bitsPerSample) / 8;
    const wavHeader = Buffer.alloc(44);

    // ChunkID 'RIFF'
    wavHeader.write("RIFF", 0);
    // ChunkSize (file size - 8)
    wavHeader.writeUInt32LE(36 + pcmBuffer.length, 4);
    // Format 'WAVE'
    wavHeader.write("WAVE", 8);
    // Subchunk1ID 'fmt '
    wavHeader.write("fmt ", 12);
    // Subchunk1Size (16 for PCM)
    wavHeader.writeUInt32LE(16, 16);
    // AudioFormat (1 = PCM)
    wavHeader.writeUInt16LE(1, 20);
    // NumChannels
    wavHeader.writeUInt16LE(numChannels, 22);
    // SampleRate
    wavHeader.writeUInt32LE(sampleRate, 24);
    // ByteRate
    wavHeader.writeUInt32LE(byteRate, 28);
    // BlockAlign
    wavHeader.writeUInt16LE(blockAlign, 32);
    // BitsPerSample
    wavHeader.writeUInt16LE(bitsPerSample, 34);
    // Subchunk2ID 'data'
    wavHeader.write("data", 36);
    // Subchunk2Size (pcm data length)
    wavHeader.writeUInt32LE(pcmBuffer.length, 40);

    // Concatenate header + PCM data
    const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

    // Set headers for WAV file download
    res.set({
      "Content-Type": "audio/wav",
      "Content-Disposition": 'attachment; filename="output.wav"',
      "Content-Length": wavBuffer.length,
    });
    const t2 = Date.now();
    console.log(
      `[TTS] Response sent in ${(t2 - t1) / 1000}s (total: ${
        (t2 - t0) / 1000
      }s)`
    );
    // Send the WAV buffer as binary
    res.send(wavBuffer);
  } catch (err) {
    res.status(500).json({ error: "TTS failed", details: err.message });
  }
});

const PORT = process.env.PORT || 4300;
app.listen(PORT, () => {
  console.log(`Gemini TTS server listening on port ${PORT}`);
});
