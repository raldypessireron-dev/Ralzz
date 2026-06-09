// Vercel Serverless Function — proxies the Anthropic Messages API (with web search).
// The ANTHROPIC_API_KEY stays on the server; the browser never sees it (no CORS, no key leak).
// Configure ANTHROPIC_API_KEY in: Vercel → Project → Settings → Environment Variables.

export const config = { maxDuration: 60 };

const MODEL = "claude-sonnet-4-6"; // ganti bila perlu (mis. claude-opus-4-8)

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed. Use POST." });
    return;
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({
      error:
        "ANTHROPIC_API_KEY belum di-set. Tambahkan di Vercel → Settings → Environment Variables, lalu redeploy.",
    });
    return;
  }

  // robust body parse
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const timeframe = (body && body.timeframe) || "1H";
  const symbol = (body && body.symbol) || "XAU/USD";

  const prompt = `Kamu analis trading ${symbol} (gold spot) profesional untuk MetaTrader 5 / OANDA.
Gunakan web search untuk menarik data LIVE saat ini: harga ${symbol} sekarang, range hari ini, level support/resistance kunci, kondisi RSI/MACD/MA/Bollinger di timeframe ${timeframe}, dan sentimen global (USD/DXY, ekspektasi suku bunga Fed, yield Treasury AS, geopolitik).

Lakukan analisa BERDASARKAN indikator berikut di timeframe ${timeframe}:
- RSI(14): momentum overbought/oversold
- MACD(12,26,9): momentum & perubahan tren
- MA50 & MA200: arah tren menengah & utama (termasuk posisi harga vs MA dan golden/death cross)
- Bollinger Bands(20, 2.0): volatilitas & level ekstrem (entry idealnya dekat band / level konfluensi)

Tentukan SATU rekomendasi trade terbaik. Entry & SL HARUS berbasis level nyata (support/resistance, Bollinger band, MA) — jangan mengarang angka acak. R:R hitung dari entry, SL, dan TP1.

Balas HANYA JSON mentah (tanpa markdown, tanpa backtick, tanpa teks lain) dengan bentuk PERSIS:
{"price":number,"asOf":"YYYY-MM-DD","keyLevels":{"support":[number,number,number],"resistance":[number,number,number]},"sentiment":{"bias":"bullish|bearish|neutral","score":number(0-100, 0=sangat bearish 100=sangat bullish),"dxy":"frasa singkat ID","fed":"frasa singkat ID","yields":"frasa singkat ID","geopolitics":"frasa singkat ID","summaryId":"<=40 kata Bahasa Indonesia","summaryEn":"<=40 words English"},"analysis":{"side":"BUY|SELL|WAIT","confidence":number(0-100),"entryLow":number,"entryHigh":number,"sl":number,"tp1":number,"tp2":number,"rr":number,"conclusionId":"2-4 kalimat Bahasa Indonesia: kenapa entry di area ini, konfluensi indikator (RSI/MACD/MA/Bollinger) yang mendukung, & titik invalidasi/risiko","conclusionEn":"2-4 sentences English"}}`;

  try {
    const anthropicRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 2000,
        messages: [{ role: "user", content: prompt }],
        tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 6 }],
      }),
    });

    const json = await anthropicRes.json();

    if (!anthropicRes.ok) {
      res.status(anthropicRes.status).json({
        error:
          (json && json.error && json.error.message) ||
          "Anthropic API error. Pastikan API key valid & Web Search aktif di Console.",
      });
      return;
    }

    const text = (json.content || [])
      .map((b) => (b && b.type === "text" ? b.text : ""))
      .filter(Boolean)
      .join("\n");

    const match = text.match(/\{[\s\S]*\}/);
    if (!match) {
      res.status(502).json({ error: "Model tidak mengembalikan JSON yang valid." });
      return;
    }
    const parsed = JSON.parse(match[0]);
    res.status(200).json(parsed);
  } catch (e) {
    res.status(500).json({ error: e.message || "Server error." });
  }
}
