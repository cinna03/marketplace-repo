// The few line icons the shop pages share. Each returns markup that screen readers skip.
(function () {
  const svg = (paths, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;

  window.Cinnarios = window.Cinnarios || {};
  window.Cinnarios.icons = Object.freeze({
    back: () => svg('<path d="M15 5l-7 7 7 7"/>'),
    camera: () => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    next: () => svg('<path d="M9 5l7 7-7 7"/>'),
    upload: () => svg('<path d="M12 16V4M7 9l5-5 5 5M5 20h14"/>'),
    search: () => svg('<circle cx="11" cy="11" r="6.5"/><path d="M20 20l-4-4"/>'),
    close: () => svg('<path d="M6 6l12 12M18 6L6 18"/>', 16),
    heart: (filled) => svg(`<path fill="${filled ? 'currentColor' : 'none'}" d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z"/>`),
  });
}());
