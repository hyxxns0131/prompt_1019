/* ==========================================================
   Prompt Library 동작 스크립트 (Vanilla JS)
   데이터: data.js 의 PROMPTS, CATEGORY_TIPS
   ========================================================== */
(function () {
  "use strict";

  /* ---------- 공통 도구 ---------- */
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const PURPOSES = [
    { value: "글쓰기", sub: "메일 · 제안서 · 홍보글" },
    { value: "코딩", sub: "바이브 코딩 · 웹 · 파이썬" },
    { value: "업무", sub: "무역 실무 · 협상 · 통관" },
    { value: "분석·기획", sub: "전략 · 비교 · 의사결정" },
    { value: "학습", sub: "개념 이해 · 학습 계획" },
    { value: "게임", sub: "롤플레이 · 텍스트 게임" },
  ];
  const TOOLS = ["ChatGPT", "Claude", "Gemini"];
  const LEVELS = ["입문", "중급", "고급"];
  const ANY = "상관없음";
  const MY_CATEGORY = "내 프롬프트";

  // localStorage 는 사생활 보호 모드 등에서 막힐 수 있어 항상 try 로 감싼다
  const store = {
    get(key, fallback) {
      try {
        const v = localStorage.getItem(key);
        return v === null ? fallback : JSON.parse(v);
      } catch (e) { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* 저장 불가 시 무시 */ }
    },
  };

  /* ---------- 상태 ---------- */
  const state = {
    custom: store.get("pl-custom", []),            // 내가 추가한 프롬프트
    favs: new Set(store.get("pl-favs", [])),       // 즐겨찾기 id
    view: store.get("pl-view", "cards"),           // cards | table
    query: "",
    category: "전체",
    favOnly: false,
    wizardFilter: null,                            // { purpose, tool, level }
    sort: { key: null, dir: 1 },
  };

  const allPrompts = () => [...state.custom, ...PROMPTS];
  const findPrompt = (id) => allPrompts().find((p) => p.id === id);

  /* ==========================================================
     테마 토글
     ========================================================== */
  const themeBtn = $("#themeToggle");
  function syncThemeLabel() {
    const dark = document.documentElement.getAttribute("data-theme") === "dark";
    themeBtn.setAttribute("aria-label", dark ? "라이트 모드로 전환" : "다크 모드로 전환");
  }
  themeBtn.addEventListener("click", () => {
    const next = document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", next);
    try { localStorage.setItem("pl-theme", next); } catch (e) {}
    syncThemeLabel();
  });
  syncThemeLabel();

  /* ==========================================================
     모바일 햄버거 메뉴
     ========================================================== */
  const menuBtn = $("#menuToggle");
  const nav = $("#siteNav");
  function setMenu(open) {
    nav.classList.toggle("open", open);
    menuBtn.setAttribute("aria-expanded", String(open));
    menuBtn.setAttribute("aria-label", open ? "메뉴 닫기" : "메뉴 열기");
  }
  menuBtn.addEventListener("click", () => setMenu(!nav.classList.contains("open")));
  nav.addEventListener("click", (e) => { if (e.target.closest("a, button")) setMenu(false); });

  /* ==========================================================
     토스트 ("복사되었습니다!")
     ========================================================== */
  const toastEl = $("#toast");
  let toastTimer;
  function toast(msg) {
    toastEl.textContent = msg;
    toastEl.classList.add("show");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toastEl.classList.remove("show"), 1800);
  }

  /* ==========================================================
     복사
     ========================================================== */
  async function copyPrompt(id, btn) {
    const p = findPrompt(id);
    if (!p) return;
    try {
      await navigator.clipboard.writeText(p.prompt);
    } catch (e) {
      // clipboard API 를 못 쓰는 환경 (file:// 등) 대비
      const ta = document.createElement("textarea");
      ta.value = p.prompt;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
    }
    toast("복사되었습니다!");
    if (btn) {
      const old = btn.textContent;
      btn.textContent = "복사됨 ✓";
      btn.classList.add("done");
      setTimeout(() => { btn.textContent = old; btn.classList.remove("done"); }, 1400);
    }
  }

  /* ==========================================================
     즐겨찾기
     ========================================================== */
  function toggleFav(id) {
    if (state.favs.has(id)) {
      state.favs.delete(id);
      toast("즐겨찾기에서 뺐어요");
    } else {
      state.favs.add(id);
      toast("즐겨찾기에 추가했어요 ★");
    }
    store.set("pl-favs", [...state.favs]);
    renderFavCount();
    renderLibrary();
    if (!wizardResult.hidden) renderWizardResult();
    if (currentDetailId === id) syncDetailFav();
  }
  function renderFavCount() {
    // 지워진 프롬프트의 id 는 세지 않기
    const ids = new Set(allPrompts().map((p) => p.id));
    $("#favCount").textContent = [...state.favs].filter((id) => ids.has(id)).length;
  }
  function showFavorites() {
    state.favOnly = true;
    state.category = "전체";
    state.wizardFilter = null;
    renderLibrary();
    $("#library").scrollIntoView();
  }
  $("#favNav").addEventListener("click", showFavorites);
  $("#ctaFav").addEventListener("click", showFavorites);

  /* ==========================================================
     카드 / 표 행 만들기
     ========================================================== */
  function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === "class") node.className = v;
      else if (k === "text") node.textContent = v;
      else node.setAttribute(k, v);
    }
    children.forEach((c) => c && node.append(c));
    return node;
  }

  function badges(p) {
    const wrap = el("div", { class: "badges" });
    wrap.append(el("span", { class: "badge cat", text: p.category }));
    if (p.custom) wrap.append(el("span", { class: "badge mine", text: "내 프롬프트" }));
    wrap.append(el("span", { class: "badge", text: p.tool === "공통" ? "모든 AI" : p.tool }));
    wrap.append(el("span", { class: "badge", text: p.level }));
    return wrap;
  }

  function starBtn(p) {
    const on = state.favs.has(p.id);
    return el("button", {
      type: "button", class: "star", "data-action": "fav", "data-id": p.id,
      "aria-pressed": String(on), "aria-label": `${p.title} 즐겨찾기${on ? " 해제" : ""}`,
      text: on ? "★" : "☆",
    });
  }

  function makeCard(p) {
    const card = el("article", { class: "card" });
    const head = el("div", { class: "card-head" });
    const h = el("h3", { class: "card-title" },
      el("button", { type: "button", "data-action": "open", "data-id": p.id, text: p.title }));
    head.append(h, starBtn(p));
    card.append(
      head,
      badges(p),
      el("p", { class: "card-desc", text: p.description || "" }),
      el("div", { class: "card-foot" },
        el("span", { class: "badge", text: p.purpose }),
        el("button", { type: "button", class: "btn btn-ghost", "data-action": "copy", "data-id": p.id, "aria-label": `${p.title} 복사`, text: "복사" })
      )
    );
    return card;
  }

  function makeRow(p) {
    const tr = el("tr", { "data-id": p.id });
    tr.append(
      el("td", { "data-label": "제목" }, el("button", { type: "button", class: "row-title", "data-action": "open", "data-id": p.id, text: p.title })),
      el("td", { "data-label": "카테고리", text: p.category }),
      el("td", { "data-label": "툴", text: p.tool === "공통" ? "모든 AI" : p.tool }),
      el("td", { "data-label": "난이도", text: p.level }),
      el("td", {}, el("div", { class: "row-actions" },
        el("button", { type: "button", class: "btn btn-ghost", "data-action": "copy", "data-id": p.id, "aria-label": `${p.title} 복사`, text: "복사" }),
        starBtn(p)))
    );
    return tr;
  }

  // 카드·표·추천 결과의 버튼 클릭을 한 곳에서 처리 (이벤트 위임)
  function handleAction(e) {
    const btn = e.target.closest("[data-action]");
    if (btn) {
      const id = btn.dataset.id;
      if (btn.dataset.action === "open") openDetail(id, btn);
      if (btn.dataset.action === "copy") copyPrompt(id, btn);
      if (btn.dataset.action === "fav") toggleFav(id);
      return;
    }
    // 표의 행 아무 곳이나 눌러도 상세 열기
    const row = e.target.closest("tr[data-id]");
    if (row) openDetail(row.dataset.id, $(".row-title", row));
  }
  ["#cardGrid", "#tableBody", "#resultGrid"].forEach((s) => $(s).addEventListener("click", handleAction));

  /* ==========================================================
     라이브러리: 검색 · 필터 · 정렬
     ========================================================== */
  function matchesWizard(p, f) {
    if (!f) return true;
    if (f.purpose && p.purpose !== f.purpose) return false;
    if (f.tool && f.tool !== ANY && p.tool !== "공통" && p.tool !== f.tool) return false;
    if (f.level && f.level !== ANY && p.level !== f.level) return false;
    return true;
  }

  function filtered() {
    const q = state.query.trim().toLowerCase();
    let list = allPrompts().filter((p) => {
      if (state.category !== "전체" && p.category !== state.category) return false;
      if (state.favOnly && !state.favs.has(p.id)) return false;
      if (!matchesWizard(p, state.wizardFilter)) return false;
      if (q) {
        const hay = [p.title, p.description, p.prompt, p.category, p.purpose, p.tool, ...(p.tags || [])].join(" ").toLowerCase();
        if (!q.split(/\s+/).every((w) => hay.includes(w))) return false;
      }
      return true;
    });
    const { key, dir } = state.sort;
    if (key) {
      const val = (p) => (key === "level" ? LEVELS.indexOf(p.level) : String(p[key]));
      list = list.slice().sort((a, b) => {
        const A = val(a), B = val(b);
        return (typeof A === "number" ? A - B : A.localeCompare(B, "ko")) * dir;
      });
    }
    return list;
  }

  function renderChips() {
    const counts = {};
    allPrompts().forEach((p) => { counts[p.category] = (counts[p.category] || 0) + 1; });
    const cats = ["전체", ...Object.keys(counts)];
    if (!cats.includes(state.category)) state.category = "전체";  // 마지막 내 프롬프트를 지운 경우 등
    const wrap = $("#chips");
    wrap.innerHTML = "";
    cats.forEach((c) => {
      const b = el("button", { type: "button", class: "chip", "aria-pressed": String(state.category === c), "data-cat": c }, c);
      b.append(el("span", { class: "n", text: c === "전체" ? allPrompts().length : counts[c] }));
      wrap.append(b);
    });
  }
  $("#chips").addEventListener("click", (e) => {
    const b = e.target.closest("[data-cat]");
    if (!b) return;
    state.category = b.dataset.cat;
    renderLibrary();
  });

  // 현재 걸려 있는 필터(즐겨찾기, 위저드 조건)를 태그로 보여 주고 ✕ 로 지우기
  function renderActiveFilters() {
    const wrap = $("#activeFilters");
    wrap.innerHTML = "";
    const add = (label, onClear) => {
      const x = el("button", { type: "button", "aria-label": `${label} 필터 지우기`, text: "✕" });
      x.addEventListener("click", () => { onClear(); renderLibrary(); });
      wrap.append(el("span", { class: "filter-tag" }, label, x));
    };
    if (state.favOnly) add("★ 즐겨찾기만", () => { state.favOnly = false; });
    if (state.wizardFilter) {
      const f = state.wizardFilter;
      add(`추천 조건: ${[f.purpose, f.tool, f.level].filter((v) => v && v !== ANY).join(" · ")}`, () => { state.wizardFilter = null; });
    }
  }

  function renderLibrary() {
    const list = filtered();
    renderChips();
    renderActiveFilters();

    const grid = $("#cardGrid");
    grid.innerHTML = "";
    list.forEach((p) => grid.append(makeCard(p)));

    const body = $("#tableBody");
    body.innerHTML = "";
    list.forEach((p) => body.append(makeRow(p)));

    $("#resultCount").textContent = `${list.length}개의 프롬프트`;
    $("#emptyState").hidden = list.length > 0;
    $("#cardView").hidden = state.view !== "cards" || !list.length;
    $("#tableView").hidden = state.view !== "table" || !list.length;
    $("#emptyState .empty-title").textContent = state.favOnly && !state.favs.size
      ? "아직 즐겨찾기한 프롬프트가 없어요"
      : "찾는 프롬프트가 없어요";
    renderFavCount();
  }

  let searchTimer;
  $("#searchInput").addEventListener("input", (e) => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => { state.query = e.target.value; renderLibrary(); }, 120);
  });

  $("#clearFilters").addEventListener("click", () => {
    Object.assign(state, { query: "", category: "전체", favOnly: false, wizardFilter: null });
    $("#searchInput").value = "";
    renderLibrary();
  });

  /* ---------- 표 정렬 ---------- */
  $$(".prompt-table th button").forEach((btn) => {
    btn.addEventListener("click", () => {
      const key = btn.dataset.sort;
      state.sort = state.sort.key === key ? { key, dir: -state.sort.dir } : { key, dir: 1 };
      $$(".prompt-table th[aria-sort]").forEach((th) => th.setAttribute("aria-sort", "none"));
      btn.parentElement.setAttribute("aria-sort", state.sort.dir === 1 ? "ascending" : "descending");
      renderLibrary();
    });
  });

  /* ---------- 카드 보기 / 표 보기 토글 ---------- */
  function setView(v) {
    state.view = v;
    store.set("pl-view", v);
    $("#viewCards").setAttribute("aria-selected", String(v === "cards"));
    $("#viewTable").setAttribute("aria-selected", String(v === "table"));
    renderLibrary();
  }
  $("#viewCards").addEventListener("click", () => setView("cards"));
  $("#viewTable").addEventListener("click", () => setView("table"));
  // 탭 목록 방향키 이동
  $(".segmented").addEventListener("keydown", (e) => {
    if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
    const next = state.view === "cards" ? "table" : "cards";
    setView(next);
    $(next === "cards" ? "#viewCards" : "#viewTable").focus();
  });

  /* ==========================================================
     Step 위저드 — 3D 기기
     화면 목록에서 고르고(다이얼 · 휠 · 방향키 · 클릭) ACCEPT 로 다음 단계
     ========================================================== */
  const STEPS = [
    {
      key: "purpose", title: "목적", en: "Purpose",
      q: "어떤 프롬프트가\n필요하세요?", hint: "하고 싶은 일을 골라 주세요.",
      options: () => PURPOSES.map((p) => ({ value: p.value, label: p.value, sub: count({ purpose: p.value }) })),
    },
    {
      key: "tool", title: "AI 툴", en: "AI tool",
      q: "어떤 AI를\n쓰세요?", hint: "대부분의 프롬프트는 어떤 AI에서나 잘 작동해요.",
      options: () => [...TOOLS, ANY].map((v) => ({ value: v, label: v })),
    },
    {
      key: "level", title: "난이도", en: "Level",
      q: "난이도는 어느 정도가\n좋을까요?", hint: "처음이라면 입문부터 시작해 보세요.",
      options: () => [...LEVELS, ANY].map((v) => ({ value: v, label: v })),
    },
  ];
  const wiz = { step: 0, answers: {}, cursor: 0, power: true, items: [] };

  const wizardResult = $("#wizardResult");
  const stageCopy = $("#stageCopy");
  const screen = $("#screen");
  const listEl = $("#screenList");
  const listWrap = $("#screenListWrap");
  const dial = $("#dial");
  const nextBtn = $("#wizardNext");
  const backBtn = $("#wizardBack");
  const resetBtn = $("#wizardReset");
  const device = $("#device");

  const pad = (n) => String(n).padStart(2, "0");
  // 현재 위저드 답 + 추가 조건에 맞는 프롬프트 수 (선택지 옆 숫자)
  function count(extra) {
    return allPrompts().filter((p) => matchesWizard(p, { ...wiz.answers, ...extra })).length + "개";
  }

  // 기기 두께 층 만들기
  (function buildSlices() {
    const wrap = $("#deviceSlices");
    const N = 12;
    for (let i = 1; i <= N; i++) {
      const s = document.createElement("span");
      s.style.transform = `translateZ(${-i * 0.28}em)`;
      wrap.append(s);
    }
  })();

  function renderWizard() {
    const done = wiz.step >= STEPS.length;
    const s = STEPS[wiz.step];

    $("#stepNow").textContent = done ? "RESULT" : `STEP ${pad(wiz.step + 1)}`;
    $("#stepTotal").textContent = pad(STEPS.length);
    $("#serial").textContent = done ? "✦END" : `✦${String(wiz.step + 1).padStart(3, "0")}`;
    $("#ledFill").style.height = `${((wiz.step + 1) / (STEPS.length + 1)) * 100}%`;

    const title = $("#wizardTitle");
    title.textContent = done ? "추천" : s.title;
    title.append(el("span", { text: done ? "Results" : s.en }));

    if (done) {
      const { list, relaxed } = wizardMatches();
      wiz.items = list.slice(0, 12).map((p) => ({ value: p.id, label: p.title, sub: p.level }));
      $("#screenQ").textContent = list.length ? `결과가 나왔어요\n추천 ${list.length}개` : "맞는 프롬프트가\n없어요";
      $("#wizardHint").textContent = (relaxed ? relaxed + " " : "") + "화면에서 고르고 OPEN을 누르면 바로 열어 볼 수 있어요.";
      nextBtn.textContent = "OPEN";
      wiz.cursor = 0;
    } else {
      wiz.items = s.options();
      $("#screenQ").textContent = s.q;
      $("#wizardHint").textContent = s.hint;
      nextBtn.textContent = "ACCEPT";
      const prev = wiz.items.findIndex((o) => o.value === wiz.answers[s.key]);
      wiz.cursor = prev >= 0 ? prev : 0;
    }
    $("#screenQ").style.whiteSpace = "pre-line";

    listEl.innerHTML = "";
    wiz.items.forEach((o, i) => {
      const li = el("li", { role: "option", id: `wopt-${i}`, "data-i": i, "aria-selected": "false" }, el("span", { text: o.label }));
      if (o.sub) li.append(el("small", { text: o.sub }));
      listEl.append(li);
    });
    dial.setAttribute("aria-valuemax", String(Math.max(1, wiz.items.length)));
    setCursor(wiz.cursor, true);

    backBtn.disabled = wiz.step === 0;
    syncPower();

    wizardResult.hidden = !done;
    if (done) renderWizardResult();

    // 제목·화면 바뀔 때 애니메이션
    stageCopy.classList.remove("swap");
    screen.classList.remove("flash");
    void stageCopy.offsetWidth;
    stageCopy.classList.add("swap");
    screen.classList.add("flash");
  }

  function setCursor(i, instant) {
    const n = wiz.items.length;
    if (!n) return;
    wiz.cursor = Math.max(0, Math.min(n - 1, i));
    $$("li", listEl).forEach((li, k) => li.setAttribute("aria-selected", String(k === wiz.cursor)));
    listEl.setAttribute("aria-activedescendant", `wopt-${wiz.cursor}`);
    dial.setAttribute("aria-valuenow", String(wiz.cursor + 1));
    dial.setAttribute("aria-valuetext", wiz.items[wiz.cursor].label);

    // 선택 줄이 목록 가운데쯤 오도록 스크롤
    const li = listEl.children[wiz.cursor];
    const target = li.offsetTop - (listWrap.clientHeight - li.offsetHeight) / 2;
    listWrap.style.scrollBehavior = instant ? "auto" : "";
    listWrap.scrollTop = Math.max(0, target);

    // 오른쪽 스크롤바
    const thumb = $("#scrollThumb");
    const h = Math.max(18, (listWrap.clientHeight / Math.max(listEl.scrollHeight, 1)) * 100);
    thumb.style.height = Math.min(100, h) + "%";
    thumb.style.top = (n > 1 ? (wiz.cursor / (n - 1)) * (100 - Math.min(100, h)) : 0) + "%";
  }

  function move(delta) {
    if (!wiz.power) return;
    setCursor(wiz.cursor + delta);
  }

  // 버튼을 실제로 누른 것처럼 잠깐 눌림 표시 (키보드 조작 시)
  function press(btn) {
    btn.classList.add("pressed");
    setTimeout(() => btn.classList.remove("pressed"), 120);
  }

  function accept() {
    if (!wiz.power || !wiz.items.length) return;
    const item = wiz.items[wiz.cursor];
    if (wiz.step >= STEPS.length) { openDetail(item.value, nextBtn); return; }
    wiz.answers[STEPS[wiz.step].key] = item.value;
    wiz.step++;
    renderWizard();
  }
  function back() {
    if (!wiz.power || wiz.step === 0) return;
    wiz.step--;
    renderWizard();
  }
  function reset() {
    if (!wiz.power) return;
    wiz.step = 0;
    wiz.answers = {};
    renderWizard();
  }

  nextBtn.addEventListener("click", accept);
  backBtn.addEventListener("click", back);
  resetBtn.addEventListener("click", reset);

  // 화면 목록: 클릭으로 고르기, 이미 고른 줄을 한 번 더 누르면 ACCEPT
  listEl.addEventListener("click", (e) => {
    const li = e.target.closest("li");
    if (!li || !wiz.power) return;
    const i = Number(li.dataset.i);
    if (i === wiz.cursor) { press(nextBtn); accept(); } else setCursor(i);
  });

  // 키보드: ↑↓ 이동, Enter 확인, Backspace 뒤로 (화면 목록·다이얼 공통)
  function onKeys(e) {
    const map = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };
    if (map[e.key]) { e.preventDefault(); move(map[e.key]); spinDial(map[e.key] * 30); }
    else if (e.key === "Home") { e.preventDefault(); setCursor(0); }
    else if (e.key === "End") { e.preventDefault(); setCursor(wiz.items.length - 1); }
    else if (e.key === "Enter" || e.key === " ") { e.preventDefault(); press(nextBtn); accept(); }
    else if (e.key === "Backspace") { e.preventDefault(); press(backBtn); back(); }
  }
  listEl.addEventListener("keydown", onKeys);
  dial.addEventListener("keydown", onKeys);

  // 마우스 휠: 화면·다이얼 위에서 돌리면 한 칸씩
  let wheelLock = 0;
  [screen, dial].forEach((t) => t.addEventListener("wheel", (e) => {
    e.preventDefault();
    const now = Date.now();
    if (now - wheelLock < 90) return;
    wheelLock = now;
    const d = e.deltaY > 0 ? 1 : -1;
    move(d);
    spinDial(d * 30);
  }, { passive: false }));

  // 다이얼 드래그: 30도 돌릴 때마다 한 칸
  let rot = 0;
  function spinDial(deg) {
    rot += deg;
    dial.style.setProperty("--rot", rot + "deg");
  }
  (function dialDrag() {
    let dragging = false, lastAngle = 0, acc = 0;
    const angleOf = (e) => {
      const r = dial.getBoundingClientRect();
      return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    };
    dial.addEventListener("pointerdown", (e) => {
      if (!wiz.power) return;
      dragging = true; acc = 0; lastAngle = angleOf(e);
      dial.setPointerCapture(e.pointerId);
    });
    dial.addEventListener("pointermove", (e) => {
      if (!dragging) return;
      const a = angleOf(e);
      let d = a - lastAngle;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      lastAngle = a;
      spinDial(d);
      acc += d;
      while (acc >= 30) { move(1); acc -= 30; }
      while (acc <= -30) { move(-1); acc += 30; }
    });
    const end = () => { dragging = false; };
    dial.addEventListener("pointerup", end);
    dial.addEventListener("pointercancel", end);
  })();

  // 전원 스위치: 화면 끄기 / 켜기
  function syncPower() {
    screen.classList.toggle("off", !wiz.power);
    $("#powerSwitch").setAttribute("aria-checked", String(wiz.power));
    nextBtn.disabled = !wiz.power || !wiz.items.length;
    resetBtn.disabled = !wiz.power;
    backBtn.disabled = !wiz.power || wiz.step === 0;
  }
  $("#powerSwitch").addEventListener("click", () => {
    wiz.power = !wiz.power;
    syncPower();
    if (wiz.power) { screen.classList.remove("flash"); void screen.offsetWidth; screen.classList.add("flash"); }
  });

  // 마우스를 따라 기기가 살짝 기울어짐
  const reduceMotion = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!reduceMotion) {
    const stage = $("#wizard");
    let raf = 0;
    stage.addEventListener("pointermove", (e) => {
      if (e.pointerType !== "mouse") return;
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const r = stage.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        device.style.setProperty("--ry", (x * 16).toFixed(2) + "deg");
        device.style.setProperty("--rx", (-y * 12).toFixed(2) + "deg");
      });
    });
    stage.addEventListener("pointerleave", () => {
      device.style.setProperty("--ry", "0deg");
      device.style.setProperty("--rx", "0deg");
    });
  }

  // 조건에 맞는 추천 결과 (없으면 난이도 → 툴 순서로 조건을 풀어서 다시 찾기)
  function wizardMatches() {
    const a = wiz.answers;
    let f = { purpose: a.purpose, tool: a.tool, level: a.level };
    let list = allPrompts().filter((p) => matchesWizard(p, f));
    let relaxed = "";
    if (!list.length) {
      f = { ...f, level: ANY };
      list = allPrompts().filter((p) => matchesWizard(p, f));
      relaxed = "선택한 난이도에 맞는 프롬프트가 없어 다른 난이도도 함께 보여 드려요.";
    }
    if (!list.length) {
      f = { purpose: a.purpose, tool: ANY, level: ANY };
      list = allPrompts().filter((p) => matchesWizard(p, f));
      relaxed = "조건을 넓혀서 같은 목적의 프롬프트를 보여 드려요.";
    }
    // 즐겨찾기 → 쉬운 난이도 순으로 위에 오게
    list.sort((x, y) => (state.favs.has(y.id) - state.favs.has(x.id)) || (LEVELS.indexOf(x.level) - LEVELS.indexOf(y.level)));
    return { list, f, relaxed };
  }

  function renderWizardResult() {
    const { list, f } = wizardMatches();
    const cond = [f.purpose, f.tool, f.level].filter((v) => v && v !== ANY).join(" · ");
    $("#resultSummary").textContent = `${cond} 조건에 맞는 프롬프트 ${list.length}개 중 ${Math.min(6, list.length)}개를 골랐어요.`;
    const grid = $("#resultGrid");
    grid.innerHTML = "";
    list.slice(0, 6).forEach((p) => grid.append(makeCard(p)));
    $("#resultToLibrary").onclick = () => {
      state.wizardFilter = f;
      state.category = "전체";
      state.favOnly = false;
      renderLibrary();
      $("#library").scrollIntoView();
    };
  }

  /* ==========================================================
     모달 (상세 / 추가) — 포커스 가두기, Esc 닫기
     ========================================================== */
  let lastFocus = null;
  let openModalEl = null;
  let currentDetailId = null;

  function focusables(root) {
    return $$("a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex='-1'])", root)
      .filter((n) => !n.hidden && n.offsetParent !== null);
  }
  function openModal(modal, opener) {
    lastFocus = opener || document.activeElement;
    modal.hidden = false;
    openModalEl = modal;
    document.body.style.overflow = "hidden";
    const f = focusables($(".modal-box", modal));
    (f[1] || f[0]).focus();
  }
  function closeModal() {
    if (!openModalEl) return;
    openModalEl.hidden = true;
    openModalEl = null;
    currentDetailId = null;
    document.body.style.overflow = "";
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  }
  $$(".modal").forEach((m) => m.addEventListener("click", (e) => { if (e.target.closest("[data-close]")) closeModal(); }));

  document.addEventListener("keydown", (e) => {
    const layer = openModalEl ? $(".modal-box", openModalEl) : guidePanel.classList.contains("open") ? guidePanel : null;
    if (!layer) return;
    if (e.key === "Escape") { openModalEl ? closeModal() : closeGuide(); return; }
    if (e.key === "Tab") {
      const f = focusables(layer);
      if (!f.length) return;
      const first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  /* ---------- 상세 모달 ---------- */
  const detailModal = $("#detailModal");
  function syncDetailFav() {
    const on = state.favs.has(currentDetailId);
    const b = $("#detailFav");
    b.textContent = on ? "★ 즐겨찾기 해제" : "☆ 즐겨찾기";
    b.setAttribute("aria-pressed", String(on));
  }
  function openDetail(id, opener) {
    const p = findPrompt(id);
    if (!p) return;
    currentDetailId = id;
    const bw = $("#detailBadges");
    bw.replaceWith(Object.assign(badges(p), { id: "detailBadges" }));
    $("#detailTitle").textContent = p.title;
    $("#detailDesc").textContent = p.description || "";
    $("#detailPrompt").textContent = p.prompt;
    $("#detailTip").textContent = (CATEGORY_TIPS && CATEGORY_TIPS[p.category]) ||
      "[ ] 나 ( ) 로 표시된 부분을 내 상황에 맞게 바꿔서 쓰세요.";
    $("#detailDelete").hidden = !p.custom;
    syncDetailFav();
    openModal(detailModal, opener);
  }
  $("#detailCopy").addEventListener("click", (e) => copyPrompt(currentDetailId, e.currentTarget));
  $("#detailFav").addEventListener("click", () => toggleFav(currentDetailId));
  $("#detailDelete").addEventListener("click", () => {
    const p = findPrompt(currentDetailId);
    if (!p || !p.custom || !confirm(`"${p.title}" 프롬프트를 삭제할까요?`)) return;
    state.custom = state.custom.filter((c) => c.id !== p.id);
    state.favs.delete(p.id);
    store.set("pl-custom", state.custom);
    store.set("pl-favs", [...state.favs]);
    closeModal();
    renderLibrary();
    updateHeroCount();
    toast("삭제했어요");
  });

  /* ---------- 내 프롬프트 추가 ---------- */
  const addModal = $("#addModal");
  const addForm = $("#addForm");
  (function fillSelects() {
    const fill = (name, values) => {
      const s = addForm.elements[name];
      values.forEach((v) => s.append(el("option", { value: v, text: v })));
    };
    fill("purpose", PURPOSES.map((p) => p.value));
    fill("tool", ["공통", ...TOOLS]);
    fill("level", LEVELS);
  })();
  $("#openAdd").addEventListener("click", (e) => openModal(addModal, e.currentTarget));
  addForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const d = new FormData(addForm);
    const title = String(d.get("title")).trim();
    const prompt = String(d.get("prompt")).trim();
    if (!title || !prompt) return;
    const item = {
      id: "my-" + Date.now().toString(36),
      title, prompt,
      description: String(d.get("description")).trim(),
      category: MY_CATEGORY,
      purpose: d.get("purpose"), tool: d.get("tool"), level: d.get("level"),
      tags: [MY_CATEGORY], custom: true,
    };
    state.custom.unshift(item);
    store.set("pl-custom", state.custom);
    addForm.reset();
    closeModal();
    Object.assign(state, { category: MY_CATEGORY, favOnly: false, wizardFilter: null });
    renderLibrary();
    updateHeroCount();
    $("#library").scrollIntoView();
    toast("내 프롬프트를 저장했어요");
  });

  /* ==========================================================
     가이드 패널 (오른쪽 슬라이드)
     ========================================================== */
  const guidePanel = $("#guidePanel");
  const guideBackdrop = $("#guideBackdrop");
  let guideOpener = null;
  function openGuide(e) {
    guideOpener = e && e.currentTarget;
    guidePanel.classList.add("open");
    guidePanel.setAttribute("aria-hidden", "false");
    guideBackdrop.hidden = false;
    document.body.style.overflow = "hidden";
    $("#closeGuide").focus();
  }
  function closeGuide() {
    guidePanel.classList.remove("open");
    guidePanel.setAttribute("aria-hidden", "true");
    guideBackdrop.hidden = true;
    document.body.style.overflow = "";
    if (guideOpener) guideOpener.focus();
  }
  $("#openGuide").addEventListener("click", openGuide);
  $("#closeGuide").addEventListener("click", closeGuide);
  guideBackdrop.addEventListener("click", closeGuide);

  /* ==========================================================
     스크롤 페이드인 (IntersectionObserver)
     ========================================================== */
  const reduce = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!("IntersectionObserver" in window) || reduce) {
    $$(".reveal").forEach((n) => n.classList.add("in"));
  } else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); }
      });
    // threshold 를 비율로 주면 아주 긴 섹션(라이브러리)은 끝내 조건을 못 채워 안 보일 수 있음
    // → 화면에 조금이라도 들어오면 표시
    }, { threshold: 0, rootMargin: "0px 0px -60px 0px" });
    $$(".reveal").forEach((n) => io.observe(n));
  }
  // 링크로 바로 이동했을 때 섹션이 투명하게 남지 않도록
  window.addEventListener("hashchange", () => {
    const t = document.getElementById(location.hash.slice(1));
    if (t && t.classList.contains("reveal")) t.classList.add("in");
  });

  /* ==========================================================
     시작
     ========================================================== */
  function updateHeroCount() { $("#heroCount").textContent = allPrompts().length; }

  updateHeroCount();
  setView(state.view === "table" ? "table" : "cards");
  renderWizard();
  stageCopy.classList.remove("swap");
})();
