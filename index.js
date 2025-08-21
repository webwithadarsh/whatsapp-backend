import express from "express";
import fetch from "node-fetch";

const app = express();
app.use(express.json());

// ✅ Root
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running!");
});

// ✅ Webhook verification (Meta setup साठी)
app.get("/webhook", (req, res) => {
  const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

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

// ✅ Incoming messages
app.post("/webhook", async (req, res) => {
  const body = req.body;

  console.log("Incoming webhook:", JSON.stringify(body, null, 2));

  if (body.object) {
    if (
      body.entry &&
      body.entry[0].changes &&
      body.entry[0].changes[0].value.messages &&
      body.entry[0].changes[0].value.messages[0]
    ) {
      const phone_number_id =
        body.entry[0].changes[0].value.metadata.phone_number_id;
      const from = body.entry[0].changes[0].value.messages[0].from; // sender wa_id
      const msg_body =
        body.entry[0].changes[0].value.messages[0].text.body;

      console.log(`📩 Message from ${from}: ${msg_body}`);

      // ✅ Reply back using correct phone_number_id
      try {
        const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;

        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messaging_product: "whatsapp",
            to: from,
            text: { body: `You said: ${msg_body}` },
          }),
        });

        const data = await response.json();
        console.log("Message sent ✅:", data);
      } catch (err) {
        console.error("Error sending message:", err);
      }
    }
    res.sendStatus(200);
  } else {
    res.sendStatus(404);
  }
});

// ✅ Port binding for Render
const PORT = process.env.PORT || 10000;
app.listen(PORT, () =>
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`)
);
