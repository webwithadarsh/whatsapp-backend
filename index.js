import express from "express";
import bodyParser from "body-parser";
import { createClient } from "@supabase/supabase-js";

const app = express();
app.use(bodyParser.json());

// 🔗 Supabase config (Railway वर आपण variables मध्ये ठेवू)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_KEY
);

// ✅ WhatsApp Webhook route
app.post("/webhook", async (req, res) => {
  console.log("Incoming WhatsApp Message:", req.body);

  // इथे पुढे Groq LLM आणि DB insert logic टाकू
  res.sendStatus(200);
});

// ✅ Root check
app.get("/", (req, res) => {
  res.send("WhatsApp Backend is running 🚀");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
