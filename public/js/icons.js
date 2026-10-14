// Lop bao quanh thu vien icon Lucide (https://lucide.dev) - dung chung cho ca
// trang admin va 2 trang cong khai.
//
// Cach dung trong HTML / template string:   <i data-lucide="users"></i>
// hoac                                      Icons.html('users', 'ic-lg')
//
// Cac module admin render lai bang HTML bang innerHTML rat nhieu lan, nen thay vi
// bat moi noi tu goi createIcons(), o day dung MutationObserver co debounce:
// moi khi DOM doi thi ve lai nhung icon chua duoc ve. Luc ve phai NGAT observer
// (lucide thay the <i> bang <svg> -> chinh no cung la mot thay doi DOM) roi noi lai,
// neu khong se lap vo tan.

window.Icons = (function () {
  let pending = null;
  let observer = null;
  let ready = false;

  function paint(root) {
    if (!window.lucide || typeof window.lucide.createIcons !== 'function') return;

    const scope = root && root.querySelectorAll ? root : document;
    if (!scope.querySelector('[data-lucide]')) return;

    if (observer) observer.disconnect();
    try {
      window.lucide.createIcons({
        attrs: { 'stroke-width': 1.75, 'aria-hidden': 'true', focusable: 'false' },
      });
    } catch (err) {
      console.error('[icons] khong ve duoc icon:', err);
    }
    if (observer) startObserving();
  }

  function schedule() {
    clearTimeout(pending);
    pending = setTimeout(() => paint(document), 16);
  }

  function startObserving() {
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // Tra ve chuoi HTML de nhung vao template string
  function html(name, className) {
    return `<i data-lucide="${name}"${className ? ` class="${className}"` : ''}></i>`;
  }

  function init() {
    if (ready) return;
    ready = true;
    paint(document);

    observer = new MutationObserver((records) => {
      // Bo qua neu thay doi chi la <svg> do chinh lucide vua chen vao
      const meaningful = records.some((rec) =>
        [...rec.addedNodes].some(
          (node) => node.nodeType === 1 && (node.matches('[data-lucide]') || node.querySelector('[data-lucide]'))
        )
      );
      if (meaningful) schedule();
    });
    startObserving();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  return { paint, html, refresh: schedule };
})();
