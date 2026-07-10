/* ============================================================
   Lunar Intelligence — motion module
   Transform / opacity only. The static scene is complete without
   this file; everything here is progressive enhancement and is
   fully skipped under prefers-reduced-motion.
   ============================================================ */
(function () {
  "use strict";

  var root = document.documentElement;
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ---- entrance + ambient animation opt-in --------------------
     Only enable keyframe motion when the visitor allows it. All
     CSS animations are gated behind html.js-anim, so no-JS and
     reduced-motion both render the final static composition. */
  function applyMotionPref() {
    root.classList.toggle("js-anim", !reduceMotion.matches);
  }
  applyMotionPref();
  if (reduceMotion.addEventListener) {
    reduceMotion.addEventListener("change", applyMotionPref);
  }

  /* ---- nav: frost after 48px scroll -------------------------- */
  var nav = document.querySelector("[data-nav]");
  function onScroll() {
    if (nav) nav.classList.toggle("is-stuck", window.scrollY > 48);
  }
  onScroll();
  window.addEventListener("scroll", onScroll, { passive: true });

  /* ---- active section link ----------------------------------- */
  var navLinks = Array.prototype.slice.call(
    document.querySelectorAll("[data-navlink]")
  );
  var sections = navLinks
    .map(function (a) {
      return document.querySelector(a.getAttribute("href"));
    })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(
      function (entries) {
        entries.forEach(function (entry) {
          if (!entry.isIntersecting) return;
          var id = entry.target.id;
          navLinks.forEach(function (a) {
            a.classList.toggle(
              "is-active",
              a.getAttribute("href") === "#" + id
            );
          });
        });
      },
      { rootMargin: "-45% 0px -50% 0px", threshold: 0 }
    );
    sections.forEach(function (s) {
      spy.observe(s);
    });
  }

  /* ---- suspend ambient motion when the tab is hidden --------- */
  document.addEventListener("visibilitychange", function () {
    root.classList.toggle("is-hidden", document.hidden);
  });

  /* ---- optional pointer parallax (3-8px), fine pointers only -- */
  var finePointer = window.matchMedia("(pointer: fine)");
  var moonEls = document.querySelectorAll(".moon, .moon-glow");

  function enableParallax() {
    if (reduceMotion.matches || !finePointer.matches || !moonEls.length) return;
    var raf = null;
    window.addEventListener(
      "pointermove",
      function (e) {
        if (raf) return;
        raf = requestAnimationFrame(function () {
          raf = null;
          var cx = window.innerWidth / 2;
          var cy = window.innerHeight / 2;
          var px = ((e.clientX - cx) / cx) * 6; // max ~6px
          var py = ((e.clientY - cy) / cy) * 6;
          for (var i = 0; i < moonEls.length; i++) {
            moonEls[i].style.setProperty("--px", px.toFixed(1) + "px");
            moonEls[i].style.setProperty("--py", py.toFixed(1) + "px");
          }
        });
      },
      { passive: true }
    );
  }
  enableParallax();

  /* ---- Email button: copy to clipboard + toast --------------
     Progressive enhancement: the anchor keeps its mailto: href, so
     with no JS (or if the clipboard API is blocked) it still opens a
     mail client. With JS, a click copies the address and shows a toast. */
  var copyBtn = document.getElementById("js-copy-email");
  var toast = document.getElementById("toast");
  var toastTimer = null;

  function showToast(email) {
    if (!toast) return;
    toast.innerHTML =
      '<span class="toast-email"></span> mail copied to clipboard';
    toast.querySelector(".toast-email").textContent = email;
    toast.classList.add("is-visible");
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toast.classList.remove("is-visible");
    }, 2600);
  }

  function copyEmail(email) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(email);
    }
    return new Promise(function (resolve, reject) {
      try {
        var ta = document.createElement("textarea");
        ta.value = email;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.left = "-9999px";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        document.body.removeChild(ta);
        resolve();
      } catch (err) {
        reject(err);
      }
    });
  }

  if (copyBtn) {
    copyBtn.addEventListener("click", function (e) {
      e.preventDefault();
      var email =
        copyBtn.getAttribute("data-email") || "amit.aminov@mail.huji.ac.il";
      copyEmail(email)
        .then(function () {
          showToast(email);
        })
        .catch(function () {
          // clipboard unavailable — fall back to the mail client
          window.location.href = "mailto:" + email;
        });
    });
  }
})();
