// Comics assistant: a conversational helper that knows the user's library and
// reading history, powered by Claude through the user's own API key.
// The key and the conversation stay on this device.

const KEY_STORAGE = 'cloudpanels-ai-key';
const CHAT_STORAGE = 'cloudpanels-ai-chat-v1';
const OPTIONS_STORAGE = 'cloudpanels-ai-options-v1';
export const ASSISTANT_MODEL = 'claude-sonnet-5-5';
const MAX_CONTEXT_CHARS = 60000;

const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
const write = (key, value) => { try { value == null ? localStorage.removeItem(key) : localStorage.setItem(key, value); } catch {} };

export const assistantStore = {
  get key() { return read(KEY_STORAGE) || ''; },
  set key(value) { write(KEY_STORAGE, value ? String(value).trim() : null); },
  get options() { try { return { voice: false, web: true, ...JSON.parse(read(OPTIONS_STORAGE) || '{}') }; } catch { return { voice: false, web: true }; } },
  setOption(name, value) { const next = { ...this.options, [name]: value }; write(OPTIONS_STORAGE, JSON.stringify(next)); return next; },
  loadChat() { try { const value = JSON.parse(read(CHAT_STORAGE) || '[]'); return Array.isArray(value) ? value.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.text === 'string').slice(-40) : []; } catch { return []; } },
  saveChat(messages) { write(CHAT_STORAGE, JSON.stringify(messages.slice(-40).map(({ role, text }) => ({ role, text })))); },
  clearChat() { write(CHAT_STORAGE, null); },
};

/** Issue number from metadata or from a filename such as "Saga 012 (2013).cbr". */
export function issueNumber(comic) {
  const raw = String(comic?.metadata?.issue ?? '').trim();
  if (raw && Number.isFinite(Number(raw))) return Number(raw);
  const name = String(comic?.name || '').replace(/\.[a-z0-9]{2,4}$/i, '').replace(/\((?:19|20)\d\d\)/g, ' ');
  const hash = name.match(/#\s*(\d{1,4}(?:\.\d)?)/);
  if (hash) return Number(hash[1]);
  const numbers = [...name.matchAll(/(?:^|[\s_\-.])(\d{1,4})(?=$|[\s_\-.)])/g)].map(m => Number(m[1])).filter(n => n < 2000 || n > 2100);
  return numbers.length ? numbers[numbers.length - 1] : null;
}

function seriesName(comic) {
  const m = comic?.metadata || {};
  if (m.series) return String(m.series);
  const title = String(m.title || comic?.name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
  return title.replace(/\((?:19|20)\d\d\)/g, '').replace(/#?\s*\d{1,4}(?:\.\d)?\s*$/, '').replace(/[\s_\-.]+(?:\d{1,4})\b.*$/, '').trim() || title;
}

/** Ranges such as "1-4, 9-12" and the numbers missing between them. */
export function issueRanges(numbers) {
  const sorted = [...new Set(numbers.filter(n => Number.isInteger(n)))].sort((a, b) => a - b);
  const ranges = [], missing = [];
  for (let i = 0; i < sorted.length; i++) {
    let j = i; while (j + 1 < sorted.length && sorted[j + 1] === sorted[j] + 1) j++;
    ranges.push(i === j ? `${sorted[i]}` : `${sorted[i]}-${sorted[j]}`);
    if (j + 1 < sorted.length) for (let n = sorted[j] + 1; n < sorted[j + 1] && missing.length < 60; n++) missing.push(n);
    i = j;
  }
  return { ranges: ranges.join(', '), missing };
}

/**
 * A compact description of the library and reading history for the model.
 * Each comic gets a short reference (c1, c2…) the model can cite.
 */
export function libraryContext(state, { folderOf } = {}) {
  const comics = state.comics || [], progress = state.progress || {};
  const favorites = new Set(state.favorites || []), later = new Set(state.readLater || []);
  const refs = new Map(), byRef = new Map();
  comics.forEach((comic, index) => { const ref = 'c' + (index + 1); refs.set(comic.id, ref); byRef.set(ref, comic.id); });
  const status = comic => { const p = progress[comic.id]; if (!p) return 'não lido'; if (p.status === 'finished') return 'lido'; if (p.status === 'reading') return `lendo (pág. ${p.page + 1}/${p.pageCount})`; return 'não lido'; };
  const groups = new Map();
  for (const comic of comics) {
    const key = seriesName(comic).toLowerCase();
    if (!groups.has(key)) groups.set(key, { name: seriesName(comic), comics: [] });
    groups.get(key).comics.push(comic);
  }
  const recent = comics.filter(c => progress[c.id]?.updatedAt && progress[c.id].status !== 'unread')
    .sort((a, b) => String(progress[b.id].updatedAt).localeCompare(String(progress[a.id].updatedAt))).slice(0, 25);
  const lines = [];
  lines.push(`Biblioteca: ${comics.length} quadrinhos em ${groups.size} séries.`);
  if (recent.length) {
    lines.push('', 'Leituras mais recentes (mais nova primeiro):');
    for (const c of recent) lines.push(`- [[${refs.get(c.id)}]] ${c.metadata?.title || c.name} — ${status(c)}`);
  }
  const fav = comics.filter(c => favorites.has(c.id));
  if (fav.length) lines.push('', 'Favoritos: ' + fav.slice(0, 40).map(c => `[[${refs.get(c.id)}]] ${c.metadata?.title || c.name}`).join('; '));
  const queued = comics.filter(c => later.has(c.id));
  if (queued.length) lines.push('', 'Ler depois: ' + queued.slice(0, 40).map(c => `[[${refs.get(c.id)}]] ${c.metadata?.title || c.name}`).join('; '));
  lines.push('', 'Séries na biblioteca (edições que o usuário tem; lidas; faltando entre as que tem):');
  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  let detailed = true;
  for (const group of sortedGroups) {
    const numbers = group.comics.map(issueNumber), { ranges, missing } = issueRanges(numbers);
    const read = group.comics.filter(c => progress[c.id]?.status === 'finished').length;
    const reading = group.comics.filter(c => progress[c.id]?.status === 'reading');
    const publisher = group.comics.find(c => c.metadata?.publisher)?.metadata.publisher;
    const folder = folderOf?.(group.comics[0]);
    let line = `• ${group.name}${publisher ? ` (${publisher})` : ''}${folder ? ` [pasta: ${folder}]` : ''}: ${group.comics.length} ed.${ranges ? ` nº ${ranges}` : ''}; lidas ${read}/${group.comics.length}`;
    if (reading.length) line += `; lendo ${reading.map(c => `[[${refs.get(c.id)}]]`).join(' ')}`;
    if (missing.length) line += `; faltando: ${missing.join(', ')}`;
    if (detailed) {
      const items = group.comics.slice().sort((a, b) => (issueNumber(a) ?? 1e9) - (issueNumber(b) ?? 1e9)).slice(0, 80)
        .map(c => `[[${refs.get(c.id)}]]${issueNumber(c) != null ? '#' + issueNumber(c) : ' ' + (c.metadata?.title || c.name)}${progress[c.id]?.status === 'finished' ? '✓' : ''}`);
      line += `\n   ${items.join(' ')}`;
    }
    lines.push(line);
    if (lines.join('\n').length > MAX_CONTEXT_CHARS) { if (detailed) { detailed = false; } else { lines.push('… (biblioteca grande: lista resumida)'); break; } }
  }
  return { text: lines.join('\n').slice(0, MAX_CONTEXT_CHARS + 4000), byRef };
}

export function systemPrompt(context, language = 'en') {
  const reply = language === 'pt-BR' ? 'português do Brasil' : language === 'es' ? 'espanhol' : 'inglês (English)';
  return `Você é o assistente pessoal de quadrinhos do usuário, dentro do app CloudPanels (um leitor de HQs que lê a coleção dele no MEGA). Pense num mordomo de IA de filme: prestativo, entusiasmado com quadrinhos, direto e com um toque de bom humor — mas sem exagerar no personagem.

Responda sempre em ${reply}, mesmo que a biblioteca abaixo esteja descrita em português, de forma curta e fácil de ler no iPad (parágrafos curtos, listas quando ajudar). O usuário não é técnico.

O que você faz:
- Recomenda o que ler a seguir com base no que ele leu, está lendo e favoritou. Explique em uma frase por que cada indicação combina com ele.
- Monta ordens de leitura de séries, arcos e eventos, marcando o que ele já tem e já leu.
- Aponta edições que faltam na coleção, para ele saber o que procurar.
- Dá opinião sincera sobre séries e arcos (pontos fortes e fracos, sem spoilers a menos que ele peça).

Regras:
- Quando citar uma revista que está na biblioteca, use exatamente o código dela entre colchetes duplos, por exemplo [[c12]] — o app transforma isso num botão que abre a revista. Não invente códigos.
- Não indique sites, links ou formas de baixar quadrinhos. Se ele perguntar onde baixar, diga apenas quais títulos/edições ele precisa (pode citar lojas e serviços oficiais).
- Se não tiver certeza de uma informação (datas, números de edição, ordem oficial), diga que pode variar. Use a busca na web quando precisar de informações atuais ou específicas.

Biblioteca e histórico de leitura do usuário:
${context}`;
}

/** Stream a reply from Claude. Calls onText with each new piece of text. */
export async function askAssistant({ key, messages, system, onText, signal, web = true, model = ASSISTANT_MODEL }) {
  const body = { model, max_tokens: 2000, system, stream: true, messages: messages.map(m => ({ role: m.role, content: m.text })) };
  if (web) body.tools = [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3 }];
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
    headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    let detail = ''; try { detail = (await response.json())?.error?.message || ''; } catch {}
    const error = new Error(detail || `HTTP ${response.status}`); error.status = response.status;
    if (web && response.status === 400 && /tool|web_search/i.test(detail)) return askAssistant({ key, messages, system, onText, signal, web: false, model });
    throw error;
  }
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let buffer = '', full = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index;
    while ((index = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, index); buffer = buffer.slice(index + 2);
      const data = chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
      if (!data) continue;
      let event; try { event = JSON.parse(data); } catch { continue; }
      if (event.type === 'content_block_delta' && event.delta?.type === 'text_delta') { full += event.delta.text; onText?.(full); }
      else if (event.type === 'content_block_start' && event.content_block?.type === 'server_tool_use') onText?.(full, { searching: true });
      else if (event.type === 'error') throw new Error(event.error?.message || 'Erro na resposta.');
    }
  }
  return full;
}

export function friendlyError(error, language = 'en') {
  const pt = language === 'pt-BR', status = error?.status;
  if (error?.name === 'AbortError') return '';
  if (status === 401) return pt ? 'A chave da IA não foi aceita. Confira se copiou a chave inteira.' : 'The AI key was not accepted. Check that you copied the whole key.';
  if (status === 402 || /credit|billing|balance/i.test(error?.message || '')) return pt ? 'Sua conta da IA está sem créditos. Adicione créditos no site da Anthropic e tente de novo.' : 'Your AI account is out of credit. Add credit on the Anthropic website and try again.';
  if (status === 429) return pt ? 'Muitas perguntas seguidas. Espere alguns segundos e tente de novo.' : 'Too many questions in a row. Wait a few seconds and try again.';
  if (status === 529 || status >= 500) return pt ? 'O serviço de IA está ocupado agora. Tente de novo daqui a pouco.' : 'The AI service is busy right now. Try again shortly.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return pt ? 'Sem internet. O assistente precisa de conexão.' : 'No internet. The assistant needs a connection.';
  return pt ? 'Não consegui falar com a IA agora. Tente de novo.' : 'Could not reach the AI right now. Please try again.';
}

// ---- Voice --------------------------------------------------------------------
export function speechInputAvailable() { return typeof window !== 'undefined' && Boolean(window.SpeechRecognition || window.webkitSpeechRecognition); }
export function listen({ onText, onEnd, language = 'pt-BR' }) {
  const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;
  const recognition = new Recognition();
  recognition.lang = language; recognition.interimResults = true; recognition.continuous = false;
  recognition.onresult = event => { let text = ''; for (const result of event.results) text += result[0].transcript; onText?.(text, event.results[event.results.length - 1].isFinal); };
  recognition.onerror = () => onEnd?.(); recognition.onend = () => onEnd?.();
  recognition.start();
  return () => { try { recognition.stop(); } catch {} };
}
export function speak(text, language = 'pt-BR') {
  if (typeof speechSynthesis === 'undefined') return;
  speechSynthesis.cancel();
  const clean = text.replace(/\[\[c\d+\]\]/g, '').replace(/[*_#>`]/g, '').replace(/\n{2,}/g, '. ').slice(0, 3000);
  const utterance = new SpeechSynthesisUtterance(clean); utterance.lang = language; utterance.rate = 1.03;
  const voice = speechSynthesis.getVoices().find(v => v.lang?.toLowerCase().startsWith(language.toLowerCase().slice(0, 2)));
  if (voice) utterance.voice = voice;
  speechSynthesis.speak(utterance);
}
export function stopSpeaking() { try { speechSynthesis.cancel(); } catch {} }
