/* ═══════════════════════════════════════════
   MedNama — App entry + routing + sidebar/AI status
   ═══════════════════════════════════════════ */
const App = (() => {
  let current = 'home';
  let params = {};

  function init() {
    AI.startPolling();
    AI.onStatus(updateAIStatusDot);
    registerSW();
    const h = window.location.hash.replace('#', '');
    if (h && h !== 'home') go(h, params);
    else go('home');
    const mb = document.getElementById('menu-btn');
    if (mb) mb.onclick = () => { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('overlay').classList.toggle('open'); };
    const ov = document.getElementById('overlay');
    if (ov) ov.onclick = () => { document.getElementById('sidebar').classList.remove('open'); document.getElementById('overlay').classList.remove('open'); };
    const aiInput = document.getElementById('ai-input');
    if (aiInput) {
      aiInput.onkeydown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          UI.sendAIText(aiInput.value);
          aiInput.value = '';
        }
      };
    }
    const aiSend = document.getElementById('ai-send');
    if (aiSend) aiSend.onclick = () => {
      UI.sendAIText(aiInput.value);
      aiInput.value = '';
    };
    const aiFab = document.getElementById('ai-fab');
    if (aiFab) aiFab.onclick = () => UI.toggleAIPanel();
    const aiClose = document.getElementById('ai-close');
    if (aiClose) aiClose.onclick = () => UI.toggleAIPanel();
  }

  async function registerSW() {
    if ('serviceWorker' in navigator) {
      try {
        const reg = await navigator.serviceWorker.register('./sw.js', { scope: './' });
      } catch(e) {
        console.warn('SW registration failed:', e);
      }
    }
  }

  function go(page, p) {
    params = p || {};
    current = page;
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const navEl = document.querySelector(`.nav-item[data-page="${page}"]`);
    if (navEl) navEl.classList.add('active');
    setTopbar(titleFor(page), '');
    const view = document.getElementById('view');
    if (!view) return;
    view.innerHTML = '';
    if (typeof UI.cleanupSession === 'function') UI.cleanupSession();
    if (window.speechSynthesis) window.speechSynthesis.cancel();
    document.getElementById('sidebar') && document.getElementById('sidebar').classList.remove('open');
    document.getElementById('overlay') && document.getElementById('overlay').classList.remove('open');
    UI.render(page, view, params);
  }

  function titleFor(page) {
    return ({
      home: 'Dashboard', bank: 'MCQ Bank', subject: 'Subject',
      builder: 'Mock Exam Builder', stats: 'Stats',
      'add-mcq': 'Add MCQ', pdf: 'Read PDF', 'ai-mcq': 'AI MCQs'
    })[page] || 'MedNama';
  }

  function setTopbar(title, sub) {
    const t = document.getElementById('topbar-title');
    if (t) t.innerHTML = '<h1>' + escapeHtml(title) + '</h1>' + (sub ? '<div class="crumbs">' + escapeHtml(sub) + '</div>' : '');
  }

  function updateAIStatusDot(status) {
    const dot = document.getElementById('ai-dot');
    const label = document.getElementById('ai-label');
    const model = document.getElementById('ai-model');
    if (!dot || !label) return;
    dot.className = 'ai-dot ' + status.state;
    const provider = status.provider || AI.getProvider();
    if (status.state === 'on') {
      const providerLabel = provider === 'opencode' ? 'Opencode AI' : 'Ollama';
      label.textContent = providerLabel + ' ready';
      model.textContent = (provider === 'opencode' ? AI.getOCModel() : AI.getModel()) + (status.hasWanted === false ? ' — not available' : '');
    } else if (status.state === 'off') {
      label.textContent = provider === 'opencode' ? 'AI not configured' : 'Ollama not running';
      model.textContent = provider === 'opencode' ? (status.detail || 'No API key') : AI.getUrl();
    } else {
      label.textContent = 'Checking AI…';
      model.textContent = provider === 'opencode' ? 'opencode.ai' : AI.getUrl();
    }
  }

  function escapeHtml(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  document.addEventListener('DOMContentLoaded', init);
  return { go, setTopbar, updateAIStatusDot };
})();
window.App = App;
