// The homepage, as in the full-motion design: a headline that inks in as you scroll over a
// fanning deck of paintings, the Try your own piece band, a line of words with pictures in
// it, how the wall helps you decide, a carousel, three steps, and two closing cards.
// It only draws; Motion (motion.js) moves whatever carries data-motion.
(function () {
  const FAN = Object.freeze([[-300, -14], [-200, -9], [-100, -4], [0, 0], [100, 4], [200, 9], [300, 14]]);
  const MOODS = Object.freeze(['bright', 'cool', 'warm', 'grounded']);

  class HomePage {
    /**
     * @param {object[]} catalog
     * @param {(work: object) => {mood: string, subject: string}} describe
     * @param {{esc: Function, money: Function}} format
     */
    constructor(catalog, describe, format) {
      this.catalog = catalog;
      this.describe = describe;
      this.esc = format.esc;
      this.money = format.money;
    }

    img(work, extra = '') {
      return `<img src="${this.esc(work.thumbnailUrl || work.imageUrl)}" alt="${extra}" loading="lazy" decoding="async" />`;
    }

    words(text) {
      return text.split(' ').map((word) => `<span class="w">${this.esc(word)}</span>`).join(' ');
    }

    pick(start, count) {
      const list = this.catalog;
      return Array.from({ length: Math.min(count, list.length) }, (_, i) => list[(start + i) % list.length]);
    }

    /** One painting per mood, for the "wall helps you decide" tiles. */
    byMood() {
      return MOODS.map((mood) => this.catalog.find((work) => this.describe(work).mood === mood)).filter(Boolean);
    }

    html() {
      const esc = this.esc;
      const fan = this.pick(0, FAN.length);
      const hero = fan[Math.floor(fan.length / 2)];
      const travel = this.pick(7, 3);
      const grow = this.pick(10, 1)[0];
      const shuffle = this.pick(11, 4);
      const inline = this.pick(15, 2);
      const carousel = this.pick(17, 8);
      const wide = this.catalog.find((work) => Number(work.widthCm) > Number(work.heightCm) * 1.2) || carousel[0];
      const icons = window.Cinnarios.icons;
      return `
      <div class="home">
        <section class="home-hero" data-motion="deck">
          <p class="eyebrow">Paintings at their real size</p>
          <h1 data-motion="scroll-ink">${this.words("See it on your wall before it's yours.")}</h1>
          <p class="home-lede">Every painting here opens in your phone's camera at its true size. Hang it, step back, and decide with help.</p>
          <div class="piece-actions home-actions"><a class="button" href="#gallery">Browse the collection</a><a class="button quiet" href="#try-own">Try your own piece</a></div>
          <div class="fan">
            ${fan.map((work, i) => `<a class="fan-card" href="#work/${esc(work.sourceId)}/home" data-x="${FAN[i][0]}" data-r="${FAN[i][1]}" style="z-index:${10 - Math.abs(i - 3)}">${this.img(work, esc(`${work.title}, ${work.artist || 'unknown artist'}`))}</a>`).join('')}
            ${hero ? `<span class="fan-pop fan-size">${esc(hero.widthCm)} × ${esc(hero.heightCm)} cm</span>` : ''}
            <span class="fan-pop fan-camera"><span class="fan-camera-icon">${icons.camera()}</span><span><strong>Open in camera</strong><br>Hang it on your wall</span></span>
          </div>
        </section>

        <section class="home-try">
          <div class="home-try-copy">
            <p class="eyebrow">Try your own piece</p>
            <h2 data-motion="ink" data-range="0.1,0.45">${this.words('Already have a print? See it here first.')}</h2>
            <p>Upload a photo of it, enter its size in centimetres, and hang it on your wall in the camera, next to anything from the collection.</p>
            <a class="button" href="#try-own">${icons.upload()}Upload a photo</a>
          </div>
          <div class="home-try-art">
            ${travel.map((work, i) => `<span class="travel-card" data-motion="travel" data-r="${[-8, 5, -3][i]}" style="left:${12 + i * 26}%">${this.img(work)}</span>`).join('')}
            ${grow ? `<div class="grow-frame" data-motion="grow" data-range="0,0.45">${this.img(grow, esc(grow.title))}<span class="tag tag-blush">${esc(grow.widthCm)} × ${esc(grow.heightCm)} cm</span><span class="grow-label">Your photo</span></div>` : ''}
          </div>
        </section>

        <section class="home-say">
          <div class="say-cards">${shuffle.map((work, i) => `<span class="say-card" data-motion="drift" data-dx="${[-40, 30, -20, 50][i]}" data-dy="60" data-dr="${[-10, 8, -6, 12][i]}" data-r="${[-6, 4, -3, 7][i]}">${this.img(work)}</span>`).join('')}</div>
          <p class="say-line" data-motion="ink" data-range="0.15,0.6">${this.words("Whether it's a first home")} ${inline[0] ? `<span class="w say-pic">${this.img(inline[0])}</span>` : ''} ${this.words('or a room you love, the right painting, real size, is one scan away')} ${inline[1] ? `<span class="w say-pic">${this.img(inline[1])}</span>` : ''}</p>
        </section>

        <section class="home-decide">
          <div>
            <h2 data-motion="ink" data-range="0.1,0.45">${this.words('Not sure? The wall helps you decide.')}</h2>
            <p>Once a painting is locked on your wall, ask about the size, the light, the colour or the price. Answers come from the museum record, and the next suggestions follow what you said.</p>
          </div>
          <div class="mood-tiles">${this.byMood().map((work, i) => `<a class="mood-tile" href="#work/${esc(work.sourceId)}/home" data-motion="drift" data-dx="${i % 2 ? 40 : -40}" data-dy="50" data-dr="${i % 2 ? 6 : -6}">${this.img(work, esc(work.title))}<span class="tag">${esc(this.describe(work).mood)}</span></a>`).join('')}</div>
        </section>

        <section class="home-carousel">
          <div class="block-head"><div><p class="eyebrow">From the collection</p><h2 data-motion="ink" data-range="0.1,0.4">${this.words("A museum's worth of walls")}</h2></div>
            <div class="carousel-arrows"><button type="button" class="round-button" data-scroll="-1" aria-label="Previous">${icons.back()}</button><button type="button" class="round-button" data-scroll="1" aria-label="Next">${icons.next()}</button></div></div>
          <div class="carousel" data-motion="slide" data-range="0,0.4">${carousel.map((work) => `<a class="tile" href="#work/${esc(work.sourceId)}/home">${this.img(work)}<strong>${esc(work.title)}</strong><span>${esc(work.artist || 'Unknown artist')} · ${esc(work.widthCm)} × ${esc(work.heightCm)} cm</span><span class="tile-price">${esc(this.money(work.priceAmount, work.currency))}</span></a>`).join('')}</div>
        </section>

        <section class="home-steps">
          <h2 data-motion="ink" data-range="0.1,0.4">${this.words('Three steps, one wall')}</h2>
          <div class="steps">
            ${[['Pick a painting', 'Browse by mood, subject or size. Each work keeps its museum centimetres.'], ['Hang it in the camera', 'Find a wall, tap to place, slide it where you want, then lock it.'], ['Decide with help', "Say what you're unsure about. Swap in another piece on the same spot."]].map(([title, text], i) => `<div class="step-card" data-motion="rise" style="--i:${i}"><span>0${i + 1}</span><h3>${title}</h3><p>${text}</p></div>`).join('')}
          </div>
        </section>

        <section class="home-cards">
          <a class="promo promo-art" href="#search" data-motion="rise" style="--i:0">${wide ? this.img(wide) : ''}<span><strong>Landscapes for<br>wide walls</strong><span class="button quiet">See landscapes</span></span></a>
          <div class="promo promo-blush" data-motion="rise" style="--i:1"><h2>Your tries,<br>kept for you</h2><p>Every painting you hang is saved to your account with the picture of your wall, so you can come back or send it to someone.</p><a class="button" href="#account">Open your tries</a></div>
        </section>

        <footer class="home-footer">
          <div><strong>Your walls, your art.</strong><p>Works shown come from The Metropolitan Museum of Art's open-access collection and are listed as demonstrations.</p></div>
          <nav aria-label="More"><a href="#gallery">Discover</a><a href="#search">Search</a><a href="#try-own">Try your own piece</a><a href="#account">Account</a><a href="#cart">Cart</a></nav>
        </footer>
      </div>`;
    }

    bind() {
      const home = document.querySelector('.home');
      home.querySelector('.promo-art')?.addEventListener('click', () => {
        try { sessionStorage.setItem('cinnarios.search', 'landscape'); } catch { /* nothing kept */ }
      });
      const carousel = home.querySelector('.carousel');
      home.querySelectorAll('[data-scroll]').forEach((button) => button.addEventListener('click', () => {
        carousel.scrollBy({ left: Number(button.dataset.scroll) * carousel.clientWidth * 0.8, behavior: 'smooth' });
      }));
      new window.Cinnarios.Motion(home).start();
    }
  }

  window.Cinnarios = window.Cinnarios || {};
  window.Cinnarios.HomePage = HomePage;
}());
