import type { NextApiRequest, NextApiResponse } from "next";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") return res.status(405).json({ ok: false });
  try {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
    if (!token || !secret) return res.status(500).json({ ok: false, error: "Telegram env missing" });

    const webhookUrl = "https://dslastwork-denisshuvayev48-1836.vercel.app/api/telegram";
    const tg = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        url: webhookUrl,
        secret_token: secret,
        allowed_updates: ["message"],
        drop_pending_updates: true
      })
    });
    const data = await tg.json();
    return res.status(tg.ok ? 200 : 502).json({
      ok: Boolean(data?.ok),
      description: data?.description ?? null,
      webhookUrl
    });
  } catch (e: any) {
    return res.status(500).json({ ok: false, error: e?.message ?? "Unknown error" });
  }
}
