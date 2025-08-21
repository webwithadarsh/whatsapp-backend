import express from "express";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(express.json());

// Supabase client (SERVER KEY वापरा)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// WhatsApp webhook verification (GET)
app.get("/webhook/whatsapp", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];
  if (mode === "subscribe" && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// WhatsApp messages (POST)
app.post("/webhook/whatsapp", (req, res) => {
  console.log("📩 WhatsApp payload:", JSON.stringify(req.body));
  // पुढे इथे Groq parsing + order insert लावू
  res.sendStatus(200);
});

// Health check
app.get("/", (_req, res) => res.send("WhatsApp Backend is running ✅"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
