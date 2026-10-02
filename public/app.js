// Field names below are confirmed against the real MovieBox/Cinexora API
// responses (via /api/trending, /api/info, /api/sources on the live
// deployment) — not guesses anymore.

const els = {
  statusBar: document.getElementById('statusBar'),
  homeView: document.getElementById('homeView'),
  searchView: document.getElementById('searchView'),
  detailView: document.getElementById('detailView'),
  trendingGrid: document.getElementById('trendingGrid'),
  homepageGrid: document.getElementById('homepageGrid'),
  searchGrid: document.getElementById('searchGrid'),
  detailContent: document.getElementById('detailContent'),
  searchInput: document.getElementById('searchInput'),
  backBtn: document.getElementById('backBtn'),
  brandHome: document.getElementById('brandHome'),
};

function showStatus(msg) {
  els.statusBar.textContent = msg;
  els.statusBar.classList.remove('hidden');
}
function clearStatus() {
  els.statusBar.classList.add('hidden');
}

function showView(view) {
  els.homeView.classList.toggle('hidden', view !== 'home');
  els.searchView.classList.toggle('hidden', view !== 'search');
  els.detailView.classList.toggle('hidden', view !== 'detail');
}

async function api(path) {
  const res = await fetch(path);
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new Error((data && (data.error || data.message)) || `Request failed (${res.status})`);
  }
  console.log('[api]', path, data);
  return data;
}

// --- Field extraction (confirmed shapes) -----------------------------

// trending/homepage/search all return { results: { subjectList: [...] } }
function extractItems(payload) {
  const r = (payload && payload.results) || payload || {};
  return r.subjectList || r.items || r.list || (Array.isArray(r) ? r : []) || [];
}

function itemId(item) {
  return item.subjectId || item.id || '';
}
function itemTitle(item) {
  return item.title || item.name || 'Untitled';
}
// `cover` (and `stills`) are objects: { url, width, height, ... }
function itemPoster(item) {
  const cover = item.cover || item.stills || item.thumbnail;
  if (!cover) return '';
  if (typeof cover === 'string') return cover;
  return cover.url || '';
}
function itemDetailPath(item) {
  return item.detailPath || item.detail_path || '';
}

// --- Rendering ---------------------------------------------------------

function renderGrid(container, items) {
  container.innerHTML = '';
  if (!items.length) {
    container.innerHTML = '<div class="empty">Nothing here yet.</div>';
    return;
  }
  for (const item of items) {
    const card = document.createElement('div');
    card.className = 'card';
    const poster = itemPoster(item);
    card.innerHTML = `
      ${poster ? `<img src="${poster}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/api/imgproxy?url=${encodeURIComponent(poster)}'" />` : '<div style="aspect-ratio:2/3;background:#1a1a22;"></div>'}
      <div class="title">${itemTitle(item)}</div>
    `;
    card.addEventListener('click', () => openDetail(item));
    container.appendChild(card);
  }
}

async function loadHome() {
  showView('home');
  clearStatus();
  try {
    const trending = await api('/api/trending');
    renderGrid(els.trendingGrid, extractItems(trending));
  } catch (e) {
    showStatus(`Couldn't load trending: ${e.message}`);
  }
  try {
    const homepage = await api('/api/homepage');
    renderGrid(els.homepageGrid, extractItems(homepage));
  } catch (e) {
    showStatus(`Couldn't load homepage feed: ${e.message}`);
  }
}

async function runSearch(query) {
  if (!query.trim()) return loadHome();
  showView('search');
  clearStatus();
  els.searchGrid.innerHTML = '<div class="empty">Searching…</div>';
  try {
    const results = await api(`/api/search?q=${encodeURIComponent(query)}`);
    renderGrid(els.searchGrid, extractItems(results));
  } catch (e) {
    showStatus(`Search failed: ${e.message}`);
    els.searchGrid.innerHTML = '';
  }
}

async function openDetail(item) {
  showView('detail');
  clearStatus();
  const id = itemId(item);
  const detailPath = itemDetailPath(item);
  els.detailContent.innerHTML = '<div class="empty">Loading…</div>';

  let info;
  try {
    const path = `/api/info?id=${encodeURIComponent(id)}${detailPath ? `&detailPath=${encodeURIComponent(detailPath)}` : ''}`;
    info = await api(path);
  } catch (e) {
    els.detailContent.innerHTML = `<div class="empty">Couldn't load title info: ${e.message}</div>`;
    return;
  }

  const results = (info && info.results) || {};
  const subject = results.subject || {};
  const merged = { ...item, ...subject };
  const title = itemTitle(merged);
  const poster = itemPoster(merged);
  const description = subject.description || '';
  const seasons = (results.resource && results.resource.seasons) || [];
  // subjectType: 1 = movie, 2 = TV/series (confirmed from live data)
  const isSeries = subject.subjectType === 2 || seasons.length > 0;

  let seasonEpisodePicker = '';
  if (isSeries && seasons.length) {
    const seasonOptions = seasons
      .map((s) => `<option value="${s.se}">Season ${s.se}</option>`)
      .join('');
    seasonEpisodePicker = `
      <div class="episode-picker">
        <select id="seasonSelect">${seasonOptions}</select>
        <select id="episodeSelect"></select>
      </div>
    `;
  }

  els.detailContent.innerHTML = `
    <div class="detail-header">
      <div class="detail-poster">
        ${poster ? `<img src="${poster}" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='/api/imgproxy?url=${encodeURIComponent(poster)}'" />` : ''}
      </div>
      <div class="detail-meta">
        <h1>${title}</h1>
        <p>${description}</p>
        ${seasonEpisodePicker}
        <button class="play-btn" id="playBtn">▶ Play</button>
      </div>
    </div>
    <div class="player-wrap" id="playerWrap"></div>
  `;

  if (isSeries && seasons.length) {
    const seasonSelect = document.getElementById('seasonSelect');
    const episodeSelect = document.getElementById('episodeSelect');

    function populateEpisodes() {
      const season = seasons.find((s) => String(s.se) === seasonSelect.value) || seasons[0];
      const maxEp = season.maxEp || 1;
      episodeSelect.innerHTML = Array.from({ length: maxEp }, (_, i) => i + 1)
        .map((ep) => `<option value="${ep}">Episode ${ep}</option>`)
        .join('');
    }
    seasonSelect.addEventListener('change', populateEpisodes);
    populateEpisodes();

    document.getElementById('playBtn').addEventListener('click', () => {
      loadSources(id, detailPath, seasonSelect.value, episodeSelect.value);
    });
  } else {
    document.getElementById('playBtn').addEventListener('click', () => {
      loadSources(id, detailPath, null, null);
    });
  }
}

async function loadSources(id, detailPath, season, episode) {
  const wrap = document.getElementById('playerWrap');
  wrap.innerHTML = '<div class="empty">Fetching stream…</div>';
  try {
    let path = `/api/sources?id=${encodeURIComponent(id)}`;
    if (detailPath) path += `&detailPath=${encodeURIComponent(detailPath)}`;
    if (season && episode) path += `&season=${season}&episode=${episode}`;
    const sources = await api(path);
    renderPlayer(wrap, sources);
  } catch (e) {
    wrap.innerHTML = `<div class="empty">Couldn't load stream: ${e.message}</div>`;
  }
}

// `streams` (and `downloads`) is an array of { url, format, resolution, ... }
// — plain progressive MP4s, already sorted low-to-high resolution in
// practice but we sort explicitly to be safe, and default to the highest.
function pickBestStream(sources) {
  const results = (sources && sources.results) || {};
  const streams = results.streams || results.downloads || [];
  if (!streams.length) return null;
  const sorted = [...streams].sort((a, b) => (b.resolution || 0) - (a.resolution || 0));
  return sorted;
}

function renderPlayer(wrap, sources) {
  const streams = pickBestStream(sources);

  if (streams && streams.length) {
    const sourceTags = streams
      .map((s) => `<source src="${s.url}" type="video/mp4" label="${s.resolution}p" />`)
      .join('');
    const qualityOptions = streams
      .map((s, i) => `<option value="${i}">${s.resolution}p</option>`)
      .join('');

    wrap.innerHTML = `
      <video id="videoPlayer" controls autoplay playsinline src="${streams[0].url}"></video>
      <div class="quality-row">
        Quality:
        <select id="qualitySelect">${qualityOptions}</select>
      </div>
    `;

    document.getElementById('qualitySelect').addEventListener('change', (e) => {
      const video = document.getElementById('videoPlayer');
      const time = video.currentTime;
      const wasPlaying = !video.paused;
      video.src = streams[e.target.value].url;
      video.currentTime = time;
      if (wasPlaying) video.play();
    });
    return;
  }

  const results = (sources && sources.results) || {};
  if (results.captions || results.processedSources) {
    // Streams existed in processedSources but pickBestStream didn't find
    // results.streams/downloads for some reason — fall back to those.
    const processed = results.processedSources || [];
    if (processed.length) {
      const sorted = [...processed].sort((a, b) => (b.quality || 0) - (a.quality || 0));
      wrap.innerHTML = `<video controls autoplay playsinline src="${sorted[0].directUrl || sorted[0].streamUrl}"></video>`;
      return;
    }
  }

  wrap.innerHTML = `
    <div class="empty">Couldn't find a playable stream for this selection. Raw response below.</div>
    <div class="raw-debug">${escapeHtml(JSON.stringify(sources, null, 2))}</div>
  `;
}

function escapeHtml(str) {
  return str.replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// --- Wiring --------------------------------------------------------------

let searchDebounce;
els.searchInput.addEventListener('input', (e) => {
  clearTimeout(searchDebounce);
  const value = e.target.value;
  searchDebounce = setTimeout(() => runSearch(value), 400);
});

els.backBtn.addEventListener('click', loadHome);
els.brandHome.addEventListener('click', () => {
  els.searchInput.value = '';
  loadHome();
});

loadHome();
