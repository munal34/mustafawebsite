document.documentElement.classList.add("js");

function currentPageName() {
  const path = window.location.pathname.split("/").pop().toLowerCase();
  return path || "index.html";
}

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const navToggle = document.querySelector(".nav-toggle");
  const siteNav = document.querySelector(".site-nav");

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
  const navAliases = {};
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

  const pdfFrames = Array.from(document.querySelectorAll("iframe[data-pdf-src]"));
  if (pdfFrames.length) {
    if ("IntersectionObserver" in window) {
      const pdfObserver = new IntersectionObserver(
        (entries, observer) => {
          entries.forEach((entry) => {
            if (!entry.isIntersecting) return;
            const frame = entry.target;
            const src = frame.getAttribute("data-pdf-src");
            if (src && !frame.getAttribute("src")) frame.setAttribute("src", src);
            observer.unobserve(frame);
          });
        },
        { threshold: 0.08, rootMargin: "180px 0px" }
      );

      pdfFrames.forEach((frame) => pdfObserver.observe(frame));
    } else {
      pdfFrames.forEach((frame) => {
        const src = frame.getAttribute("data-pdf-src");
        if (src && !frame.getAttribute("src")) frame.setAttribute("src", src);
      });
    }
  }

  document.querySelectorAll(".pressable").forEach((node) => {
    const clear = () => node.classList.remove("is-pressed");
    node.addEventListener("pointerdown", () => node.classList.add("is-pressed"));
    node.addEventListener("pointerup", clear);
    node.addEventListener("pointerleave", clear);
    node.addEventListener("blur", clear);
  });

  const year = document.getElementById("year");
  if (year) year.textContent = String(new Date().getFullYear());
});
