const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

app.use(express.json({ limit: "4mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname)));

function extractOutputText(response) {
  if (typeof response?.output_text === "string" && response.output_text.trim()) {
    return response.output_text.trim();
  }

  if (!Array.isArray(response?.output)) return "";

  const chunks = [];
  for (const item of response.output) {
    if (!Array.isArray(item?.content)) continue;
    for (const content of item.content) {
      if (typeof content?.text === "string") chunks.push(content.text);
    }
  }

  return chunks.join("\n").trim();
}

function requireApiKey(res) {
  if (openai) return true;
  res.status(500).json({
    error: "OPENAI_API_KEY tanımlı değil. Lütfen .env dosyasını kontrol edin.",
  });
  return false;
}

async function runAnalysis({ instruction, articleText, context }) {
  const contextBlock = context
    ? `Bağlam:\n${JSON.stringify(context, null, 2)}\n\n`
    : "";

  const systemPrompt = [
    "Sen kıdemli bir solar mühendislik teknik editörüsün.",
    "Dil: Türkçe.",
    "Ton: teknik, sakin, profesyonel.",
    "Pazarlama dili kullanma.",
    "Cümle başlangıçlarında mümkünse şu kalıbı koru: Bu çalışmada..., Analiz kapsamında..., Varsayımlar doğrultusunda..., Elde edilen bulgular..., Teknik değerlendirme sonucunda...",
    "Yanıtı mühendislik ekiplerinin doğrudan kullanabileceği şekilde yapılandır.",
  ].join(" ");

  const userPrompt = `${instruction}\n\n${contextBlock}Metin:\n${articleText || ""}`;

  const response = await openai.responses.create({
    model,
    temperature: 0.2,
    input: [
      {
        role: "system",
        content: [{ type: "input_text", text: systemPrompt }],
      },
      {
        role: "user",
        content: [{ type: "input_text", text: userPrompt }],
      },
    ],
  });

  return extractOutputText(response);
}

function parseJsonFromText(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const candidate = text.slice(start, end + 1);
      try {
        return JSON.parse(candidate);
      } catch {
        return null;
      }
    }
    return null;
  }
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    aiEnabled: Boolean(openai),
    model,
    date: new Date().toISOString(),
  });
});

app.post("/api/ai-comment", async (req, res) => {
  if (!requireApiKey(res)) return;

  try {
    const result = await runAnalysis({
      instruction:
        "Mühendislik metnini teknik açıdan yorumla. Önce güçlü tarafları, sonra iyileştirme noktalarını ver. En sonda 3 maddelik uygulanabilir aksiyon listesi üret.",
      articleText: req.body?.articleText,
      context: req.body?.context,
    });

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: `AI yorum hatası: ${error.message}` });
  }
});

app.post("/api/ai-summary", async (req, res) => {
  if (!requireApiKey(res)) return;

  try {
    const result = await runAnalysis({
      instruction:
        "Metin için yönetici özeti üret. En fazla 180 kelime kullan. Çıktıyı 3 başlıkta ver: Amaç, Kritik Bulgular, Karar Önerisi.",
      articleText: req.body?.articleText,
      context: req.body?.context,
    });

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: `AI özet hatası: ${error.message}` });
  }
});

app.post("/api/ai-risk-analysis", async (req, res) => {
  if (!requireApiKey(res)) return;

  try {
    const result = await runAnalysis({
      instruction:
        "Risk analizi oluştur. En az 5 risk maddesi ver. Her maddede: Risk Tanımı, Etki Seviyesi (Düşük/Orta/Yüksek), Olasılık ve Azaltım Önerisi olsun.",
      articleText: req.body?.articleText,
      context: req.body?.context,
    });

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: `AI risk analizi hatası: ${error.message}` });
  }
});

app.post("/api/ai-method-review", async (req, res) => {
  if (!requireApiKey(res)) return;

  try {
    const result = await runAnalysis({
      instruction:
        "Yöntem bölümünü gözden geçir ve geliştir. Önce mevcut yöntemin teknik eksiklerini belirt, sonra geliştirilmiş yöntem akışını adım adım yaz.",
      articleText: req.body?.articleText,
      context: req.body?.context,
    });

    res.json({ result });
  } catch (error) {
    res.status(500).json({ error: `AI yöntem analizi hatası: ${error.message}` });
  }
});

app.post("/api/linkedin-to-article", async (req, res) => {
  if (!requireApiKey(res)) return;

  try {
    const postText = req.body?.postText || "";
    const response = await openai.responses.create({
      model,
      temperature: 0.2,
      input: [
        {
          role: "system",
          content: [
            {
              type: "input_text",
              text:
                "Sen bir solar mühendislik içerik yapılandırma asistanısın. Verilen LinkedIn metnini teknik makale iskeletine dönüştür. Sadece geçerli JSON üret.",
            },
          ],
        },
        {
          role: "user",
          content: [
            {
              type: "input_text",
              text: [
                "Aşağıdaki LinkedIn gönderisini yapılandırılmış teknik makale taslağına dönüştür.",
                "Yalnızca JSON döndür. Alanlar: baslik, kategori, kisaOzet, problemTanimi, teknikBaglam, yontem, analiz, sonuc, teknikCikarimlar.",
                "Metin:",
                postText,
              ].join("\n\n"),
            },
          ],
        },
      ],
    });

    const raw = extractOutputText(response);
    const parsed = parseJsonFromText(raw);

    if (!parsed) {
      return res.status(500).json({
        error: "AI çıktısı JSON formatında alınamadı.",
      });
    }

    res.json(parsed);
  } catch (error) {
    res.status(500).json({ error: `LinkedIn dönüşüm hatası: ${error.message}` });
  }
});

app.get("*", (req, res, next) => {
  if (req.path.startsWith("/api/")) return next();
  const requested = path.join(__dirname, req.path);
  if (path.extname(req.path)) return res.sendFile(requested);
  return res.sendFile(path.join(__dirname, "index.html"));
});

app.listen(port, () => {
  console.log(`Sunucu çalışıyor: http://localhost:${port}`);
});
