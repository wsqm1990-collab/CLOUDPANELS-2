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

// ---- The whole library, reachable through tools ---------------------------
// Instead of squeezing a big collection into one message (which got cut off),
// the assistant receives a short overview and looks up any folder, series or
// comic with these tools, which run here on the device.
const fold = value => String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

export function buildLibraryIndex(state, { folderOf } = {}) {
  const comics = state?.comics || [], progress = state?.progress || {};
  const favorites = new Set(state?.favorites || []), later = new Set(state?.readLater || []);
  const byRef = new Map(), entries = [];
  comics.forEach((comic, index) => {
    const ref = 'c' + (index + 1); byRef.set(ref, comic.id);
    const p = progress[comic.id];
    let folder = ''; try { folder = String(folderOf?.(comic) || ''); } catch { folder = ''; }
    const status = p?.status === 'finished' ? 'finished' : p?.status === 'reading' ? 'reading' : 'unread';
    const title = String(comic.metadata?.title || comic.name || '').replace(/\.[a-z0-9]{2,4}$/i, '');
    entries.push({ id: comic.id, ref, title, name: comic.name, folder, series: seriesName(comic), issue: issueNumber(comic),
      publisher: comic.metadata?.publisher || '', year: comic.metadata?.year || '', status, page: p?.page, pageCount: p?.pageCount,
      updatedAt: p?.updatedAt || '', favorite: favorites.has(comic.id), later: later.has(comic.id),
      haystack: fold([title, comic.name, folder, seriesName(comic), comic.metadata?.publisher, comic.metadata?.year, (comic.metadata?.characters || []).join(' ')].join(' ')) });
  });
  const folders = new Map();
  const folderNode = path => { if (!folders.has(path)) folders.set(path, { path, comics: 0, read: 0, reading: 0, children: new Set(), direct: [] }); return folders.get(path); };
  folderNode('');
  for (const entry of entries) {
    const parts = entry.folder ? entry.folder.split(' / ') : [];
    folderNode(entry.folder).direct.push(entry);
    for (let depth = 0; depth <= parts.length; depth++) {
      const path = parts.slice(0, depth).join(' / '), node = folderNode(path);
      node.comics++; if (entry.status === 'finished') node.read++; if (entry.status === 'reading') node.reading++;
      if (depth < parts.length) node.children.add(parts.slice(0, depth + 1).join(' / '));
    }
  }
  return { entries, byRef, folders };
}

const statusText = entry => entry.status === 'finished' ? 'lido' : entry.status === 'reading' ? `lendo (pág. ${(entry.page ?? 0) + 1}/${entry.pageCount || '?'})` : 'não lido';
const entryLine = entry => `[[${entry.ref}]] ${entry.title}${entry.issue != null ? ` (#${entry.issue})` : ''}${entry.folder ? ` — pasta: ${entry.folder}` : ''} — ${statusText(entry)}${entry.favorite ? ' — favorito' : ''}`;
const byFolderAndIssue = (a, b) => a.folder.localeCompare(b.folder, undefined, { numeric: true }) || (a.issue ?? 1e9) - (b.issue ?? 1e9) || a.title.localeCompare(b.title, undefined, { numeric: true });

/** A short overview for the system prompt: counts, the folder tree, what is being read. */
export function libraryBrief(index, { maxFolders = 500 } = {}) {
  const { entries, folders } = index, lines = [];
  const root = folders.get('');
  lines.push(`Biblioteca: ${entries.length} quadrinhos em ${Math.max(0, folders.size - 1)} pastas; ${root?.read || 0} lidos, ${root?.reading || 0} em andamento.`);
  const reading = entries.filter(e => e.status === 'reading').sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 15);
  if (reading.length) lines.push('', 'Lendo agora:', ...reading.map(e => '- ' + entryLine(e)));
  const recent = entries.filter(e => e.status === 'finished' && e.updatedAt).sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0, 15);
  if (recent.length) lines.push('', 'Lidos recentemente:', ...recent.map(e => '- ' + entryLine(e)));
  const favorites = entries.filter(e => e.favorite).slice(0, 25);
  if (favorites.length) lines.push('', 'Favoritos: ' + favorites.map(e => `[[${e.ref}]] ${e.title}`).join('; '));
  // Folder tree, breadth first, so the top levels always fit.
  const tree = [], queue = [...(root?.children || [])].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  while (queue.length && tree.length < maxFolders) {
    const path = queue.shift(), node = folders.get(path);
    tree.push(node);
    queue.push(...[...node.children].sort((a, b) => a.localeCompare(b, undefined, { numeric: true })));
  }
  if (tree.length) {
    tree.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true }));
    lines.push('', 'Pastas (caminho — quadrinhos, lidos):', ...tree.map(node => `- ${node.path} — ${node.comics}, ${node.read} lidos${node.reading ? `, ${node.reading} em andamento` : ''}`));
    if (folders.size - 1 > tree.length) lines.push(`(Há mais ${folders.size - 1 - tree.length} subpastas: abra-as com list_folder.)`);
  }
  return lines.join('\n');
}

const toolText = (lines, total, shown, offset) => [...lines, total > offset + shown ? `(Mostrando ${offset + 1}–${offset + shown} de ${total}. Peça offset=${offset + shown} para ver mais.)` : `(${total} no total.)`].join('\n');

/** The library tools: Claude tool definitions plus the code that answers them. */
export function libraryTools(index) {
  const { entries, folders } = index;
  const clampInt = (value, low, high, fallback) => Number.isFinite(Number(value)) ? Math.max(low, Math.min(high, Math.floor(Number(value)))) : fallback;
  const statusFilter = status => entry => !status || status === 'any' || entry.status === status;
  const findFolder = raw => {
    const wanted = fold(String(raw || '').replace(/\s*\/\s*/g, ' / ').trim());
    if (!wanted) return folders.get('');
    for (const node of folders.values()) if (fold(node.path) === wanted) return node;
    const candidates = [...folders.values()].filter(node => node.path && (fold(node.path).endsWith(wanted) || fold(node.path.split(' / ').pop()) === wanted));
    return candidates.length === 1 ? candidates[0] : candidates.sort((a, b) => a.path.length - b.path.length)[0] || null;
  };
  return {
    search_library: {
      definition: { name: 'search_library', description: 'Busca na biblioteca inteira do usuário (todas as pastas) por título, série, editora, personagem, ano ou nome de pasta. Retorna cada revista com seu código [[cN]], pasta e situação de leitura.',
        input_schema: { type: 'object', properties: { query: { type: 'string', description: 'Palavras para buscar; vazio lista tudo.' }, status: { type: 'string', enum: ['any', 'unread', 'reading', 'finished'] }, folder: { type: 'string', description: 'Limitar a uma pasta (caminho como "DC / Batman").' }, offset: { type: 'integer' }, limit: { type: 'integer' } } } },
      run(input = {}) {
        const phrase = fold(input.query).replace(/[^a-z0-9]+/g, ' ').trim(), terms = phrase.split(' ').filter(Boolean);
        const offset = clampInt(input.offset, 0, 1e6, 0), limit = clampInt(input.limit, 1, 80, 40);
        const scope = input.folder ? findFolder(input.folder) : null;
        if (input.folder && !scope) return `Nenhuma pasta encontrada para "${input.folder}".`;
        // Numbers match whole numbers only ("7" is not "17"); the closest
        // matches (whole phrase, series name) come first.
        const tests = terms.map(term => /^\d+$/.test(term) ? (text => new RegExp(`(^|[^0-9])0*${term}([^0-9]|$)`).test(text)) : (text => text.includes(term)));
        const score = e => { const words = e.haystack.replace(/[^a-z0-9]+/g, ' '); return (phrase && fold(e.series).replace(/[^a-z0-9]+/g, ' ').trim() === phrase ? 4 : 0) + (phrase && words.includes(phrase) ? 2 : 0); };
        const matches = entries.filter(e => (!scope || !scope.path || e.folder === scope.path || e.folder.startsWith(scope.path + ' / ')) && statusFilter(input.status)(e) && tests.every(test => test(e.haystack.replace(/[^a-z0-9]+/g, ' '))))
          .map(e => [score(e), e]).sort((a, b) => b[0] - a[0] || byFolderAndIssue(a[1], b[1])).map(([, e]) => e);
        if (!matches.length) return 'Nada encontrado na biblioteca com esses termos.';
        const page = matches.slice(offset, offset + limit);
        return toolText(page.map(entryLine), matches.length, page.length, offset);
      },
    },
    list_folder: {
      definition: { name: 'list_folder', description: 'Mostra o conteúdo de uma pasta da biblioteca: subpastas (com contagens) e revistas dentro dela. Sem caminho, mostra a raiz.',
        input_schema: { type: 'object', properties: { path: { type: 'string', description: 'Caminho da pasta, como aparece na lista de pastas.' }, offset: { type: 'integer' } } } },
      run(input = {}) {
        const node = findFolder(input.path);
        if (!node) return `Pasta "${input.path}" não encontrada. Use search_library para procurar pelo nome.`;
        const offset = clampInt(input.offset, 0, 1e6, 0);
        const lines = [`Pasta: ${node.path || '(raiz)'} — ${node.comics} quadrinhos, ${node.read} lidos.`];
        const children = [...node.children].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
        if (children.length && !offset) lines.push('Subpastas:', ...children.map(path => { const child = folders.get(path); return `- ${path} — ${child.comics}, ${child.read} lidos`; }));
        const direct = node.direct.slice().sort(byFolderAndIssue), page = direct.slice(offset, offset + 80);
        if (direct.length) lines.push('Revistas nesta pasta:', toolText(page.map(entryLine), direct.length, page.length, offset));
        return lines.join('\n');
      },
    },
    series_status: {
      definition: { name: 'series_status', description: 'Situação de uma série na coleção: edições que o usuário tem, quais leu e quais números faltam entre as que tem.',
        input_schema: { type: 'object', properties: { series: { type: 'string' } }, required: ['series'] } },
      run(input = {}) {
        const wanted = fold(input.series).trim();
        if (!wanted) return 'Informe o nome da série.';
        const groups = new Map();
        for (const entry of entries) if (fold(entry.series).includes(wanted) || fold(entry.title).includes(wanted)) {
          const key = entry.series + '\u0000' + entry.folder; if (!groups.has(key)) groups.set(key, []); groups.get(key).push(entry);
        }
        if (!groups.size) return `A série "${input.series}" não está na biblioteca.`;
        return [...groups.values()].slice(0, 12).map(list => {
          list.sort(byFolderAndIssue);
          const { ranges, missing } = issueRanges(list.map(e => e.issue));
          return [`Série: ${list[0].series}${list[0].folder ? ` (pasta: ${list[0].folder})` : ''} — ${list.length} edições${ranges ? `, nº ${ranges}` : ''}; lidas ${list.filter(e => e.status === 'finished').length}${missing.length ? `; faltando: ${missing.join(', ')}` : ''}`,
            ...list.slice(0, 120).map(e => '  ' + entryLine(e))].join('\n');
        }).join('\n\n');
      },
    },
    reading_history: {
      definition: { name: 'reading_history', description: 'Histórico de leitura: revistas em andamento, lidas (mais recentes primeiro) ou não lidas.',
        input_schema: { type: 'object', properties: { status: { type: 'string', enum: ['reading', 'finished', 'unread'] }, offset: { type: 'integer' } }, required: ['status'] } },
      run(input = {}) {
        const status = ['reading', 'finished', 'unread'].includes(input.status) ? input.status : 'reading', offset = clampInt(input.offset, 0, 1e6, 0);
        const list = entries.filter(e => e.status === status).sort((a, b) => status === 'unread' ? byFolderAndIssue(a, b) : String(b.updatedAt).localeCompare(String(a.updatedAt)));
        if (!list.length) return 'Nenhuma revista nessa situação.';
        const page = list.slice(offset, offset + 50);
        return toolText(page.map(entryLine), list.length, page.length, offset);
      },
    },
  };
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

Acesso à biblioteca:
- Abaixo há só um resumo. Você enxerga a biblioteca INTEIRA, todas as pastas, pelas ferramentas search_library, list_folder, series_status e reading_history. Use-as sempre que precisar de detalhes (quais edições ele tem, o que está numa pasta, o que já leu). Nunca diga que a lista está cortada ou incompleta: consulte as ferramentas.

Regras:
- Quando citar uma revista que está na biblioteca, use exatamente o código dela entre colchetes duplos, por exemplo [[c12]] — o app transforma isso num botão que abre a revista. Não invente códigos: use só os que aparecem no resumo ou nas ferramentas.
- Não indique sites, links ou formas de baixar quadrinhos. Se ele perguntar onde baixar, diga apenas quais títulos/edições ele precisa (pode citar lojas e serviços oficiais).
- Se não tiver certeza de uma informação (datas, números de edição, ordem oficial), diga que pode variar. Use a busca na web quando precisar de informações atuais ou específicas.

Resumo da biblioteca e do histórico de leitura:
${context}`;
}

/** Messages the API accepts: non-empty, alternating, starting and ending with the user. */
export function cleanHistory(messages, limit = 16) {
  const merged = [];
  for (const message of messages || []) {
    if (!message || (message.role !== 'user' && message.role !== 'assistant')) continue;
    const text = String(message.text ?? '').trim();
    if (!text) continue;
    const last = merged[merged.length - 1];
    if (last && last.role === message.role) last.text += '\n\n' + text; else merged.push({ role: message.role, text });
  }
  while (merged.length && merged[merged.length - 1].role !== 'user') merged.pop();
  let recent = merged.slice(-limit);
  while (recent.length && recent[0].role !== 'user') recent = recent.slice(1);
  return recent;
}

// Read one streamed reply, rebuilding its content blocks so tool calls can be
// answered and paused turns resumed exactly as the API expects.
async function readReply(response, { onText, onSearch, signal, idleMs = 90000 }) {
  const reader = response.body.getReader(), decoder = new TextDecoder();
  const blocks = []; let buffer = '', stopReason = null, idle;
  const arm = () => { clearTimeout(idle); idle = setTimeout(() => { try { reader.cancel(); } catch {} }, idleMs); };
  arm();
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      arm();
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n/g, '\n');
      let cut;
      while ((cut = buffer.indexOf('\n\n')) >= 0) {
        const chunk = buffer.slice(0, cut); buffer = buffer.slice(cut + 2);
        const data = chunk.split('\n').filter(line => line.startsWith('data:')).map(line => line.slice(5).trim()).join('');
        if (!data) continue;
        let event; try { event = JSON.parse(data); } catch { continue; }
        if (event.type === 'content_block_start') {
          const block = { ...event.content_block };
          if (block.type === 'text') { block.text = block.text || ''; if (!block.citations) delete block.citations; }
          if (block.type === 'tool_use' || block.type === 'server_tool_use') block.partialJson = '';
          blocks[event.index] = block;
          if (block.type === 'server_tool_use') onSearch?.();
        } else if (event.type === 'content_block_delta') {
          const block = blocks[event.index]; if (!block) continue;
          if (event.delta?.type === 'text_delta') { block.text += event.delta.text; onText?.(blocks); }
          else if (event.delta?.type === 'input_json_delta') block.partialJson += event.delta.partial_json || '';
          else if (event.delta?.type === 'citations_delta' && event.delta.citation) (block.citations ||= []).push(event.delta.citation);
        } else if (event.type === 'content_block_stop') {
          const block = blocks[event.index];
          if (block && 'partialJson' in block) { try { block.input = block.partialJson ? JSON.parse(block.partialJson) : {}; } catch { block.input = {}; } delete block.partialJson; }
        } else if (event.type === 'message_delta') { if (event.delta?.stop_reason) stopReason = event.delta.stop_reason; }
        else if (event.type === 'error') { const error = new Error(event.error?.message || 'The AI stopped with an error.'); error.type = event.error?.type; error.status = event.error?.type === 'overloaded_error' ? 529 : undefined; throw error; }
      }
    }
  } finally { clearTimeout(idle); }
  signal?.throwIfAborted?.();
  if (!stopReason) { const error = new Error('The answer was interrupted.'); error.type = 'interrupted'; throw error; }
  return { content: blocks.filter(Boolean), stopReason };
}

const visibleText = blocks => blocks.filter(block => block?.type === 'text').map(block => block.text).join('');

/**
 * Ask Claude, streaming the answer. Library tools run on the device; paused
 * web searches are resumed automatically. Calls onText(fullTextSoFar, info).
 */
export async function askAssistant({ key, messages, system, onText, signal, web = true, model = ASSISTANT_MODEL, tools = {}, fetchImpl = globalThis.fetch?.bind(globalThis) }) {
  const conversation = cleanHistory(messages).map(m => ({ role: m.role, content: m.text }));
  if (!conversation.length) throw Object.assign(new Error('There is no question to send.'), { type: 'empty' });
  let shown = '', useWeb = web;
  for (let round = 0; round < 10; round++) {
    const toolList = Object.values(tools).map(tool => tool.definition);
    if (useWeb) toolList.push({ type: 'web_search_20250305', name: 'web_search', max_uses: 3 });
    const body = { model, max_tokens: 4096, system, stream: true, messages: conversation, ...(toolList.length ? { tools: toolList } : {}) };
    const response = await fetchImpl('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal, credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01', 'anthropic-dangerous-direct-browser-access': 'true' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      let detail = '', type = ''; try { const json = await response.json(); detail = json?.error?.message || ''; type = json?.error?.type || ''; } catch {}
      if (useWeb && response.status === 400 && /tool|web_search/i.test(detail)) { useWeb = false; round--; continue; }
      const error = new Error(detail || `HTTP ${response.status}`); error.status = response.status; error.type = type;
      throw error;
    }
    const before = shown;
    const separator = before && !/\s$/.test(before) ? '\n\n' : '';
    const { content, stopReason } = await readReply(response, { signal,
      onText: blocks => { const text = visibleText(blocks); if (text) onText?.(before + separator + text); },
      onSearch: () => onText?.(shown, { searching: true }) });
    const text = visibleText(content);
    if (text) shown = before + separator + text;
    if (stopReason === 'tool_use') {
      conversation.push({ role: 'assistant', content });
      const results = [];
      for (const block of content.filter(b => b.type === 'tool_use')) {
        const tool = tools[block.name];
        let output;
        try { output = tool ? await tool.run(block.input || {}) : `Ferramenta desconhecida: ${block.name}`; }
        catch (error) { output = 'Erro ao consultar a biblioteca: ' + (error?.message || error); }
        results.push({ type: 'tool_result', tool_use_id: block.id, content: String(output || '(vazio)').slice(0, 24000) });
      }
      if (!results.length) break;
      conversation.push({ role: 'user', content: results });
      onText?.(shown, { library: true });
      continue;
    }
    if (stopReason === 'pause_turn') { conversation.push({ role: 'assistant', content }); continue; }
    break;
  }
  if (!shown.trim()) throw Object.assign(new Error('The AI sent an empty answer.'), { type: 'empty_answer' });
  return shown;
}

export function friendlyError(error, language = 'en') {
  const pt = language === 'pt-BR', status = error?.status, message = String(error?.message || '');
  if (error?.name === 'AbortError') return '';
  if (status === 401) return pt ? 'A chave da IA não foi aceita. Confira se copiou a chave inteira.' : 'The AI key was not accepted. Check that you copied the whole key.';
  if (status === 402 || /credit|billing|balance/i.test(message)) return pt ? 'Sua conta da IA está sem créditos. Adicione créditos no site da Anthropic e tente de novo.' : 'Your AI account is out of credit. Add credit on the Anthropic website and try again.';
  if (status === 429) return pt ? 'Muitas perguntas seguidas. Espere alguns segundos e tente de novo.' : 'Too many questions in a row. Wait a few seconds and try again.';
  if (status === 529 || status >= 500) return pt ? 'O serviço de IA está ocupado agora. Tente de novo daqui a pouco.' : 'The AI service is busy right now. Try again shortly.';
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return pt ? 'Sem internet. O assistente precisa de conexão.' : 'No internet. The assistant needs a connection.';
  if (error?.type === 'empty_answer') return pt ? 'A IA não mandou resposta desta vez. Tente perguntar de novo.' : 'The AI did not send an answer this time. Please ask again.';
  if (error?.type === 'interrupted') return pt ? 'A resposta foi interrompida (conexão lenta?). Tente de novo.' : 'The answer was interrupted (slow connection?). Please try again.';
  if (status === 400 || status === 404) return (pt ? 'A IA recusou o pedido: ' : 'The AI refused the request: ') + message.slice(0, 200);
  return (pt ? 'Não consegui falar com a IA agora. Tente de novo.' : 'Could not reach the AI right now. Please try again.') + (message ? ` (${message.slice(0, 120)})` : '');
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
