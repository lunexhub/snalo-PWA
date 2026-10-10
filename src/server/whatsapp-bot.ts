// Snalo WhatsApp Chatbot Engine
// Integrates Meta WhatsApp Business Cloud API, Supabase, and OpenAI (gpt-4o-mini)

const SUPABASE_URL =
  process.env.SUPABASE_URL || "https://dcmuughdramlrfqbkqli.supabase.co";
const SUPABASE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_KEY ||
  "";

const META_ACCESS_TOKEN =
  process.env.META_ACCESS_TOKEN ||
  process.env.META_TOKEN ||
  "";

const OPENAI_API_KEY =
  process.env.OPENAI_API_KEY ||
  "";

const VERIFY_TOKEN =
  process.env.WHATSAPP_VERIFY_TOKEN || "snalo_verify_token_2026";

const APP_URL = "https://snalo-pwa.vercel.app";

// Default phone number ID fallback if needed
let lastKnownPhoneNumberId = "122093671472491331";

export async function handleApiRequest(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;

  // 1. Webhook Verification (GET /api/webhook or /api/whatsapp)
  if ((path === "/api/webhook" || path === "/api/whatsapp") && request.method === "GET") {
    const mode = url.searchParams.get("hub.mode");
    const token = url.searchParams.get("hub.verify_token");
    const challenge = url.searchParams.get("hub.challenge");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
      console.log("[WhatsApp Webhook] Verification successful");
      return new Response(challenge ?? "", {
        status: 200,
        headers: { "Content-Type": "text/plain" },
      });
    }
    return new Response("Forbidden", { status: 403 });
  }

  // 2. Incoming WhatsApp Message Handler (POST /api/webhook or /api/whatsapp)
  if ((path === "/api/webhook" || path === "/api/whatsapp") && request.method === "POST") {
    try {
      const body = await request.json();
      // Await processing in serverless environment before returning response
      await processIncomingWhatsAppPayload(body);
      return new Response(JSON.stringify({ status: "EVENT_RECEIVED" }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Webhook POST Error]", err);
      return new Response("Bad Request", { status: 400 });
    }
  }

  // 3. Webview Order Placement Handler (POST /api/order)
  if (path === "/api/order" && request.method === "POST") {
    try {
      const order = await request.json();
      const saved = await saveOrderToSupabase(order);

      // If customer phone is present, send WhatsApp confirmation message
      if (order.customerPhone) {
        await sendOrderConfirmationToCustomer(order).catch((e) =>
          console.error("[Order WhatsApp Notification Error]", e)
        );
      }

      return new Response(JSON.stringify({ success: true, order: saved }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    } catch (err) {
      console.error("[Order API Error]", err);
      return new Response(JSON.stringify({ error: String(err) }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  // 4. Health & Bot Status Check (GET /api/bot-status)
  if (path === "/api/bot-status" && request.method === "GET") {
    return new Response(
      JSON.stringify({
        status: "online",
        bot: "Snalo Fast Delivery Bot",
        model: "gpt-4o-mini",
        supabase_connected: !!SUPABASE_KEY,
        meta_connected: !!META_ACCESS_TOKEN,
        webhook_verify_token: VERIFY_TOKEN,
        last_phone_number_id: lastKnownPhoneNumberId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  // 5. Update Bot Config (POST /api/bot-config)
  if (path === "/api/bot-config" && request.method === "POST") {
    try {
      const data = await request.json();
      if (data.phoneNumberId) {
        lastKnownPhoneNumberId = String(data.phoneNumberId);
        await saveBotConfigKey("phone_number_id", { phone_number_id: data.phoneNumberId });
      }
      return new Response(
        JSON.stringify({ success: true, phoneNumberId: lastKnownPhoneNumberId }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    } catch (e) {
      return new Response(JSON.stringify({ error: String(e) }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }
  }

  return new Response("Not Found", { status: 404 });
}

interface MetaWebhookValue {
  messaging_product?: string;
  metadata?: {
    display_phone_number?: string;
    phone_number_id?: string;
  };
  contacts?: Array<{
    profile?: { name?: string };
    wa_id?: string;
  }>;
  messages?: Array<{
    from: string;
    id: string;
    timestamp: string;
    type: string;
    text?: { body: string };
    interactive?: {
      button_reply?: { id: string; title: string };
      list_reply?: { id: string; title: string };
    };
  }>;
}

async function processIncomingWhatsAppPayload(payload: {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      value?: MetaWebhookValue;
      field?: string;
    }>;
  }>;
}) {
  if (!payload.entry || !payload.entry[0]?.changes) return;

  const value = payload.entry[0].changes[0]?.value;
  if (!value || !value.messages || value.messages.length === 0) return;

  const phoneNumberId = value.metadata?.phone_number_id || lastKnownPhoneNumberId;
  if (value.metadata?.phone_number_id) {
    lastKnownPhoneNumberId = value.metadata.phone_number_id;
  }

  const incomingMessage = value.messages[0];
  const from = incomingMessage.from;
  const customerName = value.contacts?.[0]?.profile?.name || "Friend";

  let userText = "";
  if (incomingMessage.type === "text" && incomingMessage.text?.body) {
    userText = incomingMessage.text.body.trim();
  } else if (incomingMessage.type === "interactive") {
    userText =
      incomingMessage.interactive?.button_reply?.title ||
      incomingMessage.interactive?.list_reply?.title ||
      "";
  }

  if (!userText) return;

  console.log(`[WhatsApp Incoming] From: ${from} (${customerName}) Text: "${userText}"`);

  // 1. Record incoming user message in Supabase
  await recordMessageInSupabase(from, customerName, "user", userText, phoneNumberId, incomingMessage);

  // 2. Fetch conversation context from Supabase (last 8 messages)
  const history = await fetchConversationHistory(from);

  // 3. Generate AI response using OpenAI gpt-4o-mini
  const replyText = await generateAiReply(userText, customerName, from, history);

  // 4. Send reply via Meta WhatsApp API
  await sendWhatsAppTextMessage(phoneNumberId, from, replyText);

  // 5. Record assistant response in Supabase
  await recordMessageInSupabase(from, customerName, "assistant", replyText, phoneNumberId, null);
}

async function generateAiReply(
  userMessage: string,
  customerName: string,
  customerPhone: string,
  history: Array<{ role: string; content: string }>
): Promise<string> {
  const storeLink = `${APP_URL}/?source=whatsapp&phone=${customerPhone}&name=${encodeURIComponent(customerName)}`;

  const systemPrompt = `You are Snalo, the official ultra-fast AI delivery assistant for Snalo Fast Delivery in Johannesburg, South Africa.

You help customers order groceries, check prices, find fresh foods, and get their orders delivered in 15–20 minutes!

OUR MENU & IN-STOCK GROCERIES:
• Fresh Apples (1 Kg): R 25
• Bananas (1 Kg): R 18
• Potatoes (1 Kg): R 12
• Carrots (500 g): R 10
• Fresh Milk (2 L): R 32
• Cheddar Cheese (400 g): R 55
• Potato Chips (125 g): R 20
• Red Grapes (500 g): R 35

DELIVERY & PAYMENT:
• Delivery Speed: 15–20 minutes
• Delivery Fee: R 15 (FREE delivery on orders over R 150!)
• Payment: Cash on Delivery, WhatsApp Pay, or Card

CUSTOMER DETAILS:
• Name: ${customerName}
• WhatsApp Number: ${customerPhone}
• Interactive Store Link: ${storeLink}

INSTRUCTIONS:
1. Speak in a warm, helpful, energetic South African tone (e.g. use occasional friendly phrases like "Howzit", "Sharp sharp", "No problem at all!").
2. Format cleanly using WhatsApp Markdown (*bold*, bullet points, line breaks).
3. Whenever the user asks to see groceries, wants to buy, or asks how to order, ALWAYS share their personalized 1-tap store link:
   👉 ${storeLink}
4. If the user tells you their order directly (e.g. "I want 2 milk and apples"), calculate the total price including delivery, tell them the total, and provide the store link to confirm delivery address.
5. Keep answers concise, readable on a phone screen, and action-oriented.`;

  const messages = [
    { role: "system", content: systemPrompt },
    ...history.slice(-8).map((m) => ({
      role: m.role === "assistant" ? "assistant" : "user",
      content: m.content,
    })),
    { role: "user", content: userMessage },
  ];

  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        messages,
        temperature: 0.7,
        max_tokens: 450,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error("[OpenAI Error]", res.status, errText);
      return `Hi ${customerName}! 🛒 Welcome to Snalo Fast Delivery!

Tap here to browse groceries and order in 1 tap:
👉 ${storeLink}

We deliver in 15–20 minutes across Johannesburg! 🚀`;
    }

    const data = await res.json();
    return (
      data.choices?.[0]?.message?.content ||
      `Howzit ${customerName}! Tap here to choose your groceries: ${storeLink}`
    );
  } catch (err) {
    console.error("[OpenAI Exception]", err);
    return `Hi ${customerName}! 🛒 Tap here to browse and order fresh groceries:
👉 ${storeLink}

Delivered in 15–20 mins! 🚀`;
  }
}

async function sendWhatsAppTextMessage(phoneNumberId: string, to: string, text: string) {
  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${META_ACCESS_TOKEN}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to,
        type: "text",
        text: {
          preview_url: true,
          body: text,
        },
      }),
    });

    const data = await res.json();
    if (!res.ok) {
      console.error("[Meta API Send Error]", res.status, JSON.stringify(data));
    } else {
      console.log(`[WhatsApp Sent] To: ${to} MsgID: ${data.messages?.[0]?.id}`);
    }
    return data;
  } catch (err) {
    console.error("[Meta API Send Exception]", err);
  }
}

async function sendOrderConfirmationToCustomer(order: {
  orderId?: string;
  customerName?: string;
  customerPhone?: string;
  total?: number;
  items?: Array<{ name: string; quantity: number; price: number }>;
  address?: string;
  paymentMethod?: string;
}) {
  if (!order.customerPhone) return;

  const orderId = order.orderId || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
  const itemsText = (order.items || [])
    .map((item) => `• ${item.name} x${item.quantity}`)
    .join("\n");

  const message = `🎉 *Order Confirmed! #${orderId}*
━━━━━━━━━━━━━━━━━━
Thank you ${order.customerName || "Customer"}! We received your order.

*Items:*
${itemsText || "• Fresh Groceries"}

💵 *Total:* R ${order.total || 0} (${order.paymentMethod || "COD"})
📍 *Address:* ${order.address || "Johannesburg"}
⏱ *Estimated Delivery:* 15–20 Mins by John Rider

Live tracking link:
👉 ${APP_URL}/?screen=tracking&order=${orderId}`;

  await sendWhatsAppTextMessage(lastKnownPhoneNumberId, order.customerPhone, message);
}

async function recordMessageInSupabase(
  phone: string,
  name: string,
  role: "user" | "assistant" | "system",
  content: string,
  phoneNumberId: string,
  rawPayload: unknown
) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/whatsapp_messages`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        phone,
        name,
        role,
        content,
        phone_number_id: phoneNumberId,
        raw_payload: rawPayload ? rawPayload : null,
      }),
    });
  } catch (err) {
    console.error("[Supabase Message Record Error]", err);
  }
}

async function fetchConversationHistory(
  phone: string
): Promise<Array<{ role: string; content: string }>> {
  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/whatsapp_messages?phone=eq.${phone}&order=created_at.desc&limit=8&select=role,content`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      }
    );
    if (!res.ok) return [];
    const data = (await res.json()) as Array<{ role: string; content: string }>;
    return data.reverse();
  } catch {
    return [];
  }
}

async function saveOrderToSupabase(order: {
  orderId?: string;
  customerPhone?: string;
  customerName?: string;
  address?: string;
  items?: unknown;
  subtotal?: number;
  deliveryFee?: number;
  total?: number;
  paymentMethod?: string;
}) {
  try {
    const orderId = order.orderId || `SN-${Math.floor(1000 + Math.random() * 9000)}`;
    const res = await fetch(`${SUPABASE_URL}/rest/v1/orders`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        id: orderId,
        phone: order.customerPhone || null,
        customer_name: order.customerName || "Customer",
        delivery_address: order.address || "Johannesburg",
        items: order.items || [],
        subtotal: order.subtotal || 0,
        delivery_fee: order.deliveryFee || 0,
        total: order.total || 0,
        payment_method: order.paymentMethod || "COD",
        status: "placed",
      }),
    });
    return await res.json();
  } catch (err) {
    console.error("[Supabase Save Order Error]", err);
    return order;
  }
}

async function saveBotConfigKey(key: string, value: unknown) {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/bot_settings`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates",
      },
      body: JSON.stringify({ key, value }),
    });
  } catch (err) {
    console.error("[Supabase Bot Config Error]", err);
  }
}

