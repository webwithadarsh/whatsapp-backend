import express from "express";
import fetch from "node-fetch";
import pkg from "@supabase/supabase-js";

const { createClient } = pkg;

const app = express();
app.use(express.json());

// Supabase init
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Home route
app.get("/", (req, res) => {
  res.send("🚀 WhatsApp Backend is running with Supabase!");
});

// Webhook verification
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

// Handle incoming messages
app.post("/webhook", async (req, res) => {
  try {
    console.log("Incoming webhook:", JSON.stringify(req.body, null, 2));

    const entry = req.body.entry?.[0]?.changes?.[0]?.value;
    const phone_number_id = entry?.metadata?.phone_number_id;
    const from = entry?.messages?.[0]?.from; // User phone number
    const msg_body = entry?.messages?.[0]?.text?.body?.trim().toLowerCase();

    if (msg_body && from) {
      console.log(`📩 Message from ${from}: ${msg_body}`);

      let replyText = "🙏 Sorry, I didn’t understand that. Try 'list', 'order', or 'status'.";

      // Flow 1: List Products
      if (msg_body === "list") {
        const { data: products, error } = await supabase
          .from("products")
          .select("name, price, stock");

        if (error) {
          console.error("❌ Supabase error:", error);
          replyText = "⚠️ Failed to fetch products.";
        } else if (products.length === 0) {
          replyText = "📦 No products available.";
        } else {
          replyText = "🛒 Available products:\n";
          products.forEach((p, i) => {
            replyText += `${i + 1}. ${p.name} – ₹${p.price} (${p.stock} left)\n`;
          });
        }
      }

      // Flow 2: Create Order + Reduce Stock
      else if (msg_body.startsWith("order")) {
        // Example: order rice 2,wheat 1
        const items = msg_body.replace("order", "").trim();
        if (!items) {
          replyText = "⚠️ Usage: order rice 2,wheat 1";
        } else {
          const orderItems = items.split(",").map((item) => {
            const [name, qty] = item.trim().split(" ");
            return { name, qty: parseInt(qty) || 1 };
          });

          // Fetch product prices & stock
          const { data: products } = await supabase
            .from("products")
            .select("id, name, price, stock");

          let total = 0;
          let orderDetails = [];
          let stockUpdateErrors = [];

          for (let oi of orderItems) {
            const product = products.find(
              (p) => p.name.toLowerCase() === oi.name.toLowerCase()
            );
            if (!product) {
              stockUpdateErrors.push(`❌ ${oi.name} not found`);
              continue;
            }
            if (product.stock < oi.qty) {
              stockUpdateErrors.push(`⚠️ Not enough stock for ${product.name} (only ${product.stock} left)`);
              continue;
            }

            total += product.price * oi.qty;
            orderDetails.push({
              product_id: product.id,
              quantity: oi.qty,
              price: product.price,
            });
          }

          if (orderDetails.length === 0) {
            replyText = "⚠️ Invalid order:\n" + stockUpdateErrors.join("\n");
          } else {
            // Insert order
            const { data: newOrder, error } = await supabase
              .from("orders")
              .insert([
                {
                  customer_number: from,
                  status: "pending",
                  total,
                  items: orderDetails,
                },
              ])
              .select()
              .single();

            if (error) {
              console.error("❌ Supabase error:", error);
              replyText = "⚠️ Failed to create order.";
            } else {
              // Reduce stock for each product ordered
              for (let oi of orderDetails) {
                const { error: stockError } = await supabase
                  .from("products")
                  .update({ stock: supabase.rpc("greatest", { a: 0, b: oi.stock - oi.quantity }) }) // fallback safe
                  .eq("id", oi.product_id);

                if (stockError) {
                  console.error("❌ Stock update failed:", stockError);
                } else {
                  // simpler: direct reduce
                  await supabase
                    .from("products")
                    .update({ stock: products.find(p => p.id === oi.product_id).stock - oi.quantity })
                    .eq("id", oi.product_id);
                }
              }

              replyText = `✅ Order created!\n🆔 ID: ${newOrder.id}\n💰 Total: ₹${total}`;
              if (stockUpdateErrors.length > 0) {
                replyText += "\n\n⚠️ Notes:\n" + stockUpdateErrors.join("\n");
              }
            }
          }
        }
      }

      // Flow 3: Check Status
      else if (msg_body.startsWith("status")) {
        const orderId = msg_body.replace("status", "").trim();
        if (!orderId) {
          replyText = "⚠️ Usage: status <order_id>";
        } else {
          const { data: order, error } = await supabase
            .from("orders")
            .select("id, status, total")
            .eq("id", orderId)
            .single();

          if (error || !order) {
            replyText = "⚠️ Order not found.";
          } else {
            replyText = `📦 Order ${order.id}\nStatus: ${order.status}\nTotal: ₹${order.total}`;
          }
        }
      }

      // Send reply back to WhatsApp
      const url = `https://graph.facebook.com/v18.0/${phone_number_id}/messages?access_token=${process.env.WHATSAPP_TOKEN}`;
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to: from,
          text: { body: replyText },
        }),
      });

      const data = await response.json();
      console.log("Message sent ✅:", data);
    }
  } catch (err) {
    console.error("❌ Error handling webhook:", err);
  }

  res.sendStatus(200);
});

// Start server
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 WhatsApp Backend running on port ${PORT}`);
});
