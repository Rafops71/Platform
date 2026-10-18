'use strict';

// What the camera adds to the page: a pointer, a ring, and a caption.
//
// WHY A DRAWN POINTER
//
// Playwright records the PAGE, not the mouse - there is no cursor in the
// video at all. A film of a form filling itself with no visible cause looks
// like a glitch, so the pointer is drawn: a soft dot that glides to each
// control and pulses as it presses. It is honest to say it is drawn rather
// than let anybody believe they are watching a hand.
//
// A RING, AND NOW A ZOOM AS WELL
//
// The ring marks the subject and leaves the rest of the screen readable,
// which is what a claim like "Browse names nobody" needs: you cannot show
// that the list has no names while hiding the list.
//
// But a ring is not enough for a BUTTON. On a 1280-wide screen a button is a
// small thing, and the owner watched the first film and could not see which
// control was being pressed. So each press is now zoomed into, pressed, and
// zoomed back out to show what it did - which is also how a person would
// explain it over someone's shoulder.
//
// The zoom scales document.body, not documentElement, and the pointer, ring
// and caption are appended to documentElement - OUTSIDE body - so they stay
// crisp and unscaled while the page grows underneath them.
//
// All of this is injected into the page under test and touches nothing in the
// application's own code.

/** Injected once per page. Defines window.__jericho for the recorder to drive.
 *
 *  Everything is built on FIRST USE, not here.
 *
 *  An init script runs before the document exists - document.documentElement
 *  is null at that moment - so the first version of this threw on its first
 *  appendChild, window.__jericho was never defined, and the recorder failed on
 *  scene one with "Cannot read properties of undefined". The error was in the
 *  page, not in the recorder, which is why nothing in the recorder's own code
 *  looked wrong. */
function overlayScript() {
  if (window.__jericho) return;

  let parts = null;

  function build() {
    if (parts) return parts;
    if (!document.documentElement) return null;   // too early; try again later

    const style = document.createElement('style');
  style.textContent = `
    #jericho-pointer {
      position: fixed; z-index: 2147483647; left: 0; top: 0;
      width: 26px; height: 26px; margin: -13px 0 0 -13px;
      border-radius: 50%; pointer-events: none;
      background: rgba(39,97,143,.28);
      border: 2px solid rgba(39,97,143,.9);
      box-shadow: 0 2px 10px rgba(0,0,0,.25);
      transition: transform .5s cubic-bezier(.22,.61,.36,1);
      transform: translate(-100px, -100px);
    }
    #jericho-pointer.pressing {
      animation: jericho-press .45s ease-out;
    }
    @keyframes jericho-press {
      0%   { box-shadow: 0 0 0 0 rgba(39,97,143,.55); }
      100% { box-shadow: 0 0 0 26px rgba(39,97,143,0); }
    }
    .jericho-ring {
      position: fixed; z-index: 2147483646; pointer-events: none;
      border: 3px solid #27618f; border-radius: 10px;
      box-shadow: 0 0 0 4px rgba(39,97,143,.18);
      transition: all .4s cubic-bezier(.22,.61,.36,1);
    }
    #jericho-caption {
      position: fixed; z-index: 2147483647; left: 0; right: 0; bottom: 0;
      padding: 18px 28px calc(18px + env(safe-area-inset-bottom, 0px));
      background: linear-gradient(to top, rgba(10,16,22,.93), rgba(10,16,22,.72) 70%, rgba(10,16,22,0));
      color: #fff; font-family: "Source Sans 3", system-ui, sans-serif;
      font-size: 21px; line-height: 1.45; text-align: center;
      pointer-events: none; opacity: 0; transition: opacity .25s;
      text-shadow: 0 1px 3px rgba(0,0,0,.6);
    }
    #jericho-caption.on { opacity: 1; }
  `;
    document.documentElement.appendChild(style);

    const pointer = document.createElement('div');
    pointer.id = 'jericho-pointer';
    document.documentElement.appendChild(pointer);

    const caption = document.createElement('div');
    caption.id = 'jericho-caption';
    document.documentElement.appendChild(caption);

    parts = { pointer, caption, ring: null };
    return parts;
  }

  window.__jericho = {
    /** Glide the pointer to the centre of an element. */
    moveTo(selector) {
      const p = build();
      if (!p) return false;
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      p.pointer.style.transform =
        `translate(${r.left + r.width / 2}px, ${r.top + r.height / 2}px)`;
      return true;
    },

    press() {
      const p = build();
      if (!p) return false;
      p.pointer.classList.remove('pressing');
      void p.pointer.offsetWidth;        // restart the animation
      p.pointer.classList.add('pressing');
      return true;
    },

    /** Draw the ring around an element, or clear it with null. */
    ringAround(selector) {
      const p = build();
      if (!p) return false;
      if (!selector) {
        if (p.ring) { p.ring.remove(); p.ring = null; }
        return true;
      }
      const el = document.querySelector(selector);
      if (!el) return false;
      const r = el.getBoundingClientRect();
      if (!p.ring) {
        p.ring = document.createElement('div');
        p.ring.className = 'jericho-ring';
        document.documentElement.appendChild(p.ring);
      }
      // 6px of air, so the ring frames the control rather than strangling it.
      p.ring.style.left = `${r.left - 6}px`;
      p.ring.style.top = `${r.top - 6}px`;
      p.ring.style.width = `${r.width + 12}px`;
      p.ring.style.height = `${r.height + 12}px`;
      return true;
    },

    /** Zoom the page in on one element, centring it.
     *
     *  The maths: with transform-origin at 0 0, a point p maps to t + s*p.
     *  To put the element's centre c at the viewport centre v, t = v - s*c.
     *
     *  The transform is cleared and the layout re-measured FIRST, so calling
     *  this twice in a row zooms from the page's true geometry rather than
     *  compounding one zoom on top of another. */
    zoomTo(selector, scale) {
      const p = build();
      if (!p || !document.body) return false;
      const el = document.querySelector(selector);
      if (!el) return false;
      const s = Number(scale) || 1.9;

      const body = document.body;
      body.style.transition = 'none';
      body.style.transform = 'none';
      body.style.transformOrigin = '0 0';
      void body.offsetWidth;                 // force the reflow before measuring

      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const tx = window.innerWidth / 2 - s * cx;
      const ty = window.innerHeight / 2 - s * cy;

      body.style.transition = 'transform .85s cubic-bezier(.22,.61,.36,1)';
      body.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      return true;
    },

    /** Back to the whole screen. */
    zoomOut() {
      const p = build();
      if (!p || !document.body) return false;
      document.body.style.transition = 'transform .85s cubic-bezier(.22,.61,.36,1)';
      document.body.style.transform = 'none';
      return true;
    },

    caption(text) {
      const p = build();
      if (!p) return false;
      p.caption.textContent = text || '';
      p.caption.classList.toggle('on', Boolean(text));
      return true;
    },
  };
  return true;
}

module.exports = { overlayScript };
