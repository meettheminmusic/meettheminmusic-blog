/**
 * slideshow.js
 *
 * Shared coordinator for image slideshows.
 * Loaded once per page via Page.Store guard in the slideshow shortcode.
 * Each shortcode instance calls SlideshowCoordinator.register(id).
 */
(function () {
  'use strict';

  function initSlideshow(id) {
    var el = document.getElementById(id);
    if (!el) return;

    var slides  = el.querySelectorAll('.slideshow__slide');
    var prevBtn = el.querySelector('.slideshow__btn--prev');
    var nextBtn = el.querySelector('.slideshow__btn--next');
    var fsBtn   = el.querySelector('.slideshow__btn--fullscreen');
    var counter = el.querySelector('.slideshow__counter-current');
    var total   = slides.length;
    var current = 0;

    if (total === 0) return;

    // Hide fullscreen button on iOS where the API is not supported on non-video elements
    if (fsBtn && !el.requestFullscreen && !el.webkitRequestFullscreen) {
      fsBtn.style.display = 'none';
    }

    function goTo(index) {
      slides[current].classList.remove('is-active');
      slides[current].setAttribute('aria-hidden', 'true');

      current = (index + total) % total;

      slides[current].classList.add('is-active');
      slides[current].setAttribute('aria-hidden', 'false');

      if (counter) counter.textContent = current + 1;
    }

    if (prevBtn) {
      prevBtn.addEventListener('click', function () { goTo(current - 1); });
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', function () { goTo(current + 1); });
    }

    // Fullscreen
    if (fsBtn) {
      fsBtn.addEventListener('click', function () {
        var isFs = document.fullscreenElement === el ||
                   document.webkitFullscreenElement === el;
        if (isFs) {
          if (document.exitFullscreen) document.exitFullscreen();
          else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        } else {
          if (el.requestFullscreen) el.requestFullscreen();
          else if (el.webkitRequestFullscreen) el.webkitRequestFullscreen();
        }
      });

      function onFullscreenChange() {
        var isFs = document.fullscreenElement === el ||
                   document.webkitFullscreenElement === el;
        fsBtn.setAttribute('aria-label', isFs ? 'Exit fullscreen' : 'Enter fullscreen');
        fsBtn.setAttribute('data-fullscreen', isFs ? 'true' : 'false');
      }
      document.addEventListener('fullscreenchange', onFullscreenChange);
      document.addEventListener('webkitfullscreenchange', onFullscreenChange);
    }

    // Keyboard navigation — scoped to the container so it doesn't hijack page scrolling
    el.setAttribute('tabindex', '-1');
    el.addEventListener('keydown', function (e) {
      switch (e.key) {
        case 'ArrowLeft':
        case 'ArrowUp':
          e.preventDefault();
          goTo(current - 1);
          break;
        case 'ArrowRight':
        case 'ArrowDown':
          e.preventDefault();
          goTo(current + 1);
          break;
        case 'f':
        case 'F':
          if (fsBtn) fsBtn.click();
          break;
        case 'Escape':
          if (document.fullscreenElement === el || document.webkitFullscreenElement === el) {
            if (document.exitFullscreen) document.exitFullscreen();
            else if (document.webkitExitFullscreen) document.webkitExitFullscreen();
          }
          break;
      }
    });
  }

  window.SlideshowCoordinator = {
    register: function (id) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function () {
          initSlideshow(id);
        });
      } else {
        initSlideshow(id);
      }
    }
  };

})();
