import express from "express";
import { AccessToken } from "livekit-server-sdk";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const LIVEKIT_URL = process.env.LIVEKIT_URL;
const LIVEKIT_API_KEY = process.env.LIVEKIT_API_KEY;
const LIVEKIT_API_SECRET = process.env.LIVEKIT_API_SECRET;

app.post("/api/token", async (req, res) => {
  try {
    if (!LIVEKIT_URL || !LIVEKIT_API_KEY || !LIVEKIT_API_SECRET) {
      return res.status(503).json({
        error: "کلاس هنوز به سرویس تماس زنده وصل نشده است. مدیر سایت باید تنظیمات LiveKit را کامل کند."
      });
    }
    const { room, name, role } = req.body || {};
    const cleanRoom = String(room || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 60);
    const cleanName = String(name || "").trim().slice(0, 40);
    if (!cleanRoom || !cleanName) {
      return res.status(400).json({ error: "نام و کد کلاس را وارد کن." });
    }
    // Teacher role is intentionally not granted based only on a client-side label.
    // Set TEACHER_CODE on the server and share it privately with the teacher.
    const isTeacher = role === "teacher" &&
      process.env.TEACHER_CODE &&
      String(req.body.teacherCode || "") === process.env.TEACHER_CODE;
    const identity = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const token = new AccessToken(LIVEKIT_API_KEY, LIVEKIT_API_SECRET, {
      identity,
      name: cleanName,
      ttl: "2h"
    });
    token.addGrant({
      roomJoin: true,
      room: cleanRoom,
      canPublish: true,
      canSubscribe: true,
      canPublishData: true
    });
    res.json({
      token: await token.toJwt(),
      serverUrl: LIVEKIT_URL,
      room: cleanRoom,
      name: cleanName,
      role: isTeacher ? "teacher" : "student"
    });
  } catch (e) {
    console.error("Token error:", e);
    res.status(500).json({ error: "ساخت اتصال کلاس ناموفق بود. تنظیمات سرور را بررسی کن." });
  }
});

app.get("*", (_req, res) => res.sendFile(path.join(__dirname, "public", "index.html")));
app.listen(PORT, () => console.log(`Classroom app running on port ${PORT}`));
