document.documentElement.classList.add("js");

function currentPageName() {
  const path = window.location.pathname.split("/").pop().toLowerCase();
  return path || "index.html";
}

function escapeHtml(input) {
  return String(input)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function normalizeAssetPath(value) {
  let path = String(value || "").trim();
  if (!path) return "";
  path = path.replace(/^"+|"+$/g, "");
  path = path.replaceAll("\\", "/");
  path = path.replace(/^\.?\//, "");
  if (/^[a-zA-Z]:\//.test(path)) return "";
  return path;
}

function formatInlineMarkdown(text) {
  let value = escapeHtml(text);
  value = value.replace(/`([^`]+)`/g, "<code>$1</code>");
  value = value.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  value = value.replace(/\*([^*]+)\*/g, "<em>$1</em>");
  value = value.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
  return value;
}

function markdownToHtml(markdown) {
  const source = String(markdown || "").replace(/\r\n/g, "\n");
  const trimmed = source.trim();

  if (!trimmed) return "";
  if (trimmed.startsWith("<!--format:html-->")) {
    return trimmed.slice("<!--format:html-->".length).trim();
  }

  const lines = source.split("\n");
  const out = [];
  let paragraph = [];
  let inList = false;

  const flushParagraph = () => {
    if (!paragraph.length) return;
    out.push(`<p>${formatInlineMarkdown(paragraph.join(" "))}</p>`);
    paragraph = [];
  };

  const closeList = () => {
    if (!inList) return;
    out.push("</ul>");
    inList = false;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line) {
      flushParagraph();
      closeList();
      continue;
    }

    const imageMatch = line.match(/^!\[(.*)\]\(([^)]+)\)$/);
    if (imageMatch) {
      flushParagraph();
      closeList();
      const alt = escapeHtml(imageMatch[1] || "Görsel");
      const src = escapeHtml(imageMatch[2]);
      out.push(`<figure class="markdown-figure"><img src="${src}" alt="${alt}" loading="lazy"></figure>`);
      continue;
    }

    const h3 = line.match(/^###\s+(.*)$/);
    if (h3) {
      flushParagraph();
      closeList();
      out.push(`<h3>${formatInlineMarkdown(h3[1])}</h3>`);
      continue;
    }

    const h2 = line.match(/^##\s+(.*)$/);
    if (h2) {
      flushParagraph();
      closeList();
      out.push(`<h2>${formatInlineMarkdown(h2[1])}</h2>`);
      continue;
    }

    const h1 = line.match(/^#\s+(.*)$/);
    if (h1) {
      flushParagraph();
      closeList();
      out.push(`<h1>${formatInlineMarkdown(h1[1])}</h1>`);
      continue;
    }

    const bullet = line.match(/^-\s+(.*)$/);
    if (bullet) {
      flushParagraph();
      if (!inList) {
        out.push('<ul class="clean-list">');
        inList = true;
      }
      out.push(`<li>${formatInlineMarkdown(bullet[1])}</li>`);
      continue;
    }

    paragraph.push(line);
  }

  flushParagraph();
  closeList();
  return out.join("\n");
}

async function fetchJson(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} yüklenemedi (${response.status})`);
  }
  return response.json();
}

async function fetchText(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(`${url} yüklenemedi (${response.status})`);
  }
  return response.text();
}

function attachPressables(scope = document) {
  scope.querySelectorAll(".pressable").forEach((node) => {
    if (node.dataset.pressBound === "1") return;
    node.dataset.pressBound = "1";
    const clear = () => node.classList.remove("is-pressed");
    node.addEventListener("pointerdown", () => node.classList.add("is-pressed"));
    node.addEventListener("pointerup", clear);
    node.addEventListener("pointerleave", clear);
    node.addEventListener("blur", clear);
  });
}

function hydratePdfPreviews(scope = document) {
  scope.querySelectorAll("iframe[data-pdf-src]").forEach((frame) => {
    if (frame.getAttribute("src")) return;
    const src = frame.getAttribute("data-pdf-src");
    if (src) frame.setAttribute("src", src);
  });
}

async function renderBlogList() {
  const container = document.querySelector("[data-blog-list]");
  if (!container) return;

  try {
    const posts = await fetchJson("content/blog/index.json");
    if (!Array.isArray(posts) || !posts.length) {
      container.innerHTML = '<article class="card"><p class="meta">Henüz blog içeriği yok.</p></article>';
      return;
    }

    container.innerHTML = posts
      .map(
        (post) => `
        <a class="note-card card note-link pressable" href="blog-post.html?slug=${encodeURIComponent(post.slug)}" aria-label="${escapeHtml(post.title)} yazısını aç">
          <p class="meta">${escapeHtml(post.category)} · ${escapeHtml(post.date)}</p>
          <h3>${escapeHtml(post.title)}</h3>
          <p class="note-summary">${escapeHtml(post.summary)}</p>
          <p class="inline-link">Yazıyı oku</p>
        </a>`
      )
      .join("");

    attachPressables(container);
  } catch (error) {
    container.innerHTML = `<article class="card"><p class="meta">Blog içerikleri yüklenemedi: ${escapeHtml(error.message)}</p></article>`;
  }
}

async function renderCaseList() {
  const container = document.querySelector("[data-case-list]");
  if (!container) return;

  try {
    const cases = await fetchJson("content/cases/index.json");
    if (!Array.isArray(cases) || !cases.length) {
      container.innerHTML = '<article class="card"><p class="meta">Henüz case study içeriği yok.</p></article>';
      return;
    }

    container.innerHTML = cases
      .map((item) => {
        const coverPath = normalizeAssetPath(item.cover);
        const coverInner = coverPath
          ? `<img src="${escapeHtml(coverPath)}" alt="${escapeHtml(item.number)} görseli" loading="lazy">`
          : `<div class="meta" style="margin:0;">Kapak görseli eklenmedi</div>`;
        return `
        <a class="case-card card case-link pressable" href="case-post.html?slug=${encodeURIComponent(item.slug)}" aria-label="${escapeHtml(item.title)} case sayfasını aç">
          <div class="cover contain">
            ${coverInner}
            <span class="cover-label">${escapeHtml(item.number)}</span>
          </div>
          <div class="case-card-body">
            <p class="meta">${escapeHtml(item.category)}</p>
            <h3>${escapeHtml(item.title)}</h3>
            <p class="case-summary">${escapeHtml(item.summary)}</p>
            <p class="meta">${escapeHtml(item.meta)}</p>
          </div>
        </a>`;
      })
      .join("");

    attachPressables(container);
  } catch (error) {
    container.innerHTML = `<article class="card"><p class="meta">Case içerikleri yüklenemedi: ${escapeHtml(error.message)}</p></article>`;
  }
}

async function renderLibraryList() {
  const container = document.querySelector("[data-library-list]");
  if (!container) return;

  try {
    const cases = await fetchJson("content/cases/index.json");
    const files = Array.isArray(cases) ? cases.filter((item) => item.pdf) : [];

    if (!files.length) {
      container.innerHTML = '<article class="card"><p class="meta">Kütüphane içeriği bulunamadı.</p></article>';
      return;
    }

    container.innerHTML = files
      .map(
        (item) => `
        <article class="resource-card card">
          <p class="badge">PDF</p>
          <h3>${escapeHtml(item.libraryTitle || item.title)}</h3>
          <p class="meta">${escapeHtml(item.number)}</p>
          <div class="pdf-preview">
            <iframe title="${escapeHtml(item.number)} PDF" loading="lazy" data-pdf-src="${escapeHtml(item.pdf)}#page=1&view=FitH&toolbar=0&navpanes=0"></iframe>
          </div>
          <a class="button small pressable" href="${escapeHtml(item.pdf)}" download>İndir</a>
        </article>`
      )
      .join("");

    hydratePdfPreviews(container);
    attachPressables(container);
  } catch (error) {
    container.innerHTML = `<article class="card"><p class="meta">Kütüphane yüklenemedi: ${escapeHtml(error.message)}</p></article>`;
  }
}

function getSlugFromQuery() {
  return new URLSearchParams(window.location.search).get("slug") || "";
}

async function renderBlogPostPage() {
  const pageRoot = document.querySelector("[data-blog-post-page]");
  if (!pageRoot) return;

  const titleEl = document.getElementById("blog-post-title");
  const categoryEl = document.getElementById("blog-post-category");
  const dateEl = document.getElementById("blog-post-date");
  const contentEl = document.getElementById("blog-post-content");

  try {
    const posts = await fetchJson("content/blog/index.json");
    if (!Array.isArray(posts) || !posts.length) {
      contentEl.innerHTML = "<p>İçerik bulunamadı.</p>";
      return;
    }

    const slug = getSlugFromQuery();
    const active = posts.find((post) => post.slug === slug) || posts[0];
    const markdown = await fetchText(active.file);

    categoryEl.textContent = `Blog · ${active.category}`;
    titleEl.textContent = active.title;
    dateEl.textContent = `Yayın Tarihi: ${active.date}`;
    contentEl.innerHTML = markdownToHtml(markdown);
    document.title = `${active.title} | Mustafa Ünal`;
  } catch (error) {
    contentEl.innerHTML = `<p>Yazı yüklenemedi: ${escapeHtml(error.message)}</p>`;
  }
}

function renderCaseRelated(cases, activeSlug) {
  const container = document.getElementById("case-post-related");
  if (!container) return;

  const related = cases.filter((item) => item.slug !== activeSlug).slice(0, 3);
  if (!related.length) {
    container.innerHTML = '<article class="related-card card"><p class="meta">Benzer çalışma bulunamadı.</p></article>';
    return;
  }

  container.innerHTML = related
    .map(
      (item) => `
      <a class="related-card card pressable" href="case-post.html?slug=${encodeURIComponent(item.slug)}">
        <p class="meta">${escapeHtml(item.number)} · ${escapeHtml(item.category)}</p>
        <h3>${escapeHtml(item.title)}</h3>
        <p class="note-summary">${escapeHtml(item.summary)}</p>
      </a>`
    )
    .join("");

  attachPressables(container);
}

async function renderCasePostPage() {
  const pageRoot = document.querySelector("[data-case-post-page]");
  if (!pageRoot) return;

  const eyebrowEl = document.getElementById("case-post-eyebrow");
  const titleEl = document.getElementById("case-post-title");
  const summaryEl = document.getElementById("case-post-summary");
  const coverEl = document.getElementById("case-post-cover");
  const contentEl = document.getElementById("case-post-content");
  const categoryEl = document.getElementById("case-post-category");
  const dateEl = document.getElementById("case-post-date");
  const toolsEl = document.getElementById("case-post-tools");
  const metaEl = document.getElementById("case-post-meta");
  const pdfEl = document.getElementById("case-post-pdf");
  const pdfSideEl = document.getElementById("case-post-pdf-side");
  const pdfRowEl = document.getElementById("case-post-pdf-row");
  const downloadSectionEl = document.querySelector("[data-case-download-section]");
  const downloadNoteEl = document.getElementById("case-post-download-note");

  try {
    const cases = await fetchJson("content/cases/index.json");
    if (!Array.isArray(cases) || !cases.length) {
      contentEl.innerHTML = "<p>Case içeriği bulunamadı.</p>";
      return;
    }

    const slug = getSlugFromQuery();
    const active = cases.find((item) => item.slug === slug) || cases[0];
    const markdown = await fetchText(active.file);

    eyebrowEl.textContent = `${active.number} · ${active.category}`;
    titleEl.textContent = active.title;
    summaryEl.textContent = active.summary;
    const coverPath = normalizeAssetPath(active.cover);
    if (coverPath) {
      coverEl.setAttribute("src", coverPath);
      coverEl.setAttribute("alt", `${active.number} kapak görseli`);
      coverEl.onerror = () => {
        coverEl.removeAttribute("src");
        coverEl.setAttribute("alt", "Kapak görseli yüklenemedi");
      };
    } else {
      coverEl.removeAttribute("src");
      coverEl.setAttribute("alt", "Kapak görseli eklenmedi");
    }
    contentEl.innerHTML = markdownToHtml(markdown);

    categoryEl.textContent = active.category;
    dateEl.textContent = active.date;
    toolsEl.textContent = Array.isArray(active.tools) ? active.tools.join(" · ") : "-";
    metaEl.textContent = active.meta || "-";

    if (active.pdf) {
      pdfEl.setAttribute("href", active.pdf);
      pdfSideEl.setAttribute("href", active.pdf);
      pdfEl.setAttribute("target", "_blank");
      pdfEl.setAttribute("rel", "noopener");
      pdfSideEl.textContent = "Dosya";
      if (pdfRowEl) pdfRowEl.style.display = "";
      if (downloadSectionEl) downloadSectionEl.style.display = "";
      if (downloadNoteEl) {
        downloadNoteEl.textContent = "Bu çalışmanın tüm dokümanına dosya bağlantısından erişebilirsin.";
      }
    } else {
      if (pdfRowEl) pdfRowEl.style.display = "none";
      if (downloadSectionEl) downloadSectionEl.style.display = "none";
    }

    renderCaseRelated(cases, active.slug);
    document.title = `${active.number} | ${active.title}`;
  } catch (error) {
    contentEl.innerHTML = `<p>Case yüklenemedi: ${escapeHtml(error.message)}</p>`;
  }
}

document.addEventListener("DOMContentLoaded", async () => {
  const body = document.body;
  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.querySelector(".site-nav");

  const host = window.location.hostname.toLowerCase();
  const isLocalHost = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (isLocalHost) {
    body.classList.add("is-local");
  }

  const closeNav = () => {
    body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  };

  const restorePageState = () => {
    body.classList.remove("page-exit");
    body.classList.add("page-loaded");
    closeNav();
  };

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
      const open = body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", String(open));
    });

    siteNav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNav();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 920) closeNav();
    });
  }

  const page = currentPageName();
  const navAliases = {
    "blog-post.html": "blog.html",
    "case-post.html": "case-studies.html",
    "gonullu-calismalar.html": "hakkimda.html",
    "blog-01.html": "blog.html",
    "blog-02.html": "blog.html",
    "blog-03.html": "blog.html",
    "case-study-01.html": "case-studies.html",
    "case-study-02.html": "case-studies.html",
    "case-study-03.html": "case-studies.html",
    "case-study-04.html": "case-studies.html"
  };
  const navTarget = navAliases[page] || page;

  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (href === navTarget) link.classList.add("active");
  });

  requestAnimationFrame(() => {
    body.classList.add("page-loaded");
  });

  window.addEventListener("pageshow", restorePageState);
  window.addEventListener("popstate", restorePageState);

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 45, 220)}ms`;
      io.observe(item);
    });
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  attachPressables(document);
  hydratePdfPreviews(document);

  await Promise.all([
    renderBlogList(),
    renderCaseList(),
    renderLibraryList(),
    renderBlogPostPage(),
    renderCasePostPage()
  ]);

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
});
