/* ═══════════════════════════════════════════
   MedNama — AI integration (Ollama + Opencode AI)
   Supports both local Ollama and cloud Opencode AI.
   ═══════════════════════════════════════════ */
const AI = (() => {
  const KEY_PROVIDER = 'mednama_ai_provider';
  const KEY_URL      = 'mednama_ollama_url';
  const KEY_MODEL    = 'mednama_ollama_model';
  const KEY_OC_KEY   = 'mednama_opencode_key';
  const KEY_OC_MODEL = 'mednama_opencode_model';
  const KEY_OC_BASE  = 'mednama_opencode_base';
  // Use the relative proxy when served via our local server.js (port 3000).
  // On any other host (incl. GitHub Pages), the user can set a custom proxy
  // base URL — otherwise we fall back to the direct opencode.ai endpoint
  // (note: opencode.ai does NOT send CORS headers on actual responses, so the
  //  direct endpoint only works through a proxy/same-origin setup).
  const DEFAULT_OC_BASE = window.location.port === '3000'
    ? '/zen/v1'
    : 'https://opencode.ai/zen/v1';
  let statusPoll = null;

  function getProvider()    { return localStorage.getItem(KEY_PROVIDER) || 'ollama'; }
  function getUrl()         { return localStorage.getItem(KEY_URL)      || 'http://localhost:11434'; }
  function getModel()       { return localStorage.getItem(KEY_MODEL)    || 'qwen3:8b'; }
  function getOCKey()       { return localStorage.getItem(KEY_OC_KEY)   || ''; }
  function getOCModel()     { return localStorage.getItem(KEY_OC_MODEL) || 'big-pickle'; }
  function getOCBase()      { return (localStorage.getItem(KEY_OC_BASE) || '').trim() || DEFAULT_OC_BASE; }

  function setConfig(cfg) {
    if (cfg.provider) localStorage.setItem(KEY_PROVIDER, cfg.provider);
    if (cfg.url)      localStorage.setItem(KEY_URL, cfg.url);
    if (cfg.model)    localStorage.setItem(KEY_MODEL, cfg.model);
    if (cfg.ocKey)    localStorage.setItem(KEY_OC_KEY, cfg.ocKey);
    if (cfg.ocModel)  localStorage.setItem(KEY_OC_MODEL, cfg.ocModel);
    if (cfg.ocBase !== undefined) localStorage.setItem(KEY_OC_BASE, cfg.ocBase);
    checkNow();
  }

  function getConfig() {
    return {
      provider: getProvider(),
      url: getUrl(),
      model: getModel(),
      ocKey: getOCKey(),
      ocModel: getOCModel(),
      ocBase: getOCBase()
    };
  }

  // status: { state: 'on'|'off'|'waiting', provider, model, detail }
  let listeners = [];
  function onStatus(cb) { listeners.push(cb); }
  function emit(s) { listeners.forEach(fn => { try { fn(s); } catch(e){} }); }

  function isCORSError(e) {
    const msg = String(e.message || e);
    return msg === 'Failed to fetch' || msg.includes('NetworkError') || msg.includes('Load failed') || msg.includes('Network request failed');
  }

  function isStaticHost() {
    // GitHub Pages, Netlify, Vercel preview, etc. — static hosts that
    // cannot run our Node proxy (server.js).
    const h = window.location.hostname;
    return /\.github\.io$|\.netlify\.app$|\.vercel\.app$|\.pages\.dev$/.test(h);
  }

  function corsHint() {
    if (window.location.port === '3000') {
      return ' The local proxy (server.js) is running but the request failed. Check server.js console and your API key.';
    }
    if (isStaticHost()) {
      return ' Opencode.ai does NOT send CORS headers on responses, so a browser on a static host (e.g. GitHub Pages) cannot call it directly. Fix: run the local Node proxy with `node server.js` (then open http://localhost:3000), OR set a custom Opencode proxy URL in AI settings that points to a CORS-enabled proxy you control (e.g. a Cloudflare Worker / Render deployment of server.js). Alternatively, use Ollama locally.';
    }
    return ' This is a CORS issue. Run the local Node proxy: `node server.js`, then open http://localhost:3000. Or set a custom Opencode proxy URL in AI settings, or use Ollama locally.';
  }

  async function fetchStatus() {
    const provider = getProvider();
    if (provider === 'opencode') {
      const key = getOCKey();
      if (!key) return { state: 'off', provider, model: getOCModel(), detail: 'No API key set' };
      try {
        const r = await fetch(getOCBase() + '/models', {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${key}` }
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const models = (data.data || []).map(m => m.id);
        const want = getOCModel();
        const hasModel = models.some(m => m === want);
        return { state: 'on', provider, model: want, hasWanted: hasModel, models, detail: 'Connected' };
      } catch(e) {
        const detail = isCORSError(e) ? 'CORS blocked by browser.' + corsHint() : e.message;
        return { state: 'off', provider, model: getOCModel(), detail };
      }
    } else {
      try {
        const r = await fetch(`${getUrl()}/api/tags`, { method: 'GET' });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        const models = (data.models || []).map(m => m.name);
        const want = getModel().split(':')[0];
        const hasModel = models.some(m => m === getModel() || m === want || m.startsWith(want + ':'));
        return { state: 'on', provider: 'ollama', model: getModel(), hasWanted: hasModel, models, detail: '' };
      } catch(e) {
        const msg = String(e.message || e);
        return { state: 'off', provider: 'ollama', model: getModel(), detail: msg };
      }
    }
  }

  async function checkNow() {
    emit({ state: 'waiting' });
    const s = await fetchStatus();
    emit(s);
    return s;
  }
  function startPolling() {
    checkNow();
    if (statusPoll) clearInterval(statusPoll);
    statusPoll = setInterval(checkNow, 30000);
  }
  function stopPolling() { if (statusPoll) clearInterval(statusPoll); statusPoll = null; }

  // ── Chat completion (unified) ──
  async function chat(prompt, opts) {
    const options = opts || {};
    const provider = options.provider || getProvider();
    const system = options.system || 'You are a helpful medical education assistant. Explain concepts concisely and accurately. Use markdown for formatting (bold, lists, code). Keep responses clear and well-structured.';

    if (provider === 'opencode') {
      return chatOpencode(prompt, system, options);
    } else {
      return chatOllama(prompt, system, options);
    }
  }

  async function chatOllama(prompt, system, opts) {
    const model = opts.model || getModel();
    const url = opts.url || getUrl();
    try {
      const r = await fetch(`${url}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          stream: false,
          options: { temperature: opts.temperature ?? 0.7, top_p: 0.9 }
        })
      });
      if (!r.ok) throw new Error('Ollama HTTP ' + r.status);
      const data = await r.json();
      return data.message?.content || data.response || '(empty response)';
    } catch(e) {
      const msg = String(e.message || e);
      if (msg.includes('Failed to fetch') || msg.includes('NetworkError') || msg.includes('Load failed')) {
        throw new Error(`Cannot reach Ollama at ${url}. Is "ollama serve" running?`);
      }
      throw new Error('Ollama error: ' + msg);
    }
  }

  async function chatOpencode(prompt, system, opts) {
    const model = opts.ocModel || getOCModel();
    const key = opts.ocKey || getOCKey();
    if (!key) throw new Error('Opencode AI API key not configured.');
    try {
      const r = await fetch(getOCBase() + '/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: system },
            { role: 'user', content: prompt }
          ],
          temperature: opts.temperature ?? 0.7,
          top_p: 0.9
        })
      });
      if (!r.ok) {
        const errBody = await r.text().catch(() => '');
        throw new Error(`Opencode AI HTTP ${r.status}: ${errBody}`);
      }
      const data = await r.json();
      return data.choices?.[0]?.message?.content || '(empty response)';
    } catch(e) {
      const msg = String(e.message || e);
      if (isCORSError(e)) {
        throw new Error('Opencode AI API request blocked by browser CORS policy.' + corsHint());
      }
      throw new Error('Opencode AI error: ' + msg);
    }
  }

  // ── Higher-level AI helpers ──

  function explainMCQ(mcq) {
    const opts = mcq.opts.map((o, i) => `${String.fromCharCode(65+i)}) ${o}`).join('\n');
    const correctIdx = mcq.ans;
    const correctLetter = String.fromCharCode(65 + correctIdx);
    const prompt =
`Explain this MCQ thoroughly but concisely for a medical student.

Q: ${mcq.q}

${opts}

Correct answer: ${correctLetter})

Provide:
- 1-2 sentence summary of the core concept
- Why the correct option is right
- Why the other options are wrong (one line each)
- A key takeaway to remember`;
    return chat(prompt, {
      system: 'You are a medical tutor. Be concise. Use markdown for formatting (bold for key terms, bullet points). Limit ~150 words.'
    });
  }

  function podcastScript(text) {
    const trimmed = (text || '').substring(0, 4000);
    const prompt =
`Rewrite the following passage as a friendly, conversational podcast monologue for a medical student.
- Speak in first person as the host "Dr. MedNama".
- Explain key concepts out loud, with simple analogies.
- Pause markers: insert "—" between major points.
- Keep it under 400 words.

PASSAGE:
${trimmed}`;
    return chat(prompt, {
      system: 'You write engaging podcast scripts for medical students. Speak naturally. Use plain text without markdown formatting.',
      temperature: 0.8
    });
  }

  const MCQ_PROMPT =
`Generate FCPS/JCAT-style MCQs **only from the provided material**. Prioritize **clinical scenario-based questions** that test conceptual understanding, clinical reasoning, differential diagnosis, investigation interpretation, management, or pathophysiology rather than factual recall. Use realistic patient scenarios with plausible distractors and a single best answer. If a clinical scenario cannot reasonably be created from the material, generate a high-quality conceptual/theoretical question instead.

Return **only valid JSON** in the following structure:

` + '```json\n' +
`{
  "questions": [
    {
      "stem": "...",
      "options": {
        "A": "...",
        "B": "...",
        "C": "...",
        "D": "..."
      },
      "answer": "B",
      "explanation": "Explain why the correct answer is correct and briefly why the other options are incorrect.",
      "clinicalPearl": "One high-yield exam takeaway."
    }
  ]
}` + '\n```' + `

Ensure questions vary in presentation, avoid repetition, distribute correct answers randomly, and never include information not supported by the provided material.`;

  const MCQ_SYSTEM =
'You are a medical exam question writer for FCPS/JCAT-style exams. Output ONLY valid JSON with no markdown, no code fences, no extra text. Always wrap the JSON object in the exact structure shown.';

  function generateMCQs(text, count) {
    const trimmed = (text || '').substring(0, 5000);
    const prompt =
`Generate ${count} MCQs from the passage below using the instructions below.

${MCQ_PROMPT}

PASSAGE:
${trimmed}`;
    return chat(prompt, {
      system: MCQ_SYSTEM,
      temperature: 0.7
    }).then(raw => {
      // Strip any markdown fences and surrounding prose
      let json = raw.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
      // If the model wrapped only part, grab the outermost {...} block
      const start = json.indexOf('{');
      const end = json.lastIndexOf('}');
      if (start !== -1 && end !== -1 && end > start) json = json.slice(start, end + 1);
      const parsed = JSON.parse(json);
      const questions = parsed.questions || parsed;
      if (!Array.isArray(questions)) throw new Error('Response was not a questions array');
      const LETTER_TO_IDX = { A: 0, B: 1, C: 2, D: 3 };
      return questions.map((item, i) => {
        if (!item.stem || !item.options) throw new Error(`Question ${i+1} is malformed`);
        const optsObj = item.options;
        const opts = ['A','B','C','D'].map(L => optsObj[L]).filter(v => v != null);
        if (opts.length < 4) throw new Error(`Question ${i+1} needs 4 options`);
        let ans = 0;
        if (typeof item.answer === 'string') {
          ans = LETTER_TO_IDX[item.answer.toUpperCase()] ?? 0;
        } else if (typeof item.answer === 'number') {
          ans = item.answer;
        }
        return {
          q: item.stem,
          opts,
          ans,
          e: (item.explanation || '') + (item.clinicalPearl ? `\n\n💡 ${item.clinicalPearl}` : ''),
          t: item.clinicalPearl || '',
          _ai: true
        };
      });
    });
  }

  return {
    getProvider, getUrl, getModel, getOCKey, getOCModel, getConfig, setConfig,
    onStatus, checkNow, startPolling, stopPolling,
    chat, explainMCQ, podcastScript, generateMCQs
  };
})();
window.AI = AI;
