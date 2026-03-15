const fs = require("fs/promises");
const fsSync = require("fs");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");
const OpenAI = require("openai");
const multer = require("multer");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const model = process.env.OPENAI_MODEL || "gpt-4.1-mini";

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

const CONTENT_ROOT = path.join(__dirname, "content");
const CONTENT_TYPES = {
  blog: {
    kind: "blog",
    folder: "blog",
    indexPath: path.join(CONTENT_ROOT, "blog", "index.json"),
  },
  cases: {
    kind: "cases",
    folder: "cases",
    indexPath: path.join(CONTENT_ROOT, "cases", "index.json"),
  },
};

const WRITE_MODE = String(process.env.CONTENT_WRITE_ENABLED || "").toLowerCase();
const ADMIN_TOKEN = String(process.env.CONTENT_ADMIN_TOKEN || "").trim();
const UPLOAD_MAX_MB = Number(process.env.UPLOAD_MAX_MB) || 512;

const UPLOAD_ROOT = path.join(__dirname, "assets", "uploads");
const uploadStorage = multer.diskStorage({
  destination: (_req, file, callback) => {
    const mime = String(file.mimetype || "").toLowerCase();
    let folder = "files";
    if (mime.startsWith("image/")) folder = "images";
    if (mime.startsWith("video/")) folder = "videos";
    const target = path.join(UPLOAD_ROOT, folder);
    fsSync.mkdirSync(target, { recursive: true });
    callback(null, target);
  },
  filename: (_req, file, callback) => {
    const ext = path.extname(file.originalname || "").toLowerCase();
    const baseName = path
      .basename(file.originalname || "dosya", ext)
      .replace(/[^a-zA-Z0-9_-]/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase();
    const safeName = baseName || "dosya";
    callback(null, `${Date.now()}-${safeName}${ext}`);
  },
});

const uploader = multer({
  storage: uploadStorage,
  limits: { fileSize: UPLOAD_MAX_MB * 1024 * 1024 },
});

app.use((req, res, next) => {
  const origin = req.headers.origin || "*";
  res.setHeader("Access-Control-Allow-Origin", origin);
  res.setHeader("Vary", "Origin");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, X-Content-Token");
  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  return next();
});

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

function cleanText(value) {
  return String(value || "").trim();
}

function normalizeSlug(value) {
  return cleanText(value)
    .toLowerCase()
    .replaceAll("ı", "i")
    .replaceAll("ğ", "g")
    .replaceAll("ü", "u")
    .replaceAll("ş", "s")
    .replaceAll("ö", "o")
    .replaceAll("ç", "c")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function resolveContentType(type) {
  return CONTENT_TYPES[type] || null;
}

function ensureInsideContentPath(relativePath) {
  const absolutePath = path.resolve(__dirname, relativePath);
  const contentRoot = path.resolve(CONTENT_ROOT);
  const normalizedRoot = `${contentRoot}${path.sep}`;
  if (absolutePath !== contentRoot && !absolutePath.startsWith(normalizedRoot)) {
    throw new Error("Geçersiz içerik dosya yolu.");
  }
  return absolutePath;
}

async function readContentIndex(type) {
  const config = resolveContentType(type);
  if (!config) {
    throw new Error("Geçersiz içerik tipi.");
  }

  const raw = await fs.readFile(config.indexPath, "utf8");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) {
    throw new Error("Index dosyası dizi formatında olmalıdır.");
  }
  return parsed;
}

async function writeContentIndex(type, list) {
  const config = resolveContentType(type);
  if (!config) {
    throw new Error("Geçersiz içerik tipi.");
  }

  await fs.writeFile(config.indexPath, `${JSON.stringify(list, null, 2)}\n`, "utf8");
}

function normalizeTools(value) {
  if (Array.isArray(value)) {
    return value.map((item) => cleanText(item)).filter(Boolean);
  }
  if (typeof value === "string") {
    return value
      .split(",")
      .map((item) => cleanText(item))
      .filter(Boolean);
  }
  return [];
}

function getTodayString() {
  return new Date().toISOString().slice(0, 10);
}

function parseCaseOrder(value) {
  const match = String(value || "").match(/(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function buildContentEntry(kind, input, existing, filePath, currentLength) {
  const computedSlug = normalizeSlug(input.slug || existing?.slug || input.title || existing?.title);
  const slug = computedSlug || `icerik-${Date.now()}`;

  if (kind === "blog") {
    const title = cleanText(input.title || existing?.title || "Yeni İçerik");
    const category = cleanText(input.category || existing?.category);
    const date = cleanText(input.date || existing?.date);
    const summary = cleanText(input.summary || existing?.summary);

    return {
      slug,
      title,
      category,
      date,
      summary,
      file: filePath,
    };
  }

  const title = cleanText(input.title || existing?.title || "Yeni Case Study");

  const defaultNumber = `Case ${String(currentLength + 1).padStart(2, "0")}`;
  const tools = normalizeTools(input.tools ?? existing?.tools);

  return {
    slug,
    number: cleanText(input.number || existing?.number || defaultNumber),
    category: cleanText(input.category || existing?.category),
    title,
    summary: cleanText(input.summary || existing?.summary),
    meta: cleanText(input.meta || existing?.meta),
    cover: cleanText(input.cover || existing?.cover),
    date: cleanText(input.date || existing?.date),
    tools,
    file: filePath,
    pdf: cleanText(input.pdf || existing?.pdf),
    libraryTitle: cleanText(input.libraryTitle || existing?.libraryTitle || title),
  };
}

function isLocalRequest(req) {
  const host = String(req.hostname || "").toLowerCase();
  return host === "localhost" || host === "127.0.0.1" || host === "::1";
}

function hasWriteAccess(req) {
  if (WRITE_MODE === "true") return true;
  if (WRITE_MODE === "false") return false;
  return isLocalRequest(req);
}

function isTokenValid(req) {
  if (!ADMIN_TOKEN) return true;
  return req.get("x-content-token") === ADMIN_TOKEN;
}

function ensureWritePermission(req, res) {
  if (!hasWriteAccess(req)) {
    res.status(403).json({
      error:
        "Yazma işlemi kapalı. Yerelde çalıştırın veya CONTENT_WRITE_ENABLED=true olarak ayarlayın.",
    });
    return false;
  }

  if (!isTokenValid(req)) {
    res.status(401).json({ error: "Geçersiz yönetim token bilgisi." });
    return false;
  }

  return true;
}

app.get("/api/health", (_req, res) => {
  res.json({
    status: "ok",
    aiEnabled: Boolean(openai),
    model,
    date: new Date().toISOString(),
  });
});

app.get("/api/content/:type/index", async (req, res) => {
  try {
    const { type } = req.params;
    if (!resolveContentType(type)) {
      return res.status(400).json({ error: "Geçersiz içerik tipi." });
    }

    const items = await readContentIndex(type);
    res.json({ items });
  } catch (error) {
    res.status(500).json({ error: `İçerik listesi alınamadı: ${error.message}` });
  }
});

app.get("/api/content/:type/item/:slug", async (req, res) => {
  try {
    const { type, slug } = req.params;
    const normalizedSlug = normalizeSlug(slug);

    if (!resolveContentType(type)) {
      return res.status(400).json({ error: "Geçersiz içerik tipi." });
    }

    const items = await readContentIndex(type);
    const entry = items.find((item) => item.slug === normalizedSlug);
    if (!entry) {
      return res.status(404).json({ error: "İçerik bulunamadı." });
    }

    const markdownPath = ensureInsideContentPath(entry.file);
    const markdown = await fs.readFile(markdownPath, "utf8");

    res.json({ entry, markdown });
  } catch (error) {
    res.status(500).json({ error: `İçerik detayı alınamadı: ${error.message}` });
  }
});

app.post("/api/content/:type/save", async (req, res) => {
  if (!ensureWritePermission(req, res)) return;

  try {
    const { type } = req.params;
    const config = resolveContentType(type);
    if (!config) {
      return res.status(400).json({ error: "Geçersiz içerik tipi." });
    }

    const inputEntry = req.body?.entry || {};
    const markdown = String(req.body?.markdown || "");

    const list = await readContentIndex(type);
    const requestSlug = normalizeSlug(inputEntry.slug || inputEntry.title);
    const currentSlug = normalizeSlug(req.body?.currentSlug);
    const lookupSlug = currentSlug || requestSlug;
    const existingIndex = lookupSlug ? list.findIndex((item) => item.slug === lookupSlug) : -1;
    const existingEntry = existingIndex >= 0 ? list[existingIndex] : null;

    const effectiveSlug = requestSlug || existingEntry?.slug || `icerik-${Date.now()}`;
    const markdownFile = existingEntry?.file || `content/${config.folder}/${effectiveSlug}.md`;
    const nextEntry = buildContentEntry(
      config.kind,
      { ...inputEntry, slug: effectiveSlug },
      existingEntry,
      markdownFile,
      list.length
    );

    const markdownAbsolute = ensureInsideContentPath(markdownFile);
    await fs.mkdir(path.dirname(markdownAbsolute), { recursive: true });
    await fs.writeFile(markdownAbsolute, `${markdown.trimEnd()}\n`, "utf8");

    if (existingIndex >= 0) {
      list[existingIndex] = nextEntry;
    } else {
      list.unshift(nextEntry);
    }

    if (config.kind === "blog") {
      list.sort((a, b) => String(b.date || "").localeCompare(String(a.date || "")));
    }

    if (config.kind === "cases") {
      list.sort((a, b) => parseCaseOrder(a.number) - parseCaseOrder(b.number));
    }

    await writeContentIndex(type, list);
    res.json({ ok: true, entry: nextEntry });
  } catch (error) {
    res.status(500).json({ error: `İçerik kaydedilemedi: ${error.message}` });
  }
});

app.post("/api/content/:type/delete", async (req, res) => {
  if (!ensureWritePermission(req, res)) return;

  try {
    const { type } = req.params;
    if (!resolveContentType(type)) {
      return res.status(400).json({ error: "Geçersiz içerik tipi." });
    }

    const slug = normalizeSlug(req.body?.slug);
    if (!slug) {
      return res.status(400).json({ error: "Silinecek slug bilgisi gerekli." });
    }

    const removeFile = req.body?.removeFile !== false;
    const list = await readContentIndex(type);
    const index = list.findIndex((item) => item.slug === slug);

    if (index < 0) {
      return res.status(404).json({ error: "Silinecek içerik bulunamadı." });
    }

    const [removed] = list.splice(index, 1);
    await writeContentIndex(type, list);

    if (removeFile && removed?.file) {
      const markdownAbsolute = ensureInsideContentPath(removed.file);
      await fs.rm(markdownAbsolute, { force: true });
    }

    res.json({ ok: true, removedSlug: slug });
  } catch (error) {
    res.status(500).json({ error: `İçerik silinemedi: ${error.message}` });
  }
});

app.post("/api/content/upload", (req, res) => {
  if (!ensureWritePermission(req, res)) return;

  uploader.single("file")(req, res, (error) => {
    if (error) {
      if (error.code === "LIMIT_FILE_SIZE") {
        return res.status(400).json({
          error: `Dosya boyutu limiti aşıldı. Maksimum ${UPLOAD_MAX_MB} MB yükleyebilirsin.`,
        });
      }
      return res.status(400).json({ error: `Dosya yükleme hatası: ${error.message}` });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Yüklenecek dosya bulunamadı." });
    }

    const relativePath = path.relative(__dirname, req.file.path).split(path.sep).join("/");
    return res.json({
      ok: true,
      path: relativePath,
      mime: req.file.mimetype,
      size: req.file.size,
      originalName: req.file.originalname,
    });
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

app.get("/yonetim", (_req, res) => {
  res.sendFile(path.join(__dirname, "yonetim.html"));
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
