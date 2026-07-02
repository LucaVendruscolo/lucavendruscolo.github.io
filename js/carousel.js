/* Per-project media carousel: prev/next, "n / m" counter, per-slide captions.
   Works without this file — CSS shows the first slide of each carousel. */

document.documentElement.classList.add("js");

function initCarousel(root) {
  var slides = root.querySelectorAll(".carousel-slide");
  var captions = root.querySelectorAll(".carousel-captions p");
  var prev = root.querySelector("[data-prev]");
  var next = root.querySelector("[data-next]");
  var counter = root.querySelector(".carousel-counter");
  var count = slides.length;
  var index = 0;

  function goTo(i) {
    index = (i + count) % count;

    slides.forEach(function (slide, n) {
      slide.style.transform = "translateX(" + (-index * 100) + "%)";
      slide.inert = n !== index; // keep off-screen slides out of the tab order
    });

    captions.forEach(function (cap, n) {
      cap.hidden = n !== index;
    });

    counter.textContent = (index + 1) + "\u200A/\u200A" + count; // hair spaces, matching the seeded HTML

    // never let a video keep playing off-screen
    root.querySelectorAll("video").forEach(function (v) {
      v.pause();
    });
  }

  slides.forEach(function (slide, n) {
    slide.inert = n !== index;
  });

  if (count > 1) {
    prev.hidden = false;
    next.hidden = false;
    counter.hidden = false;
    prev.addEventListener("click", function () { goTo(index - 1); });
    next.addEventListener("click", function () { goTo(index + 1); });

    root.addEventListener("keydown", function (e) {
      if (e.target.tagName === "VIDEO") return; // arrows seek the video instead
      if (e.key === "ArrowLeft") { goTo(index - 1); e.preventDefault(); }
      if (e.key === "ArrowRight") { goTo(index + 1); e.preventDefault(); }
    });
  }

  // hide the VIDEO tag while its video is playing
  root.querySelectorAll("video").forEach(function (v) {
    var slide = v.closest(".carousel-slide");
    v.addEventListener("play", function () { slide.classList.add("is-playing"); });
    v.addEventListener("pause", function () { slide.classList.remove("is-playing"); });
  });
}

document.querySelectorAll("[data-carousel]").forEach(initCarousel);
