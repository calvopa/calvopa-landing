(function () {
  "use strict";

  // Nav background on scroll
  var nav = document.getElementById("nav");
  function onScroll() {
    if (window.scrollY > 8) nav.classList.add("scrolled");
    else nav.classList.remove("scrolled");
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  // Mobile nav toggle (slides nav-links into a simple stacked panel)
  var navToggle = document.getElementById("navToggle");
  var navLinks = document.querySelector(".nav-links");
  if (navToggle && navLinks) {
    function setNavOpen(open) {
      navLinks.classList.toggle("open", open);
      navToggle.setAttribute("aria-expanded", String(open));
      navToggle.setAttribute("aria-label", open ? "Cerrar menú" : "Abrir menú");
    }
    navToggle.addEventListener("click", function () {
      setNavOpen(navToggle.getAttribute("aria-expanded") !== "true");
    });
    navLinks.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", function () { setNavOpen(false); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape") setNavOpen(false);
    });
  }

  // Footer year
  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  // Scroll reveals: each one fires once, the first time it enters view.
  // The CSS driving ".is-visible" differs per section (clip sweep, signal
  // line, lamp light, list stagger) — this just flips the trigger class.
  var revealTargets = document.querySelectorAll(
    ".service-list, .process-line, .industries-line, .stack-list"
  );
  if ("IntersectionObserver" in window && revealTargets.length) {
    // Only now — with the observer guaranteed to run — do content get hidden
    // ahead of its reveal. If JS never reaches this line, nothing was hidden.
    revealTargets.forEach(function (el) { el.classList.add("reveal-pending"); });
    var revealObserver = new IntersectionObserver(
      function (entries, observer) {
        entries.forEach(function (entry) {
          if (entry.isIntersecting) {
            entry.target.classList.add("is-visible");
            observer.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.2, rootMargin: "0px 0px -10% 0px" }
    );
    revealTargets.forEach(function (el) { revealObserver.observe(el); });
  }

  // Contact form — posts to the API behind the nginx /api/ proxy.
  var form = document.getElementById("contactForm");
  var status = document.getElementById("formStatus");
  var submitBtn = document.getElementById("submitBtn");

  // Swapping text (e.g. "Enviando..." -> result) through a brief blur+fade
  // reads as one continuous change instead of two states cutting over.
  function setStatus(text, kind) {
    var hadContent = status.textContent.trim() !== "";
    function apply() {
      status.textContent = text;
      status.className = kind ? "form-status " + kind : "form-status";
      if (hadContent) {
        requestAnimationFrame(function () {
          status.classList.remove("is-swapping");
        });
      }
    }
    if (hadContent) {
      status.classList.add("is-swapping");
      setTimeout(apply, 140);
    } else {
      apply();
    }
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();

      var name = form.name.value.trim();
      var email = form.email.value.trim();
      var message = form.message.value.trim();
      var company = form.company.value; // honeypot, left as-is

      if (!name || !email || !message) {
        setStatus("Completá todos los campos.", "err");
        return;
      }

      submitBtn.disabled = true;
      setStatus("Enviando...", "");

      fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name, email: email, message: message, company: company }),
      })
        .then(function (res) {
          return res.json().then(function (data) {
            return { ok: res.ok, data: data };
          });
        })
        .then(function (result) {
          if (!result.ok || !result.data.ok) {
            throw new Error((result.data && result.data.error) || "No se pudo enviar.");
          }
          setStatus("Gracias, " + name.split(" ")[0] + ". Te respondo a la brevedad.", "ok");
          form.reset();
        })
        .catch(function (err) {
          setStatus(err.message || "Algo falló. Escribime por Telegram mientras tanto.", "err");
        })
        .finally(function () {
          submitBtn.disabled = false;
        });
    });
  }
})();
