/* ═══════════════════════════════════════════
   MedNama — UI renderer + practice/mock runners + AI + PDF/TTS
   ═══════════════════════════════════════════ */
const UI = (() => {

  // ── Practice/Mock session state ──
  const S = {
    mode: null,        // 'practice' | 'mock' | 'browse'
    title: '',
    queue: [],         // ordered list of qids in the rotation queue
    qidx: 0,           // index into queue
    answers: {},       // qid -> selected option idx
    correct: 0,
    wrong: 0,
    rotation: true,   // practice mode re-queues wrong MCQs
    repeats: {},       // qid -> count of re-queue times this session
    timerInt: null,
    timeLeft: 0,
    startTime: 0,
    mcqMap: {}        // qid -> normalized mcq (for current session)
  };

  let aiGenMCQs = []; // AI-generated MCQs in current session

  // ── Page dispatcher ──
  function render(page, el, params) {
    params = params || {};
    if (page === 'home')      return pageDashboard(el);
    if (page === 'bank')      return pageBank(el);
    if (page === 'subject')   return pageSubject(el, params.key);
    if (page === 'builder')   return pageBuilder(el);
    if (page === 'stats')     return pageStats(el);
    if (page === 'add-mcq')   return pageAddMCQ(el);
    if (page === 'pdf')       return pagePDF(el);
    if (page === 'ai-mcq')    return pageAIMCQ(el);
    pageNotFound(el, page);
  }

  // ── Dashboard ──
  function pageDashboard(el) {
    const g = Store.globalStats();
    const reviewedPct = g.attempted > 0 ? Math.round(g.correct / (g.correct + g.wrong || 1) * 100) : 0;
    el.innerHTML = `
      <div class="page-header">
        <h1>Dashboard</h1>
        <p>Track your progress across ${window.MANIFEST.reduce((n,grp)=>n+grp.subjects.length,0)} subjects</p>
      </div>
      <div class="stat-row">
        <div class="stat-card"><div class="stat-value">${g.attempted}</div><div class="stat-label">MCQs Answered</div></div>
        <div class="stat-card"><div class="stat-value">${reviewedPct}%</div><div class="stat-label">Accuracy</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--red);">${g.dueNow}</div><div class="stat-label">Due for Review</div></div>
        <div class="stat-card"><div class="stat-value">${g.subjectsAttempted}/${g.totalSubjects}</div><div class="stat-label">Subjects Started</div></div>
      </div>
      <div class="flex gap-12 wrap mb-20">
        <button class="btn btn-primary" onclick="UI.quickPractice()">⚡ Quick Practice (wrong rotation)</button>
        <button class="btn" onclick="App.go('builder')">📝 Build Mock Exam</button>
        <button class="btn" onclick="App.go('pdf')">📖 Read a Book / PDF</button>
        <button class="btn" onclick="App.go('ai-mcq')">🤖 AI-Generated MCQs</button>
      </div>
      <div class="section-title">Browse by specialty</div>
      ${window.MANIFEST.map(grp => `
        <div class="card" style="margin-bottom:12px;">
          <div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;">
            <span style="font-size:22px;">${grp.icon}</span>
            <strong style="flex:1">${grp.specialty}</strong>
            <span class="small muted">Paper ${grp.paper === 1 ? '1' : grp.paper === 2 ? '2' : '—'}</span>
          </div>
          <div class="grid grid-4">
            ${grp.subjects.map(s => {
              const st = Store.subjectStats(s.key);
              const pct = st ? st.percent : 0;
              return `
                <div class="subject-card" onclick="App.go('subject',{key:'${s.key}'})">
                  <div class="sc-head">
                    <div class="sc-icon" style="background:${grp.color};">${grp.icon}</div>
                    <div>
                      <div class="sc-title">${s.label}</div>
                      <div class="sc-sub">${st && st.total ? st.total + ' MCQs' : 'Tap to load'}</div>
                    </div>
                  </div>
                  <div class="progress"><div class="progress-fill ${pct > 80 ? 'green' : pct > 40 ? '' : pct > 0 ? 'yellow' : ''}" style="width:${pct}%;"></div></div>
                  <div class="small muted">${pct}% done${st && st.wrongDue ? ` · ${st.wrongDue} to review` : ''}</div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `).join('')}
    `;
    Store.preloadAll();
  }

  // ── MCQ Bank ──
  function pageBank(el) {
    el.innerHTML = `
      <div class="page-header">
        <h1>MCQ Bank</h1>
        <p>Pick a subject to browse / practice / build mock. Wrong MCQs auto-rotate for memorization.</p>
      </div>
      <div class="flex gap-12 wrap mb-20">
        <button class="btn btn-primary" onclick="UI.quickPractice()">⚡ Quick Practice</button>
        <button class="btn" onclick="App.go('builder')">📝 Mock Exam Builder</button>
        <button class="btn" onclick="App.go('ai-mcq')">🤖 AI-Generated MCQs</button>
      </div>
      ${window.MANIFEST.map(grp => `
        <div class="section-title">${grp.icon} ${grp.specialty} <span class="muted small">(Paper ${grp.paper === 1 ? '1' : '2'})</span></div>
        <div class="grid grid-3 mb-20">
          ${grp.subjects.map(s => {
            const st = Store.subjectStats(s.key);
            const pct = st ? st.percent : 0;
            return `
              <div class="subject-card" onclick="App.go('subject',{key:'${s.key}'})">
                <div class="sc-head">
                  <div class="sc-icon" style="background:${grp.color};">${grp.icon}</div>
                  <div>
                    <div class="sc-title">${s.label}</div>
                    <div class="sc-sub">${st && st.total ? st.total + ' MCQs · ' : ''}${pct}% done</div>
                  </div>
                </div>
                <div class="progress"><div class="progress-fill ${pct>80?'green':pct>0?'yellow':''}" style="width:${pct}%"></div></div>
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
    `;
  }

  // ── Subject detail ──
  function pageSubject(el, key) {
    const subj = window.SUBJECT_BY_KEY[key];
    if (!subj) { el.innerHTML = '<div class="card">Unknown subject.</div>'; return; }
    el.innerHTML = `
      <div class="breadcrumb">
        <a onclick="App.go('bank')">MCQ Bank</a><span class="sep">/</span>${subj.label}
      </div>
      <div class="page-header">
        <h1>${subj.icon} ${subj.label}</h1>
        <p>From <strong>${subj.specialty}</strong> · Paper ${subj.paper === 1 ? '1' : '2'}</p>
      </div>
      <div class="card" id="subj-stats">
        <div class="spinner"></div> Loading subject and live stats…
      </div>
      <div class="flex gap-12 wrap mt-16">
        <button class="btn btn-primary" onclick="UI.startSubjectPractice('${key}')">⚡ Practice (rotates wrong MCQs)</button>
        <button class="btn" onclick="UI.startSubjectBrowse('${key}')">📖 Browse All</button>
        <button class="btn" onclick="App.go('builder',{autoKeys:['${key}']})">📝 Use in Mock Exam</button>
        <button class="btn" onclick="App.go('add-mcq',{key:'${key}'})">➕ Add MCQ here</button>
      </div>
    `;
    Store.loadSubject(key).then(list => {
      const stats = Store.subjectStats(key);
      const c = document.getElementById('subj-stats');
      if (!c) return;
      c.innerHTML = `
        <div class="stat-row">
          <div class="stat-card"><div class="stat-value">${list.length}</div><div class="stat-label">Total MCQs</div></div>
          <div class="stat-card"><div class="stat-value">${stats ? stats.attempted : 0}</div><div class="stat-label">Answered</div></div>
          <div class="stat-card"><div class="stat-value">${stats ? stats.percent : 0}%</div><div class="stat-label">Done</div></div>
          <div class="stat-card"><div class="stat-value">${stats ? stats.wrongDue : 0}</div><div class="stat-label">Due for Review</div></div>
        </div>
        <div class="progress" style="height:10px;"><div class="progress-fill ${stats && stats.percent>80?'green':stats && stats.percent>0?'yellow':''}" style="width:${stats?stats.percent:0}%"></div></div>
        ${stats && stats.wrongDue > 0 ? `<p class="small muted mt-8">${stats.wrongDue} MCQs you got wrong are queued for rotation. Hit "Practice" to drill them.</p>` : ''}
      `;
    }).catch(err => {
      const c = document.getElementById('subj-stats');
      if (c) c.innerHTML = `<div class="card" style="color:var(--red);">⚠️ ${err.message}</div>`;
    });
  }

  // ── Quick practice ──
  async function quickPractice() {
    const keys = window.ALL_SUBJECTS.map(s => s.key).sort(() => Math.random() - 0.5).slice(0, 5);
    let all = [];
    for (const k of keys) {
      try {
        const list = await Store.loadSubject(k);
        if (list && list.length) all.push(...Store.buildPracticeSet(k, 4));
      } catch(e) {}
    }
    if (all.length === 0) {
      alert('No MCQ data loaded. Check downloaded_js/ folder.');
      return;
    }
    App.setTopbar('⚡ Quick Practice', 'rotating wrong MCQs');
    document.getElementById('view').innerHTML = '<div id="exam-host" class="exam-container"></div>';
    startSession({ mode: 'practice', title: 'Quick Practice', questions: all, rotation: true });
  }

  async function startSubjectPractice(key) {
    try {
      const list = await Store.loadSubject(key);
      if (!list || list.length === 0) { alert('No MCQs for ' + key); return; }
      const picked = Store.buildPracticeSet(key, Math.min(20, list.length));
      const subj = window.SUBJECT_BY_KEY[key];
      App.setTopbar(`⚡ ${subj.label}`, 'practice · rotates wrong MCQs');
      document.getElementById('view').innerHTML = '<div id="exam-host" class="exam-container"></div>';
      startSession({ mode: 'practice', title: subj.label, questions: picked, rotation: true });
    } catch(e) { alert(e.message); }
  }
  async function startSubjectBrowse(key) {
    try {
      const list = await Store.loadSubject(key);
      if (!list || list.length === 0) { alert('No MCQs for ' + key); return; }
      const subj = window.SUBJECT_BY_KEY[key];
      App.setTopbar(`📖 ${subj.label}`, 'browse — reveals answers instantly');
      document.getElementById('view').innerHTML = '<div id="exam-host" class="exam-container"></div>';
      startSession({ mode: 'browse', title: subj.label, questions: list.slice(), rotation: false });
    } catch(e) { alert(e.message); }
  }

  async function startMock(name, questions, durationSec) {
    App.setTopbar(`📝 ${name}`, `${questions.length} MCQs · timmed`);
    document.getElementById('view').innerHTML = '<div id="exam-host" class="exam-container"></div>';
    startSession({ mode: 'mock', title: name, questions, rotation: false, duration: durationSec });
  }

  // ── Session core ──
  function startSession(opts) {
    S.mode = opts.mode; S.title = opts.title;
    S.rotation = !!opts.rotation;
    S.answers = {}; S.correct = 0; S.wrong = 0;
    S.repeats = {}; S.mcqMap = {};
    UI._sessionActive = true;
    opts.questions.forEach(m => { S.mcqMap[m.qid] = m; });
    S.queue = opts.questions.map(m => m.qid);
    S.qidx = 0;
    S.startTime = Date.now();
    if (S.timerInt) clearInterval(S.timerInt);
    if (opts.duration) {
      S.timeLeft = opts.duration;
      S.timerInt = setInterval(() => {
        S.timeLeft--;
        updateTimer();
        if (S.timeLeft <= 0) { clearInterval(S.timerInt); showResults(true); }
      }, 1000);
    }
    renderQuestion();
  }

  function currentMCQ() {
    const qid = S.queue[S.qidx];
    return qid ? S.mcqMap[qid] : null;
  }

  function renderQuestion() {
    const host = document.getElementById('exam-host');
    if (!host) return;
    const q = currentMCQ();
    if (!q) { showResults(false); return; }
    const total = S.queue.length;
    const idx = S.qidx;
    const pct = Math.round((idx + 1) / total * 100);
    const answered = S.answers[q.qid];
    const letters = ['A','B','C','D','E','F'];
    const repeats = S.repeats[q.qid] || 0;

    host.innerHTML = `
      <div class="exam-meta">
        <span>Q ${idx + 1} of ${total} ${repeats ? `· repeat #${repeats}` : ''}</span>
        ${S.mode === 'mock' ? `<span class="exam-timer" style="font-weight:700;color:var(--accent);">${fmtTime(S.timeLeft)}</span>` : ''}
        <span>${S.mode === 'practice' ? `✅ ${S.correct} · ❌ ${S.wrong}` : S.mode === 'mock' ? `✅ ${S.correct} · ❌ ${S.wrong}` : ''}</span>
      </div>
      <div class="exam-progress"><div style="width:${pct}%"></div></div>
      <div class="q-card">
        <div class="q-text">${escapeHtml(q.q)}${q.t ? `<small>Topic: ${escapeHtml(q.t)}</small>` : ''}${q._ai ? '<small style="color:var(--accent);">AI-Generated</small>' : ''}</div>
        <div class="opts">
          ${q.opts.map((opt, i) => {
            let cls = 'opt';
            if (answered !== undefined) {
              if (i === q.ans) cls += ' correct';
              else if (i === answered) cls += ' incorrect';
              else cls += ' disabled';
              cls += ' locked';
            }
            return `<button class="${cls}" onclick="UI.selectAnswer(${i})" ${answered !== undefined ? 'disabled' : ''}>
              <span class="opt-letter">${letters[i] || (i+1)}</span>
              <span style="flex:1;">${escapeHtml(opt)}</span>
              ${i === q.ans && answered !== undefined ? '<span class="opt-icon">✓</span>' : ''}
              ${i === answered && i !== q.ans ? '<span class="opt-icon">✗</span>' : ''}
            </button>`;
          }).join('')}
        </div>
        ${answered !== undefined ? `
          <div class="explain">
            <div class="explain-label">Explanation</div>
            ${escapeHtml(q.e) || '<em class="muted">No stored explanation.</em>'}
          </div>
          <div class="exam-actions mt-16">
            <button class="btn btn-primary btn-sm" onclick="UI.askAIExplain()">💡 Explain with AI</button>
            <button class="btn btn-sm" onclick="UI.askAIAbout('${escapeAttr(q.q)}')">💬 Ask AI about this</button>
          </div>
        ` : ''}
      </div>
      <div class="exam-nav">
        <button class="btn btn-ghost" onclick="UI.prevQ()" ${idx === 0 ? 'disabled' : ''}>◀ Previous</button>
        <span class="small muted">${S.mode === 'practice' && S.rotation ? 'Wrong MCQs auto-rotate to the end of the queue' : ''}</span>
        ${S.mode === 'browse' ? `<button class="btn btn-primary" onclick="UI.nextQ()">Next ▶</button>` : ''}
        ${S.mode === 'mock' && answered !== undefined && idx < total - 1 ? `<button class="btn btn-primary" onclick="UI.nextQ()">Next ▶</button>` : ''}
        ${S.mode === 'mock' ? `<button class="btn btn-danger" onclick="UI.finishMock()">Submit Exam</button>` : ''}
        ${S.mode === 'practice' && answered !== undefined ? `<button class="btn btn-primary" onclick="UI.nextQ()">Next ▶</button>` : ''}
        <button class="btn btn-ghost" onclick="UI.exitSession()">✕ Exit</button>
      </div>
    `;
    if (S.mode === 'mock') updateTimer();
  }

  function selectAnswer(optIdx) {
    const q = currentMCQ();
    if (!q || S.answers[q.qid] !== undefined) return;
    S.answers[q.qid] = optIdx;
    const correct = optIdx === q.ans;
    if (correct) S.correct++; else S.wrong++;
    Store.record(q.qid, correct);
    if (S.mode === 'practice' && S.rotation && !correct) {
      const reps = S.repeats[q.qid] || 0;
      if (reps < 2) {
        S.repeats[q.qid] = reps + 1;
        S.queue.push(q.qid);
      }
    }
    renderQuestion();
  }

  function nextQ() {
    if (S.qidx < S.queue.length - 1) { S.qidx++; renderQuestion(); }
    else showResults(false);
  }
  function prevQ() {
    if (S.qidx > 0) { S.qidx--; renderQuestion(); }
  }
  function finishMock() {
    if (!confirm('Submit exam and view results?')) return;
    showResults(false);
  }
  function exitSession() {
    if (S.timerInt) clearInterval(S.timerInt);
    S.timerInt = null;
    UI._sessionActive = false;
    App.go('bank');
  }
  function cleanupSession() {
    if (S.timerInt) clearInterval(S.timerInt);
    S.timerInt = null;
    UI._sessionActive = false;
  }

  function showResults(timeUp) {
    if (S.timerInt) clearInterval(S.timerInt);
    let correct = 0, wrong = 0, skipped = 0;
    const uniqueQids = new Set(S.queue);
    uniqueQids.forEach(qid => {
      const a = S.answers[qid];
      if (a === undefined) skipped++;
      else {
        const m = S.mcqMap[qid];
        if (m && a === m.ans) correct++; else wrong++;
      }
    });
    const total = uniqueQids.size;
    const pct = total > 0 ? Math.round(correct / total * 100) : 0;
    const cls = pct >= 70 ? 'result-good' : pct >= 50 ? 'result-mid' : 'result-bad';
    const host = document.getElementById('exam-host');
    if (!host) return;
    host.innerHTML = `
      <div class="q-card" style="text-align:center;">
        <h1>📊 Results</h1>
        <p class="muted">${S.title}${timeUp ? ' · time up' : ''}</p>
        <div class="result-circle ${cls}">${pct}%</div>
        <div class="stat-row" style="justify-content:center;">
          <div class="stat-card"><div class="stat-value" style="color:var(--green);">${correct}</div><div class="stat-label">Correct</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--red);">${wrong}</div><div class="stat-label">Wrong</div></div>
          <div class="stat-card"><div class="stat-value" style="color:var(--yellow);">${skipped}</div><div class="stat-label">Skipped</div></div>
        </div>
        <div class="exam-actions" style="justify-content:center;">
          <button class="btn btn-primary" onclick="App.go('bank')">◀ Back to Bank</button>
          <button class="btn" onclick="UI.reviewWrong()">🔁 Review Wrong</button>
          <button class="btn" onclick="App.go('stats')">📈 See Stats</button>
        </div>
      </div>
    `;
  }

  function reviewWrong() {
    const wrong = [];
    Object.keys(S.answers).forEach(qid => {
      const m = S.mcqMap[qid]; const a = S.answers[qid];
      if (m && a !== m.ans) wrong.push(m);
    });
    if (wrong.length === 0) { alert('No wrong answers to review! 🎉'); return; }
    startSession({ mode: 'practice', title: 'Reviewing wrong MCQs', questions: wrong, rotation: true });
  }

  function updateTimer() {
    const el = document.querySelector('.exam-timer');
    if (el) el.textContent = fmtTime(S.timeLeft);
  }
  function fmtTime(sec) {
    if (sec < 0) sec = 0;
    const m = Math.floor(sec/60), s = sec%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }

  // ── AI panel ──
  let aiOpen = false;
  function toggleAIPanel() {
    aiOpen = !aiOpen;
    document.getElementById('ai-panel').classList.toggle('open', aiOpen);
    document.getElementById('ai-fab').style.display = aiOpen ? 'none' : 'flex';
    if (aiOpen) { document.getElementById('ai-input').focus(); }
  }
  function addMsg(cls, html) {
    const body = document.getElementById('ai-body');
    if (!body) return;
    const msg = document.createElement('div');
    msg.className = 'ai-msg ' + cls;
    msg.innerHTML = html;
    body.appendChild(msg);
    body.scrollTop = body.scrollHeight;
  }
  function sendAIText(text) {
    if (!text || !text.trim()) return;
    addMsg('user', escapeHtml(text));
    const cfg = AI.getConfig();
    const modelLabel = cfg.provider === 'opencode' ? cfg.ocModel : cfg.model;
    const placeholderId = 'think-' + Date.now();
    addMsg('bot', `<div id="${placeholderId}"><span class="spinner"></span> ${escapeHtml(modelLabel)} is thinking…</div>`);
    AI.chat(text).then(reply => {
      const p = document.getElementById(placeholderId);
      if (p) p.parentElement.innerHTML = renderReply(reply);
      else addMsg('bot', renderReply(reply));
    }).catch(err => {
      const p = document.getElementById(placeholderId);
      if (p) p.parentElement.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
      else addMsg('err', '⚠️ ' + escapeHtml(err.message));
    });
  }
  function renderReply(text) {
    return renderMarkdown(text);
  }

  // Simple markdown-to-HTML renderer
  // Supports: **bold**, *italic*, `code`, - lists, numbered lists, headings, paragraphs, links
  function renderMarkdown(text) {
    if (!text) return '';
    let html = escapeHtml(text);
    // Code blocks (```...```)
    html = html.replace(/```(\w*)\n?([\s\S]*?)```/g, (_, lang, code) => {
      return `<pre><code>${code.trim()}</code></pre>`;
    });
    // Inline code
    html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
    // Bold
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    // Headings
    html = html.replace(/^### (.+)$/gm, '<h4>$1</h4>');
    html = html.replace(/^## (.+)$/gm, '<h3>$1</h3>');
    html = html.replace(/^# (.+)$/gm, '<h2>$1</h2>');
    // Unordered lists
    html = html.replace(/^- (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');
    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');
    html = html.replace(/(?:^<li>.*<\/li>\n?)+/g, (match) => {
      if (!match.startsWith('<ol>')) return '<ol>' + match + '</ol>';
      return match;
    });
    // Fix consecutive <ul>/<ol> tags
    html = html.replace(/<\/ul>\n?<ul>/g, '');
    html = html.replace(/<\/ol>\n?<ol>/g, '');
    // Links
    html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
    // Paragraphs (double newlines)
    html = html.replace(/\n\n+/g, '</p><p>');
    // Single newlines -> <br>
    html = html.replace(/\n/g, '<br>');
    // Wrap in <p> if not already
    if (!html.startsWith('<')) html = '<p>' + html + '</p>';
    // Clean up empty tags
    html = html.replace(/<p><\/p>/g, '');
    html = html.replace(/<br><\/li>/g, '</li>');
    html = html.replace(/<\/ul><br>/g, '</ul>');
    html = html.replace(/<\/ol><br>/g, '</ol>');
    return html;
  }
  function askAIExplain() {
    const q = currentMCQ();
    if (!q) return;
    if (!aiOpen) toggleAIPanel();
    addMsg('user', `<strong>Explain this MCQ:</strong><br>${escapeHtml(q.q)}`);
    const placeholderId = 'think-' + Date.now();
    addMsg('bot', `<div id="${placeholderId}"><span class="spinner"></span> AI is explaining…</div>`);
    AI.explainMCQ(q).then(reply => {
      const p = document.getElementById(placeholderId);
      if (p) p.parentElement.innerHTML = renderReply(reply);
    }).catch(err => {
      const p = document.getElementById(placeholderId);
      if (p) p.parentElement.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
    });
  }
  function askAIAbout(questionText) {
    if (!aiOpen) toggleAIPanel();
    const input = document.getElementById('ai-input');
    if (input) input.value = 'About: ' + questionText.substring(0, 200);
    input && input.focus();
  }

  // ── AI Provider Settings (modal) ──
  function showAISettings() {
    const cfg = AI.getConfig();
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.innerHTML = `
      <div class="modal">
        <div class="modal-head">
          <h3>⚙️ AI Provider Settings</h3>
          <button class="btn btn-ghost btn-sm" onclick="this.closest('.modal-overlay').remove()">✕</button>
        </div>
        <div class="modal-body">
          <div class="field">
            <label>Provider</label>
            <select id="ai-provider">
              <option value="ollama" ${cfg.provider === 'ollama' ? 'selected' : ''}>Ollama (Local)</option>
              <option value="opencode" ${cfg.provider === 'opencode' ? 'selected' : ''}>Opencode AI (Cloud)</option>
            </select>
          </div>

          <div id="ai-settings-ollama" class="provider-settings" style="${cfg.provider === 'ollama' ? '' : 'display:none;'}">
            <div class="field">
              <label>Ollama URL</label>
              <input id="ai-ollama-url" value="${escapeAttr(cfg.url)}" placeholder="http://localhost:11434" />
            </div>
            <div class="field">
              <label>Model</label>
              <input id="ai-ollama-model" value="${escapeAttr(cfg.model)}" placeholder="qwen3:8b" />
            </div>
            <div class="small muted">
              Ensure Ollama is running: <code>ollama serve</code>.
              Pull a model: <code>ollama pull qwen3:8b</code>.
            </div>
          </div>

          <div id="ai-settings-opencode" class="provider-settings" style="${cfg.provider === 'opencode' ? '' : 'display:none;'}">
            <div class="field">
              <label>API Key</label>
              <input id="ai-oc-key" type="password" value="${escapeAttr(cfg.ocKey)}" placeholder="sk-..." />
            </div>
            <div class="small muted mb-12">
              Get your API key at <a href="https://opencode.ai/auth" target="_blank" rel="noopener">opencode.ai/auth</a> — sign in, add billing, copy key.
              Uses Zen API at <code>opencode.ai/zen/v1</code>.
              <strong>Note:</strong> If running from <code>file://</code>, you must serve the app via HTTP first:
              <code style="display:block;margin:4px 0;padding:6px 8px;background:var(--bg);border-radius:4px;">npx serve .</code>
              Then open <code>http://localhost:3000</code>.
            </div>
            <div class="field">
              <label>Model</label>
              <input id="ai-oc-model" value="${escapeAttr(cfg.ocModel)}" placeholder="big-pickle" />
              <div class="small muted mt-4">
                Recommended free models: <strong>big-pickle</strong>, <strong>deepseek-v4-flash-free</strong>, <strong>mimo-v2.5-free</strong>.
                Paid: <strong>deepseek-v4-flash</strong>, <strong>kimi-k2.5</strong>, <strong>qwen3.7-plus</strong>.
              </div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <div id="ai-settings-status" class="small muted"></div>
          <button class="btn btn-primary" onclick="UI.saveAISettings()">Save & Test</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    // Toggle visibility on provider change
    const sel = document.getElementById('ai-provider');
    sel.onchange = () => {
      document.getElementById('ai-settings-ollama').style.display = sel.value === 'ollama' ? '' : 'none';
      document.getElementById('ai-settings-opencode').style.display = sel.value === 'opencode' ? '' : 'none';
    };
  }

  function saveAISettings() {
    const provider = document.getElementById('ai-provider').value;
    const url = document.getElementById('ai-ollama-url').value.trim();
    const model = document.getElementById('ai-ollama-model').value.trim();
    const ocKey = document.getElementById('ai-oc-key').value.trim();
    const ocModel = document.getElementById('ai-oc-model').value.trim();
    const status = document.getElementById('ai-settings-status');
    status.innerHTML = '<span class="spinner"></span> Saving and testing…';
    status.style.color = '';
    AI.setConfig({ provider, url, model, ocKey, ocModel });
    AI.checkNow().then(s => {
      if (s.state === 'on') {
        status.innerHTML = '✅ Connected successfully.';
      } else {
        status.innerHTML = '⚠️ ' + escapeHtml(s.detail || 'Could not connect.');
        status.style.color = 'var(--red)';
        if (s.detail && s.detail.includes('CORS')) {
          status.innerHTML += '<br><br><strong>Fix:</strong> Open a terminal in the MedNama folder and run:<br><code>npx serve .</code><br>Then open http://localhost:3000 in your browser.';
        }
      }
      App.updateAIStatusDot(s);
    });
  }

  // ── AI MCQ Generation Page ──
  function pageAIMCQ(el) {
    el.innerHTML = `
      <div class="page-header">
        <h1>🤖 AI-Generated MCQs</h1>
        <p>Paste any medical text and let AI create practice questions from it.</p>
      </div>
      <div class="card" style="max-width:800px;">
        <div class="field">
          <label>Source Text</label>
          <textarea id="ai-mcq-text" rows="8" placeholder="Paste medical textbook content, notes, or any passage here…" style="width:100%;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:13px;resize:vertical;"></textarea>
        </div>
        <div class="flex center gap-12 wrap" style="margin-bottom:16px;">
          <div class="field" style="flex:0 0 120px;">
            <label>Number of MCQs</label>
            <input id="ai-mcq-count" type="number" value="5" min="1" max="20" />
          </div>
          <div class="field" style="flex:1;">
            <label>Topic (optional)</label>
            <input id="ai-mcq-topic" placeholder="e.g. Heart Failure, Diabetes…" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="UI.generateAIMCQs()">🎯 Generate MCQs</button>
        <div id="ai-mcq-status" class="small mt-8"></div>
      </div>
      <div id="ai-mcq-results" class="mt-20"></div>
    `;
  }

  async function generateAIMCQs() {
    const text = document.getElementById('ai-mcq-text').value.trim();
    const count = parseInt(document.getElementById('ai-mcq-count').value) || 5;
    const topic = document.getElementById('ai-mcq-topic').value.trim();
    const status = document.getElementById('ai-mcq-status');
    const results = document.getElementById('ai-mcq-results');

    if (!text) { status.textContent = '⚠️ Paste some text first.'; return; }

    const fullText = topic ? `Topic: ${topic}\n\n${text}` : text;
    status.innerHTML = '<span class="spinner"></span> AI is generating MCQs…';
    results.innerHTML = '';

    try {
      const mcqs = await AI.generateMCQs(fullText, count);
      aiGenMCQs = mcqs.map((m, i) => ({
        qid: '_ai:' + Date.now() + ':' + i,
        subjKey: '_ai',
        idx: i,
        q: m.q,
        opts: m.opts,
        ans: m.ans,
        e: m.e,
        t: m.t || topic,
        _ai: true
      }));
      status.innerHTML = `✅ Generated ${aiGenMCQs.length} MCQs. You can practice them below.`;

      // Show preview with practice button
      results.innerHTML = `
        <div class="card" style="max-width:800px;">
          <div class="flex between center mb-20">
            <strong>${aiGenMCQs.length} AI-Generated Questions</strong>
            <div class="flex gap-8">
              <button class="btn btn-primary btn-sm" onclick="UI.startAIMCQPractive()">⚡ Practice these</button>
              <button class="btn btn-sm" onclick="UI.regenerateAIMCQs()">🔄 Regenerate</button>
            </div>
          </div>
          <div class="ai-mcq-list">
            ${aiGenMCQs.map((m, i) => `
              <div class="ai-mcq-preview" onclick="UI.toggleAIPreview(${i})">
                <div class="ai-mcq-preview-q">${escapeHtml(m.q)}</div>
                <div class="ai-mcq-preview-ans" style="display:none;" id="ai-prev-${i}">
                  <div class="opts" style="margin:8px 0;">
                    ${m.opts.map((o, j) => `<div class="opt" style="cursor:default;${j === m.ans ? 'border-color:var(--green);background:rgba(46,204,113,.08);' : ''}">
                      <span class="opt-letter">${String.fromCharCode(65+j)}</span>
                      <span style="flex:1;">${escapeHtml(o)}</span>
                      ${j === m.ans ? '<span class="opt-icon" style="color:var(--green);">✓</span>' : ''}
                    </div>`).join('')}
                  </div>
                  <div class="explain"><div class="explain-label">Explanation</div>${escapeHtml(m.e) || '<em class="muted">No explanation.</em>'}</div>
                </div>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } catch(err) {
      status.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
    }
  }

  function toggleAIPreview(idx) {
    const el = document.getElementById('ai-prev-' + idx);
    if (el) el.style.display = el.style.display === 'none' ? 'block' : 'none';
  }

  function regenerateAIMCQs() {
    generateAIMCQs();
  }

  function startAIMCQPractive() {
    if (!aiGenMCQs.length) { alert('No AI MCQs generated yet.'); return; }
    App.setTopbar('🤖 AI-Generated MCQs', 'practice · ' + aiGenMCQs.length + ' questions');
    document.getElementById('view').innerHTML = '<div id="exam-host" class="exam-container"></div>';
    startSession({ mode: 'practice', title: 'AI MCQs', questions: aiGenMCQs, rotation: true });
  }

  // ── Stats page ──
  function pageStats(el) {
    const g = Store.globalStats();
    el.innerHTML = `
      <div class="page-header"><h1>Stats</h1><p>Per-subject progress and spaced-repetition status</p></div>
      <div class="stat-row">
        <div class="stat-card"><div class="stat-value">${g.attempted}</div><div class="stat-label">Answered</div></div>
        <div class="stat-card"><div class="stat-value">${g.correct}</div><div class="stat-label">Correct</div></div>
        <div class="stat-card"><div class="stat-value">${g.wrong}</div><div class="stat-label">Wrong</div></div>
        <div class="stat-card"><div class="stat-value" style="color:var(--red);">${g.dueNow}</div><div class="stat-label">Due for Review</div></div>
      </div>
      <div class="card mb-20">
        <strong>Settings</strong>
        <div class="flex gap-12 wrap mt-8">
          <button class="btn btn-danger btn-sm" onclick="if(confirm('Erase all progress? This cannot be undone.')){Store.clearAllProgress();App.go('stats');}">🗑️ Clear all progress</button>
          <button class="btn btn-sm" onclick="UI.showAISettings()">⚙️ AI / Provider settings</button>
        </div>
      </div>
      <div class="section-title">Per subject</div>
      <div class="grid grid-2">
        ${window.MANIFEST.flatMap(grp => grp.subjects.map(s => {
          const st = Store.subjectStats(s.key);
          const pct = st ? st.percent : 0;
          return `
            <div class="card subject-card" onclick="App.go('subject',{key:'${s.key}'})">
              <div class="sc-head">
                <div class="sc-icon" style="background:${grp.color};">${grp.icon}</div>
                <div>
                  <div class="sc-title">${s.label}</div>
                  <div class="sc-sub">${grp.specialty}${st && st.total ? ' · ' + st.total + ' MCQs' : ''}</div>
                </div>
              </div>
              <div class="progress"><div class="progress-fill ${pct>80?'green':pct>0?'yellow':''}" style="width:${pct}%"></div></div>
              <div class="small muted">${pct}% done${st && st.wrongDue ? ` · ${st.wrongDue} to review` : ''}</div>
            </div>
          `;
        })).join('')}
      </div>
    `;
  }

  // ── Add MCQ ──
  function pageAddMCQ(el, params) {
    const preKey = params && params.key ? params.key : '';
    el.innerHTML = `
      <div class="page-header"><h1>➕ Add New MCQ</h1><p>Saves to your browser only — re-used by future loads of the target subject</p></div>
      <div class="card" style="max-width:680px;">
        <div class="field">
          <label>Target Subject</label>
          <select id="am-subject">
            ${window.MANIFEST.flatMap(grp => grp.subjects.map(s => `<option value="${s.key}" ${s.key===preKey?'selected':''}>${grp.icon} ${s.label}</option>`)).join('')}
            <option value="_ai">🤖 AI-Generated (temporary)</option>
          </select>
        </div>
        <div class="field"><label>Topic (optional)</label><input id="am-topic" placeholder="e.g. Heart Failure" /></div>
        <div class="field"><label>Question</label><textarea id="am-q" rows="3" placeholder="Enter question…"></textarea></div>
        <div class="field">
          <label>Options (A,B,C,D)</label>
          ${['A','B','C','D'].map((l,i) => `<div class="flex center gap-8" style="margin-bottom:6px;"><strong style="width:18px;">${l})</strong><input id="am-opt-${i}" /></div>`).join('')}
        </div>
        <div class="field">
          <label>Correct Answer</label>
          <select id="am-ans">
            <option value="0">A</option><option value="1">B</option><option value="2">C</option><option value="3">D</option>
          </select>
        </div>
        <div class="field"><label>Explanation (optional)</label><textarea id="am-exp" rows="2" placeholder="Explain why…"></textarea></div>
        <div class="flex gap-12 wrap">
          <button class="btn btn-primary" onclick="UI.saveNewMCQ()">💾 Save</button>
        </div>
        <div id="am-status" class="small mt-8"></div>
      </div>
    `;
  }
  function saveNewMCQ() {
    const key = document.getElementById('am-subject').value;
    const t = document.getElementById('am-topic').value.trim();
    const q = document.getElementById('am-q').value.trim();
    const opts = [0,1,2,3].map(i => document.getElementById('am-opt-'+i).value.trim());
    const ans = parseInt(document.getElementById('am-ans').value);
    const e = document.getElementById('am-exp').value.trim();
    const st = document.getElementById('am-status');
    if (!q) { st.textContent = '⚠️ Enter a question.'; return; }
    if (opts.some(o => !o)) { st.textContent = '⚠️ Fill all four options.'; return; }
    Store.addUserMCQ(key, { q, o: opts, a: ans, e, t });
    st.innerHTML = '✅ Saved. It will appear next time you open this subject.';
  }

  // ── Mock Builder ──
  let selectedSpecs = new Set();
  let selectedSubjects = new Set();
  function pageBuilder(el, params) {
    if (params && params.autoKeys) params.autoKeys.forEach(k => selectedSubjects.add(k));
    el.innerHTML = `
      <div class="page-header"><h1>📝 Mock Exam Builder</h1>
        <p>Mix Paper 1 (basic sciences) + Paper 2 (specialty) questions. Pick specialties → optional subjects → start.</p>
      </div>
      <div class="card mb-20">
        <div class="section-title">1. Pick specialities</div>
        <div class="flex gap-8 wrap" id="specs-chips">
          ${window.MANIFEST.filter(g => g.paper !== 0).map(g => `
            <button class="chip ${selectedSpecs.has(g.specialty)?'selected':''}" onclick="UI.toggleSpec('${g.specialty.replace(/'/g,"\\'")}')">${g.icon} ${g.specialty}</button>
          `).join('')}
        </div>
        <div class="section-title">2. Pick specific subjects <span class="muted small">(optional — leave empty to include all from chosen specialties)</span></div>
        <div id="subj-chips" class="flex gap-8 wrap"></div>
      </div>
      <div class="card mb-20">
        <div class="flex center gap-12 wrap">
          <div class="field" style="flex:1;min-width:160px;">
            <label>Number of questions</label>
            <input id="b-count" type="number" value="40" min="5" max="300" />
          </div>
          <div class="field" style="flex:1;min-width:160px;">
            <label>% Paper 1 questions</label>
            <input id="b-p1" type="number" value="0" min="0" max="100" />
          </div>
          <div class="field" style="flex:1;min-width:160px;">
            <label>Duration (minutes)</label>
            <input id="b-dur" type="number" value="60" min="5" max="240" />
          </div>
        </div>
        <button class="btn btn-primary" onclick="UI.startBuilderMock()" style="margin-top:10px;">▶ Start Mock Exam</button>
        <div id="b-status" class="small mt-8"></div>
      </div>
    `;
    renderSubjChips();
  }
  function renderSubjChips() {
    const el = document.getElementById('subj-chips');
    if (!el) return;
    const pickedSpecs = Array.from(selectedSpecs);
    if (pickedSpecs.length === 0) { el.innerHTML = '<span class="small muted">Pick at least one specialty above.</span>'; return; }
    const subjects = window.MANIFEST.filter(g => selectedSpecs.has(g.specialty)).flatMap(g => g.subjects.map(s => ({...s, spec: g.specialty, icon: g.icon})));
    el.innerHTML = subjects.map(s => `
      <button class="chip ${selectedSubjects.has(s.key)?'selected':''}" onclick="UI.toggleSubj('${s.key}')">${s.icon} ${s.label}</button>
    `).join('');
  }
  function toggleSpec(name) {
    if (selectedSpecs.has(name)) selectedSpecs.delete(name);
    else { selectedSpecs.add(name); }
    selectedSubjects.clear();
    pageBuilder(document.getElementById('view'), null);
  }
  function toggleSubj(key) {
    if (selectedSubjects.has(key)) selectedSubjects.delete(key);
    else selectedSubjects.add(key);
    pageBuilder(document.getElementById('view'), null);
  }
  async function startBuilderMock() {
    const count = parseInt(document.getElementById('b-count').value) || 40;
    const p1pct = parseInt(document.getElementById('b-p1').value) || 0;
    const durMin = parseInt(document.getElementById('b-dur').value) || 60;
    let keys;
    if (selectedSubjects.size > 0) keys = Array.from(selectedSubjects);
    else keys = window.MANIFEST.filter(g => selectedSpecs.has(g.specialty)).flatMap(g => g.subjects.map(s => s.key));
    if (keys.length === 0) { document.getElementById('b-status').textContent = '⚠️ Pick at least one specialty.'; return; }
    document.getElementById('b-status').innerHTML = '<span class="spinner"></span> Loading ' + keys.length + ' subjects…';
    let ok = 0, failKeys = [], lastErr = '';
    for (const k of keys) {
      try {
        const list = await Store.loadSubject(k);
        ok++;
      } catch(e) { failKeys.push(k); lastErr = e && e.message; }
    }
    const picked = Store.buildExamSet(keys, count, p1pct);
    if (picked.length === 0) {
      document.getElementById('b-status').innerHTML = `⚠️ No MCQs loaded.<br>
        Loaded ${ok}/${keys.length} subjects.
        ${failKeys.length ? `Failed: <code>${failKeys.join(', ')}</code>.<br>Last error: <code>${escapeHtml(lastErr)}</code>` : ''}
        <br>If scripts failed to load, ensure you're opening main.html via <code>file:///E:/ENT/main.html</code>.`;
      return;
    }
    document.getElementById('b-status').textContent = '';
    startMock('Mock Exam', picked, durMin * 60);
  }

  // ── PDF reader with TTS + podcast + MCQ generation ──
  let ttsUtter = null, ttsChunks = null, ttsIdx = 0;
  function pagePDF(el) {
    el.innerHTML = `
      <div class="page-header"><h1>📖 Read a Book / PDF</h1>
        <p>Open any PDF from disk. Paste text to read it aloud with text-to-speech, let AI explain it, generate a podcast, or create MCQs.</p>
      </div>
      <div class="flex gap-12 wrap mb-20">
        <button class="btn btn-primary" onclick="document.getElementById('pdf-file').click()">📂 Open PDF from disk</button>
        <span class="small muted" id="pdf-filename"></span>
      </div>
      <input type="file" id="pdf-file" accept="application/pdf" style="display:none" onchange="UI.openPDF(this)">
      <div class="pdf-grid">
        <div>
          <iframe class="pdf-frame" id="pdf-frame" src="about:blank"></iframe>
          <div class="small muted mt-8">Tip: select text inside the PDF, copy it (Ctrl+C), then paste below. Browsers don't allow scripts to read PDF text directly for security.</div>
        </div>
        <div>
          <div class="card">
            <strong>Paste text to work with</strong>
            <textarea id="pdf-text" rows="6" placeholder="Paste text here…" style="width:100%;margin:8px 0;padding:9px;border:1px solid var(--border);border-radius:6px;font-size:13px;resize:vertical;"></textarea>
            <div class="tts-controls">
              <button class="btn btn-primary btn-sm" onclick="UI.ttsPlay()">▶ Read aloud</button>
              <button class="btn btn-sm" onclick="UI.ttsPause()">⏸ Pause</button>
              <button class="btn btn-sm" onclick="UI.ttsResume()">▶ Resume</button>
              <button class="btn btn-danger btn-sm" onclick="UI.ttsStop()">⏹ Stop</button>
            </div>
            <div class="field">
              <label>Voice</label>
              <select id="tts-voice"></select>
            </div>
            <div class="field"><label>Speed: <span id="tts-rate-val">1.0</span>×</label><input type="range" id="tts-rate" min="0.5" max="2" step="0.1" value="1" oninput="document.getElementById('tts-rate-val').textContent=this.value"></div>
            <div class="tts-progress" style="display:none;" id="tts-progress"><div style="width:0%"></div></div>
          </div>

          <div class="card mt-16 pdf-ai-actions">
            <strong>🤖 AI Actions</strong>
            <p class="small muted mt-8">Apply AI to your pasted text below.</p>
            <div class="ai-action-grid">
              <button class="btn btn-sm" onclick="UI.explainPDFText()">💡 Explain concepts</button>
              <button class="btn btn-sm" onclick="UI.generatePodcast()">🎙️ Generate podcast</button>
              <button class="btn btn-sm" onclick="UI.generateMCQsFromPDF()">📝 Generate MCQs</button>
            </div>
            <div id="pdf-ai-status" class="small mt-8"></div>
          </div>

          <div class="card mt-16" id="pdf-mcq-results"></div>
        </div>
      </div>
    `;
    loadVoices();
    if (window.speechSynthesis) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
  }
  function loadVoices() {
    const sel = document.getElementById('tts-voice');
    if (!sel || !window.speechSynthesis) return;
    const voices = window.speechSynthesis.getVoices();
    sel.innerHTML = voices.map((v, i) => `<option value="${i}">${v.name} (${v.lang})</option>`).join('');
  }
  function openPDF(input) {
    const file = input.files && input.files[0];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const frame = document.getElementById('pdf-frame');
    if (frame) frame.src = url;
    const fn = document.getElementById('pdf-filename');
    if (fn) fn.textContent = file.name;
  }

  function ttsPlay() {
    const ta = document.getElementById('pdf-text');
    if (!ta || !ta.value.trim()) { alert('Paste some text first.'); return; }
    if (!window.speechSynthesis) { alert('Text-to-speech not supported in this browser.'); return; }
    ttsStop();
    const text = ta.value.trim();
    ttsChunks = chunkText(text);
    ttsIdx = 0;
    const progress = document.getElementById('tts-progress');
    if (progress) { progress.style.display = 'block'; progress.firstElementChild.style.width = '0%'; }
    speakNextChunk();
  }
  function speakNextChunk() {
    if (!ttsChunks || ttsIdx >= ttsChunks.length) { ttsStop(); return; }
    const text = ttsChunks[ttsIdx];
    ttsUtter = new SpeechSynthesisUtterance(text);
    const vs = window.speechSynthesis.getVoices();
    const vIdx = parseInt(document.getElementById('tts-voice').value);
    if (vs && vs[vIdx]) ttsUtter.voice = vs[vIdx];
    const rate = parseFloat(document.getElementById('tts-rate').value) || 1;
    ttsUtter.rate = rate;
    ttsUtter.onend = () => {
      ttsIdx++;
      const progress = document.getElementById('tts-progress');
      if (progress) progress.firstElementChild.style.width = ((ttsIdx / ttsChunks.length) * 100) + '%';
      speakNextChunk();
    };
    ttsUtter.onerror = () => { ttsStop(); };
    window.speechSynthesis.speak(ttsUtter);
  }
  function chunkText(text) {
    const sentences = text.match(/[^.!?]+[.!?]*\s*/g) || [text];
    const chunks = [];
    let cur = '';
    sentences.forEach(s => {
      if ((cur + s).length > 200) { if (cur) chunks.push(cur); cur = s; }
      else cur += s;
    });
    if (cur) chunks.push(cur);
    return chunks;
  }
  function ttsPause() { if (window.speechSynthesis) window.speechSynthesis.pause(); }
  function ttsResume() { if (window.speechSynthesis) window.speechSynthesis.resume(); }
  function ttsStop() {
    if (window.speechSynthesis) { window.speechSynthesis.cancel(); }
    ttsUtter = null; ttsChunks = null; ttsIdx = 0;
    const p = document.getElementById('tts-progress');
    if (p) { p.style.display = 'none'; p.firstElementChild.style.width = '0%'; }
  }

  function generatePodcast() {
    const ta = document.getElementById('pdf-text');
    if (!ta || !ta.value.trim()) { alert('Paste some text first.'); return; }
    const status = document.getElementById('pdf-ai-status');
    status.innerHTML = '<span class="spinner"></span> AI is writing the podcast script…';
    AI.podcastScript(ta.value).then(script => {
      document.getElementById('pdf-text').value = script;
      status.innerHTML = '✅ Script ready. Press <strong>▶ Read aloud</strong> to hear it.';
      ttsPlay();
    }).catch(err => {
      status.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
    });
  }

  function explainPDFText() {
    const ta = document.getElementById('pdf-text');
    if (!ta || !ta.value.trim()) { alert('Paste some text first.'); return; }
    const status = document.getElementById('pdf-ai-status');
    const text = ta.value;

    // Show thinking state
    status.innerHTML = '<span class="spinner"></span> AI is analyzing and explaining…';

    // Also send to AI panel
    if (!aiOpen) toggleAIPanel();
    addMsg('user', '<strong>Explain this passage:</strong><br><em>' + escapeHtml(text.substring(0, 200)) + (text.length > 200 ? '…' : '') + '</em>');
    const ph = 'think-' + Date.now();
    addMsg('bot', `<div id="${ph}"><span class="spinner"></span> AI explaining…</div>`);

    AI.chat(
      'Explain the key concepts in the following medical passage. Be thorough but organized.\n\n' +
      'Format your response with:\n' +
      '- **Key Concept**: brief explanation\n' +
      '- **Clinical Relevance**: why it matters\n' +
      '- **Takeaway**: one-sentence summary\n\n' +
      'Passage:\n' + text.substring(0, 5000), {
      system: 'You are a senior medical tutor explaining to students. Use markdown (**bold** for key terms, bullet points). Organize by concepts. ~250 words.'
    }).then(reply => {
      status.innerHTML = '✅ Explanation complete.';
      // Update AI panel
      const p = document.getElementById(ph);
      if (p) p.parentElement.innerHTML = renderReply(reply);
      // Also show inline in the PDF page for easy reference
      const results = document.getElementById('pdf-mcq-results');
      if (results) {
        results.innerHTML =
          '<div class="card">' +
          '<div class="flex between center mb-12"><strong>💡 Explanation</strong><button class="btn btn-ghost btn-sm" onclick="this.closest(\'.card\').remove()">✕</button></div>' +
          '<div class="explain-text">' + renderReply(reply) + '</div>' +
          '</div>';
      }
    }).catch(err => {
      status.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
      const p = document.getElementById(ph);
      if (p) p.parentElement.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
    });
  }

  async function generateMCQsFromPDF() {
    const ta = document.getElementById('pdf-text');
    if (!ta || !ta.value.trim()) { alert('Paste some text first.'); return; }
    const status = document.getElementById('pdf-ai-status');
    const results = document.getElementById('pdf-mcq-results');
    status.innerHTML = '<span class="spinner"></span> AI is generating MCQs…';
    results.innerHTML = '';

    try {
      const mcqs = await AI.generateMCQs(ta.value.substring(0, 5000), 5);
      const normalised = mcqs.map((m, i) => ({
        qid: '_ai:' + Date.now() + ':' + i,
        subjKey: '_ai',
        idx: i,
        q: m.q,
        opts: m.opts,
        ans: m.ans,
        e: m.e,
        t: m.t || '',
        _ai: true
      }));
      aiGenMCQs = normalised;
      status.innerHTML = `✅ ${normalised.length} MCQs generated!`;

      results.innerHTML = `
        <strong>${normalised.length} AI-Generated MCQs</strong>
        <button class="btn btn-primary btn-sm" style="float:right;" onclick="UI.startAIMCQPractive()">⚡ Practice</button>
        <div class="ai-mcq-list mt-8">
          ${normalised.map((m, i) => `
            <div class="ai-mcq-preview" onclick="UI.toggleAIPreview(${i})">
              <div class="ai-mcq-preview-q">${i+1}. ${escapeHtml(m.q)}</div>
              <div class="ai-mcq-preview-ans" style="display:none;" id="ai-prev-${i}">
                <div class="opts" style="margin:8px 0;">
                  ${m.opts.map((o, j) => `<div class="opt" style="cursor:default;${j === m.ans ? 'border-color:var(--green);background:rgba(46,204,113,.08);' : ''}">
                    <span class="opt-letter">${String.fromCharCode(65+j)}</span>
                    <span style="flex:1;">${escapeHtml(o)}</span>
                    ${j === m.ans ? '<span class="opt-icon" style="color:var(--green);">✓</span>' : ''}
                  </div>`).join('')}
                </div>
                <div class="explain"><div class="explain-label">Explanation</div>${escapeHtml(m.e) || '<em class="muted">No explanation.</em>'}</div>
              </div>
            </div>
          `).join('')}
        </div>
      `;
    } catch(err) {
      status.innerHTML = `<span style="color:var(--red);">⚠️ ${escapeHtml(err.message)}</span>`;
    }
  }

  // ── Helpers ──
  function escapeHtml(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
  function escapeAttr(s) {
    return String(s || '').replace(/'/g, "\\'").replace(/"/g,'&quot;');
  }
  function pageNotFound(el, page) {
    el.innerHTML = `<div class="card">Page not found: ${escapeHtml(page)}</div>`;
  }

  return {
    render,
    quickPractice,
    startSubjectPractice, startSubjectBrowse, startMock,
    selectAnswer, nextQ, prevQ, finishMock, exitSession, cleanupSession, reviewWrong,
    askAIExplain, askAIAbout, sendAIText, toggleAIPanel, showAISettings, saveAISettings,
    saveNewMCQ,
    toggleSpec, toggleSubj, startBuilderMock,
    openPDF, ttsPlay, ttsPause, ttsResume, ttsStop, generatePodcast, explainPDFText,
    generateMCQsFromPDF, generateAIMCQs, toggleAIPreview, regenerateAIMCQs, startAIMCQPractive
  };
})();
window.UI = UI;
