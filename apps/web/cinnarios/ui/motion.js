// Scroll motion for the homepage, without relying on the newest CSS features, so it runs in
// the phone app's web view too. One animation loop reads where each marked element sits in
// the window, turns that into a progress from 0 to 1, and eases the shown value towards it
// with linear interpolation (lerp), so fast scrolling still looks smooth.
// Each kind of motion is a small class with one `draw(progress)` method (polymorphism).
(function () {
  const EASE = 0.16;
  const clamp = (value) => Math.min(1, Math.max(0, value));
  const lerp = (from, to, amount) => from + (to - from) * amount;

  /** Base class: how far through its range an element is. Subclasses decide what to draw. */
  class Effect {
    constructor(el, range = [0, 1]) {
      this.el = el;
      this.range = range;
      this.shown = 0;
    }

    /** 0 when the element's top reaches the bottom of the window, 1 when its bottom leaves the top. */
    cover() {
      const rect = this.el.getBoundingClientRect();
      const height = window.innerHeight;
      return clamp((height - rect.top) / (height + rect.height));
    }

    target() {
      const [start, end] = this.range;
      return clamp((this.cover() - start) / (end - start));
    }

    step(still) {
      const goal = still ? 1 : this.target();
      this.shown = still ? goal : lerp(this.shown, goal, EASE);
      this.draw(this.shown);
    }

    draw() {}
  }

  /** Words fill from pale grey to ink one after another. */
  class InkWords extends Effect {
    constructor(el, range) {
      super(el, range);
      this.words = [...el.querySelectorAll('.w')];
    }

    draw(progress) {
      const n = this.words.length;
      this.words.forEach((word, i) => {
        const own = clamp(progress * (n + 2) - i);
        word.style.color = `color-mix(in srgb, var(--ink) ${Math.round(own * 100)}%, #cfcbc2)`;
      });
    }
  }

  /** The hero headline: its words ink in over the first few hundred pixels of scrolling. */
  class ScrollInk extends InkWords {
    target() {
      return clamp(window.scrollY / (this.words.length * 34 + 90));
    }
  }

  /** The hero deck: a stacked pile that fans out over the first part of the page. */
  class Deck extends Effect {
    target() {
      return clamp(window.scrollY / 380);
    }

    draw(progress) {
      // Narrow screens fan out less, so the outer cards stay on screen.
      const spread = Math.min(1, window.innerWidth / 900);
      this.el.querySelectorAll('.fan-card').forEach((card) => {
        const x = Number(card.dataset.x) * progress * spread;
        const r = Number(card.dataset.r) * progress;
        card.style.transform = `translateX(${x}px) rotate(${r}deg)`;
      });
      this.el.querySelectorAll('.fan-pop').forEach((pop) => {
        const own = clamp((window.scrollY - 260) / 140);
        pop.style.opacity = String(own);
        pop.style.translate = `0 ${(1 - own) * 14}px`;
      });
    }
  }

  /** Fades and lifts into place, a little later for each `--i`. */
  class Rise extends Effect {
    constructor(el) {
      const i = Number(el.style.getPropertyValue('--i')) || 0;
      super(el, [0.02 + i * 0.06, 0.3 + i * 0.06]);
    }

    draw(progress) {
      this.el.style.opacity = String(progress);
      this.el.style.translate = `0 ${(1 - progress) * 70}px`;
    }
  }

  /** A picture opens out from a rounded window to its full frame. */
  class Grow extends Effect {
    draw(progress) {
      const inset = (1 - progress);
      this.el.style.clipPath = `inset(${inset * 10}% ${inset * 18}% round ${28 + inset * 28}px)`;
    }
  }

  /** Drifts in from an offset given by data-dx/dy/dr. */
  class Drift extends Effect {
    draw(progress) {
      const { dx = 0, dy = 0, dr = 0 } = this.el.dataset;
      const away = 1 - progress;
      this.el.style.opacity = String(progress);
      this.el.style.transform = `translate(${dx * away}px, ${dy * away}px) rotate(${dr * away + Number(this.el.dataset.r || 0)}deg)`;
    }
  }

  /** Cards fly in from the corner, rest, then fly off, while their section passes. */
  class Travel extends Effect {
    draw(progress) {
      const r = Number(this.el.dataset.r || 0);
      let x; let y; let turn; let alpha;
      if (progress < 0.35) {
        const t = progress / 0.35;
        x = lerp(-320, 0, t); y = lerp(-420, 0, t); turn = lerp(-26, r, t); alpha = t;
      } else if (progress < 0.7) {
        x = 0; y = 0; turn = r; alpha = 1;
      } else {
        const t = (progress - 0.7) / 0.3;
        x = lerp(0, 60, t); y = lerp(0, -260, t); turn = r + 10 * t; alpha = 1 - t;
      }
      this.el.style.opacity = String(alpha);
      this.el.style.transform = `translate(${x}px, ${y}px) rotate(${turn}deg)`;
    }
  }

  /** Slides in from the right. */
  class SlideIn extends Effect {
    draw(progress) {
      this.el.style.opacity = String(0.2 + progress * 0.8);
      this.el.style.translate = `${(1 - progress) * 40}% 0`;
    }
  }

  const KINDS = { ink: InkWords, 'scroll-ink': ScrollInk, deck: Deck, rise: Rise, grow: Grow, drift: Drift, travel: Travel, slide: SlideIn };

  class Motion {
    /** @param {HTMLElement} root the page; every [data-motion] inside it moves */
    constructor(root) {
      this.root = root;
      this.still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      this.effects = [...root.querySelectorAll('[data-motion]')].map((el) => {
        const Kind = KINDS[el.dataset.motion];
        const range = el.dataset.range ? el.dataset.range.split(',').map(Number) : undefined;
        return Kind ? new Kind(el, range) : null;
      }).filter(Boolean);
    }

    start() {
      const frame = () => {
        if (!this.root.isConnected) return;
        this.effects.forEach((effect) => effect.step(this.still));
        if (!this.still) this.raf = requestAnimationFrame(frame);
      };
      frame();
    }
  }

  window.Cinnarios = window.Cinnarios || {};
  window.Cinnarios.Motion = Motion;
}());
