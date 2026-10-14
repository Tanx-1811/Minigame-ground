// Lop bao quanh thu vien icon Lucide (https://lucide.dev).
//
// Cach dung trong HTML / template string:   <i data-lucide="users"></i>
// hoac                                      Icons.html('users', 'ic-lg')
//
// Vi sao khong goi thang lucide.createIcons():
// Ham do khong nhan pham vi - moi lan goi la quet ca document va dung lai TAT CA
// icon tren trang. Trang admin co hang tram icon, ma DOM thi thay doi lien tuc
// (dong ho dem nguoc ghi lai moi giay, bang ve lai sau moi thao tac) -> moi giay
// lai dung lai hang tram the SVG, trang giat va bam nut khong kip phan hoi.
//
// O day tu dung SVG tu lucide.icons, co GIOI HAN PHAM VI (chi ve trong nhanh DOM
// vua them) va CO BO NHO DEM theo ten icon. Nho vay dong ho chi ve lai 1 icon
// cua rieng no thay vi ca trang.

window.Icons = (function () {
  const cache = new Map();
  let observer = null;
  let ready = false;

  // 'users-round' -> 'UsersRound' ; 'share-2' -> 'Share2'
  function pascal(name) {
    return String(name)
      .split('-')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  const SVG_NS = 'http://www.w3.org/2000/svg';
  const BASE_ATTRS = {
    xmlns: SVG_NS,
    width: '24',
    height: '24',
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '1.75',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    focusable: 'false',
  };

  // Dung 1 lan cho moi ten icon roi giu lai; cac lan sau chi can cloneNode.
  function template(name) {
    if (cache.has(name)) return cache.get(name);

    const nodes = window.lucide && window.lucide.icons ? window.lucide.icons[pascal(name)] : null;
    if (!nodes) {
      cache.set(name, null);
      return null;
    }

    const svg = document.createElementNS(SVG_NS, 'svg');
    Object.entries(BASE_ATTRS).forEach(([k, v]) => svg.setAttribute(k, v));
    svg.setAttribute('class', 'lucide');

    nodes.forEach(([tag, attrs]) => {
      const child = document.createElementNS(SVG_NS, tag);
      Object.entries(attrs || {}).forEach(([k, v]) => child.setAttribute(k, v));
      svg.appendChild(child);
    });

    cache.set(name, svg);
    return svg;
  }

  // Ve moi <i data-lucide> trong pham vi root (ke ca chinh root).
  function paint(root) {
    const scope = root && root.querySelectorAll ? root : document;
    if (!window.lucide || !window.lucide.icons) return;

    const targets = [];
    if (scope.nodeType === 1 && scope.matches && scope.matches('[data-lucide]')) targets.push(scope);
    scope.querySelectorAll('[data-lucide]').forEach((el) => targets.push(el));
    if (!targets.length) return;

    targets.forEach((el) => {
      const tpl = template(el.getAttribute('data-lucide'));
      if (!tpl) return;

      const svg = tpl.cloneNode(true);
      // Giu lai class (ic-sm, ic-lg...) ma noi goi da dat tren the <i>
      const extra = el.getAttribute('class');
      if (extra) svg.setAttribute('class', `lucide ${extra}`);
      const title = el.getAttribute('title');
      if (title) svg.setAttribute('aria-label', title);

      el.replaceWith(svg);
    });
  }

  function html(name, className) {
    return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''}></i>`;
  }

  function refresh() {
    paint(document);
  }

  function init() {
    if (ready) return;
    ready = true;
    paint(document);

    // Chi ve trong CAC NHANH VUA DUOC THEM, khong quet lai ca trang.
    observer = new MutationObserver((records) => {
      for (const rec of records) {
        for (const node of rec.addedNodes) {
          if (node.nodeType !== 1) continue;
          if (node.matches('[data-lucide]') || node.querySelector('[data-lucide]')) {
            paint(node);
          }
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { paint, html, refresh };
})();
