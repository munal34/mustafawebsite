document.documentElement.classList.add("js");

function getCurrentPage() {
  const page = window.location.pathname.split("/").pop().toLowerCase();
  return page || "index.html";
}

function shouldSkipTransition(event, link) {
  if (event.defaultPrevented) return true;
  if (event.button !== 0) return true;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return true;
  if (link.target && link.target !== "_self") return true;
  if (link.hasAttribute("download")) return true;

  const href = link.getAttribute("href");
  if (!href || href.startsWith("#")) return true;
  if (href.startsWith("mailto:") || href.startsWith("tel:")) return true;

  let url;
  try {
    url = new URL(href, window.location.href);
  } catch (error) {
    return true;
  }

  if (url.origin !== window.location.origin) return true;
  if (
    url.pathname === window.location.pathname &&
    url.search === window.location.search &&
    (url.hash === window.location.hash || url.hash === "")
  ) {
    return true;
  }

  const extension = url.pathname.split(".").pop().toLowerCase();
  return extension !== "html" && extension !== "";
}

document.addEventListener("DOMContentLoaded", () => {
  const body = document.body;
  const navToggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");

  const closeNav = () => {
    body.classList.remove("nav-open");
    if (navToggle) navToggle.setAttribute("aria-expanded", "false");
  };

  if (navToggle && nav) {
    navToggle.addEventListener("click", () => {
      const isOpen = body.classList.toggle("nav-open");
      navToggle.setAttribute("aria-expanded", String(isOpen));
    });

    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) closeNav();
    });

    window.addEventListener("resize", () => {
      if (window.innerWidth > 980) closeNav();
    });
  }

  const currentPage = getCurrentPage();
  const navTarget = currentPage.startsWith("case-study-") ? "case-studies.html" : currentPage;
  document.querySelectorAll(".site-nav a").forEach((link) => {
    const href = (link.getAttribute("href") || "").toLowerCase();
    if (href === navTarget) link.classList.add("active");
  });

  requestAnimationFrame(() => {
    body.classList.add("page-loaded");
  });

  const revealItems = Array.from(document.querySelectorAll("[data-reveal]"));
  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries, currentObserver) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          currentObserver.unobserve(entry.target);
        });
      },
      { threshold: 0.12, rootMargin: "0px 0px -10% 0px" }
    );

    revealItems.forEach((item, index) => {
      item.style.transitionDelay = `${Math.min(index * 45, 180)}ms`;
      observer.observe(item);
    });
  } else {
    revealItems.forEach((item) => item.classList.add("is-visible"));
  }

  document.querySelectorAll(".pressable").forEach((item) => {
    const release = () => item.classList.remove("is-pressed");
    item.addEventListener("pointerdown", () => item.classList.add("is-pressed"));
    item.addEventListener("pointerup", release);
    item.addEventListener("pointerleave", release);
    item.addEventListener("blur", release);
  });

  document.querySelectorAll("a[href]").forEach((link) => {
    link.addEventListener("click", (event) => {
      if (shouldSkipTransition(event, link)) return;

      event.preventDefault();
      closeNav();
      body.classList.add("is-exiting");

      window.setTimeout(() => {
        window.location.href = link.href;
      }, 180);
    });
  });

  const yearElement = document.getElementById("year");
  if (yearElement) yearElement.textContent = String(new Date().getFullYear());
});
