import express from "express";
import bodyParser from "body-parser";
import fetch from "node-fetch";
import dotenv from "dotenv";
import pkg from "@supabase/supabase-js";

dotenv.config();
const { createClient } = pkg;

const app = express();
app.use(bodyParser.json());

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;

// ✅ WhatsApp message send function
async function sendMessage(to, text) {
  const url = `https://graph.facebook.com/v19.0/${PHONE_NUMBER_ID}/messages`;

  const body = {
    messaging_product: "whatsapp",
    to,
    text: { body: text },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${WHATSAPP_TOKEN}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (data.error) console.error("Send message error:", data.error);
}

// ✅ Webhook verify
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token && mode === "subscribe" && token === VERIFY_TOKEN) {
    res.status(200).send(challenge);
  } else {
    res.sendStatus(403);
  }
});

// ✅ Webhook receive
app.post("/webhook", async (req, res) => {
  console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

  if (req.body.entry?.[0]?.changes?.[0]?.value?.messages) {
    const message = req.body.entry[0].changes[0].value.messages[0];
    const from = message.from;
    const msg_body = message.text?.body?.trim();

    if (msg_body) {
      let reply = "❌ Sorry, I didn't understand.";

      // 🛒 ORDER COMMAND
      if (msg_body.toLowerCase().startsWith("order")) {
        try {
          const text = msg_body.replace("order", "").trim();
          const parts = text.split(",").map((p) => p.trim());

          let total = 0;
          let orderItems = [];

          for (let p of parts) {
            const tokens = p.split(" ");
            if (tokens.length < 2) continue;

            const productName = tokens[0].toLowerCase();
            const quantity = parseInt(tokens[1]);

            const { data: product, error: productError } = await supabase
              .from("products")
              .select("id, name, price")
              .ilike("name", productName)
              .single();

            if (!product || productError) continue;

            const price = product.price * quantity;
            total += price;

            orderItems.push({
              product_id: product.id,
              product_name: product.name,
              quantity,
              price,
            });
          }

          if (orderItems.length === 0) {
            reply = "❌ Could not find any valid products in your order.";
          } else {
            const { data: order, error: orderError } = await supabase
              .from("orders")
              .insert([{ customer_phone: from, total, status: "pending" }])
              .select()
              .single();

            if (orderError) {
              console.error("Order insert error:", orderError);
              reply = "❌ Failed to create order.";
            } else {
              const itemsToInsert = orderItems.map((i) => ({
                order_id: order.id,
                product_id: i.product_id,
                product_name: i.product_name,
                quantity: i.quantity,
                price: i.price,
              }));

              const { error: itemsError } = await supabase
                .from("order_items")
                .insert(itemsToInsert);

              if (itemsError) {
                console.error("Order items insert error:", itemsError);
                reply = "⚠️ Order created but items failed to add.";
              } else {
                let itemsList = orderItems
                  .map((i) => `${i.product_name} x ${i.quantity} = ₹${i.price}`)
                  .join("\n");

                reply = `✅ Order Created!\nID: ${order.id}\nStatus: pending\nTotal: ₹${total}\nItems:\n${itemsList}`;
              }
            }
          }
        } catch (err) {
          console.error("Order creation exception:", err);
          reply = "❌ Error while creating order.";
        }
      }

      // 📦 STATUS COMMAND
      else if (msg_body.toLowerCase().startsWith("status")) {
        const parts = msg_body.split(" ");
        if (parts.length < 2) {
          reply = "❌ Please provide order id. Example: status <order_id>";
        } else {
          const orderId = parts[1].trim();

          const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("id, status, total")
            .eq("id", orderId)
            .single();

          if (orderError || !order) {
            reply = `❌ Order not found with id: ${orderId}`;
          } else {
            const { data: items } = await supabase
              .from("order_items")
              .select("product_name, quantity, price")
              .eq("order_id", orderId);

            let itemsList = "None";
            if (items && items.length > 0) {
              itemsList = items
                .map((i) => `${i.product_name} x ${i.quantity} = ₹${i.price}`)
                .join("\n");
            }

            reply = `📦 Order Status\nID: ${order.id}\nStatus: ${order.status}\nTotal: ₹${order.total}\nItems:\n${itemsList}`;
          }
        }
      }

      await sendMessage(from, reply);
    }
  }

  res.sendStatus(200);
});

// ✅ Start server
app.get("/", (req, res) => res.send("🚀 WhatsApp Backend is running!"));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on ${PORT}`));
