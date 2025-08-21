import express from "express";
import bodyParser from "body-parser";
import dotenv from "dotenv";
import fetch from "node-fetch";

dotenv.config();

const app = express();
app.use(bodyParser.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN || "my_verify_token";
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;

// ✅ Step 1: Webhook Verification
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("Webhook verified ✅");
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  }
});

// ✅ Step 2: Webhook to receive messages
app.post("/webhook", (req, res) => {
  const body = req.body;

  console.log("Incoming webhook:", JSON.stringify(body, null, 2));

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const message = body.entry[0].changes[0].value.messages[0];
      const from = message.from; // Customer phone number
      const text = message.text?.body || "";

      console.log(`📩 Message from ${from}: ${text}`);

      // reply back to user
      sendMessage(from, "Hi 👋 thanks for your message!");
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ✅ Step 3: Send Message function
async function sendMessage(to, text) {
  const url = "https://graph.facebook.com/v20.0/me/messages";

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: to,
        text: { body: text }
      })
    });

    const data = await response.json();
    console.log("Message sent ✅:", data);
  } catch (error) {
    console.error("Error sending message:", error);
  }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
