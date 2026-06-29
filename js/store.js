/* ═══════════════════════════════════════════
   MedNama — Store
   Loads MCQ data from downloaded_js/ via dynamic <script> tag injection.
   Tracks per-MCQ progress in localStorage with spaced repetition.
   ═══════════════════════════════════════════ */
const Store = (() => {
  const DATA_BASE = './downloaded_js/';
  const cache = {};           // key -> normalized MCQ array
  const loading = {};         // key -> Promise
  // window.MM is the global populated by the data files (window.MM['key'] = [...])

  // ── Normalize data shape ──
  // Raw MCQ: {q, a, b, c, d, ans:"A", e, t}
  // Output: {qid, subjKey, idx, q, opts[], ans:0-5, e, t}
  function norm(key, rawList) {
    return (rawList || []).map((m, i) => {
      let opts, ansIdx;
      if (Array.isArray(m.opts)) {
        opts = m.opts;
        ansIdx = typeof m.ans === 'number' ? m.ans :
                 ['A','B','C','D','E','F'].indexOf((m.ans || 'A').toUpperCase());
      } else if (Array.isArray(m.o)) {
        opts = m.o;
        ansIdx = typeof m.a === 'number' ? m.a :
                 ['A','B','C','D','E','F'].indexOf((m.a || 'A').toUpperCase());
      } else {
        // a/b/c/d are options, e is the explanation — keep them separate
        opts = [m.a||'', m.b||'', m.c||'', m.d||''];
        ansIdx = ['A','B','C','D','E','F'].indexOf((m.ans || 'A').toUpperCase());
      }
      if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
      return {
        qid: `${key}:${i}`,
        subjKey: key,
        idx: i,
        q: m.q || m.question || '',
        opts,
        ans: ansIdx,
        e: m.e || m.exp || m.explanation || '',
        t: m.t || ''
      };
    });
  }

  // ── Load a single subject's MCQs (script-tag injection for file://) ──
  function loadSubject(key) {
    if (cache[key]) return Promise.resolve(cache[key]);
    if (loading[key]) return loading[key];
    const subj = window.SUBJECT_BY_KEY[key];
    if (!subj) return Promise.reject(new Error('Unknown subject: ' + key));
    const p = new Promise((resolve, reject) => {
      window.MM = window.MM || {};
      const s = document.createElement('script');
      s.src = DATA_BASE + subj.path;
      s.async = true;
      s.onload = () => {
        const raw = window.MM[key];
        if (!raw || !Array.isArray(raw)) { reject(new Error('No data for ' + key)); return; }
        const list = norm(key, raw);
        mergeUserMCQs(key, list);
        cache[key] = list;
        delete loading[key];
        resolve(list);
      };
      s.onerror = () => { delete loading[key]; reject(new Error('Failed to load ' + subj.path)); };
      document.head.appendChild(s);
    });
    loading[key] = p;
    return p;
  }

  // ── User-added MCQs from localStorage ──
  function getUserMCQs(key) {
    try { return JSON.parse(localStorage.getItem('mednama_user_mcqs') || '{}')[key] || []; }
    catch(e) { return []; }
  }
  function mergeUserMCQs(key, list) {
    const extra = getUserMCQs(key);
    if (extra && extra.length) {
      extra.forEach((m, i) => {
        let opts, ansIdx;
        if (Array.isArray(m.o)) {
          opts = m.o;
          ansIdx = typeof m.a === 'number' ? m.a : 0;
        } else {
          opts = [m.a||'', m.b||'', m.c||'', m.d||''];
          ansIdx = ['A','B','C','D'].indexOf((m.ans||'A').toUpperCase());
        }
        if (ansIdx < 0 || ansIdx >= opts.length) ansIdx = 0;
        list.push({
          qid: `${key}:u${i}`,
          subjKey: key,
          idx: list.length + i,
          q: m.q, opts, ans: ansIdx, e: m.e || '', t: m.t || '',
          _user: true
        });
      });
    }
  }
  function addUserMCQ(key, mcq) {
    const all = JSON.parse(localStorage.getItem('mednama_user_mcqs') || '{}');
    if (!all[key]) all[key] = [];
    all[key].push({ ...mcq, _created: Date.now() });
    localStorage.setItem('mednama_user_mcqs', JSON.stringify(all));
    delete cache[key];   // force re-load with merge next time
  }

  // ── Progress tracking (per-MCQ, spaced repetition SM-2 lite) ──
  // localStorage key: mednama_progress_v1 -> { [qid]: {...} }
  function getAll() {
    try { return JSON.parse(localStorage.getItem('mednama_progress_v1') || '{}'); }
    catch(e) { return {}; }
  }
  function getAllSync() { return getAll(); }
  function getProgressObj(qid) {
    const all = getAll();
    return all[qid] || null;
  }
  function save(all) {
    localStorage.setItem('mednama_progress_v1', JSON.stringify(all));
  }
  function record(qid, correct) {
    const all = getAll();
    const now = Date.now();
    const DAY = 86400000;
    let p = all[qid] || { attempts: 0, correct: 0, wrong: 0, ease: 2.5, interval: 0, due: now, last: 0 };
    p.attempts++;
    if (correct) { p.correct++; p.ease = Math.max(1.3, (p.ease || 2.5) + 0.1); }
    else { p.wrong++; p.ease = Math.max(1.3, (p.ease || 2.5) * 0.8); p.interval = 0; }
    // SM-2-like next interval (days)
    if (p.interval === 0) p.interval = correct ? 1 : 0;
    else if (p.interval === 1) p.interval = correct ? 3 : 0;
    else p.interval = correct ? Math.round(p.interval * p.ease) : 0;
    p.due = now + p.interval * DAY;
    p.last = now;
    all[qid] = p;
    save(all);
    return p;
  }

  // ── Per-subject stats ──
  function subjectStats(key) {
    const subj = window.SUBJECT_BY_KEY[key];
    if (!subj) return null;
    const all = getAll();
    let attempted = 0, correct = 0, wrong = 0, wrongDue = 0;
    const total = cache[key] ? cache[key].length : 0;
    // Only iterate MCQs that have progress entries; we look them up by qid prefix
    const prefix = key + ':';
    for (const qid in all) {
      if (qid.startsWith(prefix)) {
        const p = all[qid];
        if (!p) continue;
        attempted++;
        if (p.correct) correct += p.correct;
        if (p.wrong) wrong += p.wrong;
        if (p.wrong > p.correct) wrongDue++;
      }
    }
    return {
      key, total,
      attempted,
      accuracy: attempted > 0 ? Math.round(correct / (correct + wrong || 1) * 100) : 0,
      wrongDue,
      percent: total > 0 ? Math.min(100, Math.round(attempted / total * 100)) : 0
    };
  }

  // ── Overall stats ──
  function globalStats() {
    const all = getAll();
    let attempted = 0, correct = 0, wrong = 0, dueNow = 0;
    const now = Date.now();
    for (const qid in all) {
      const p = all[qid]; if (!p) continue;
      attempted++;
      correct += p.correct || 0;
      wrong += p.wrong || 0;
      if (p.wrong > p.correct && (p.due || 0) <= now) dueNow++;
    }
    const totalSubjects = window.MANIFEST.reduce((n, g) => n + g.subjects.length, 0);
    const subjectsAttempted = new Set(Object.keys(all).map(q => q.split(':')[0])).size;
    return { attempted, correct, wrong, dueNow, totalSubjects, subjectsAttempted };
  }

  // ── Pick wrong MCQs for rotation/review ──
  // Returns array of normalized MCQ objects for the subject that are "due" for review.
  // If no wrong-due MCQs, returns [] (caller can fall back to fresh ones).
  function getDueMCQs(key, limit) {
    const list = cache[key];
    if (!list || !list.length) return [];
    const all = getAll();
    const now = Date.now();
    const due = list.filter(m => {
      const p = all[m.qid];
      if (!p) return false;
      // Wrong-weighted: show if user got it wrong more often than right and review is due
      return p.wrong > p.correct && (p.due || 0) <= now;
    });
    // Sort by wrong desc (most-wrong first), then last-reviewed asc
    due.sort((a, b) => (all[b.qid].wrong - all[b.qid].correct) - (all[a.qid].wrong - all[a.qid].correct)
              || (all[a.qid].last || 0) - (all[b.qid].last || 0));
    return due.slice(0, limit || due.length);
  }

  // ── Build a practice set with weighted rotation ──
  // 50% wrong-due review (if any), 50% fresh/unseen — pure rotation otherwise.
  function buildPracticeSet(key, count) {
    const list = cache[key] ? cache[key].slice() : [];
    if (list.length === 0) return [];
    const all = getAll();
    const now = Date.now();
    const reviews = list.filter(m => {
      const p = all[m.qid];
      return p && p.wrong > p.correct && (p.due || 0) <= now;
    });
    const fresh = list.filter(m => !all[m.qid]);
    const seen = list.filter(m => all[m.qid] && !(all[m.qid].wrong > all[m.qid].correct && all[m.qid].due <= now));
    shuffle(reviews); shuffle(fresh); shuffle(seen);
    const halfReviews = Math.floor(count / 2);
    let picked = reviews.slice(0, halfReviews);
    picked.push(...fresh.slice(0, count - picked.length));
    picked.push(...seen.slice(0, count - picked.length));
    shuffle(picked);
    return picked.slice(0, count);
  }

  // ── Build exam set (mock) — random across chosen subject keys, weighted by size ──
  function buildExamSet(subjectKeys, count, paper1Pct) {
    // subjectKeys: array of subject keys. paper1Pct: 0-100 portion from Paper 1.
    const p1Keys = subjectKeys.filter(k => window.SUBJECT_BY_KEY[k] && window.SUBJECT_BY_KEY[k].paper === 1);
    const p2Keys = subjectKeys.filter(k => window.SUBJECT_BY_KEY[k] && window.SUBJECT_BY_KEY[k].paper === 2);
    const countP1 = paper1Pct > 0 && p1Keys.length ? Math.round(count * paper1Pct / 100) : 0;
    const countP2 = count - countP1;
    if (countP1 && !p1Keys.length) return pickFromKeys(p2Keys, count);
    if (paper1Pct >= 100 && p1Keys.length) return pickFromKeys(p1Keys, count);
    const p1Pick = pickFromKeys(p1Keys, countP1);
    const p2Pick = pickFromKeys(p2Keys, countP2);
    const all = [...p1Pick, ...p2Pick];
    shuffle(all);
    return all;
  }

  // pick N random MCQs distributed across keys proportional to subject size
  function pickFromKeys(keys, n) {
    if (!keys.length || n <= 0) return [];
    // Use cached sizes if available; else load first via promise handled outside
    // Here we degrade gracefully if data not loaded: caller should await loadSubject
    const accumulated = [];
    keys.forEach(k => { if (cache[k] && cache[k].length) accumulated.push(...cache[k].map(m => m)); });
    if (accumulated.length === 0) return [];
    shuffle(accumulated);
    return accumulated.slice(0, n);
  }

  // ── Helpers ──
  function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  function clearAllProgress() {
    localStorage.removeItem('mednama_progress_v1');
  }

  // ── Preload all subjects in the background (best-effort) ──
  function preloadAll(onProgress) {
    const all = window.ALL_SUBJECTS || [];
    let done = 0;
    const results = { ok: 0, fail: 0 };
    return Promise.all(all.map(s => loadSubject(s.key).then(list => {
      results.ok++;
      done++;
      if (onProgress) onProgress(done, all.length, results);
      return { key: s.key, count: list.length };
    }).catch(err => {
      results.fail++;
      done++;
      if (onProgress) onProgress(done, all.length, results);
      return null;
    })));
  }

  return {
    loadSubject, preloadAll,
    subjectStats, globalStats,
    record, getProgressObj,
    getDueMCQs, buildPracticeSet, buildExamSet,
    addUserMCQ, getUserMCQs, clearAllProgress,
    _cache: cache
  };
})();
window.Store = Store;