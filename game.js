/* ============================================================
   ROCKET MANAGER — game.js
   Moteur complet du jeu (Vanilla JS, async/await).

   SOMMAIRE
   1.  Utilitaires & helpers
   2.  Règles du jeu (tables de probabilités)
   3.  État global
   4.  Audio
   5.  Routeur d'écrans + HUD
   6.  Animations roulette (horizontale) & slot (verticale)
   7.  PHASE 1 — Draft de la structure
   8.  PHASE 2 — Draft du roster & coach
   9.  PHASE 3 — Preview, cohésion, mental, rôles, tactiques
   10. PHASE 4 — Splits (Winter/Spring) & Mercato
   11. Qualification Worlds (+ LCQ)
   12. PHASE 5 — Worlds : Suisse, Playoffs
   13. Grande Finale BO7 + moteur 2D
   14. Écrans de fin
   15. Initialisation
   ============================================================ */

"use strict";

/* ============================================================
   1. UTILITAIRES
   ============================================================ */
const $  = (sel) => document.querySelector(sel);
const $$ = (sel) => [...document.querySelectorAll(sel)];

const sleep  = (ms) => new Promise((r) => setTimeout(r, ms));
const rand   = (min, max) => Math.random() * (max - min) + min;
const randI  = (min, max) => Math.floor(rand(min, max + 1));
const pick   = (arr) => arr[randI(0, arr.length - 1)];
const clamp  = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const roll   = (pct) => Math.random() * 100 < pct; // pct ∈ [0,100]

const shuffle = (arr) => {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randI(0, i);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Région d'un joueur : champ explicite sinon déduit de la nationalité. */
const regionOf = (p) => p.region || (NAT_INFO[p.nat]?.region ?? "EU");
/** Langue parlée d'un joueur (déduite de la nationalité). */
const langOf = (p) => NAT_INFO[p.nat]?.lang ?? "en";

/** Étoiles ★★★☆☆ pour une note 0–5. */
const stars = (n) =>
  `<span class="stars">${"★".repeat(n)}<span class="off">${"★".repeat(5 - n)}</span></span>`;

/* ============================================================
   2. RÈGLES DU JEU — toutes les tables au même endroit
   ============================================================ */
const RULES = {
  ORG_REROLLS: 3,
  COACH_TRIES: 3, // tirage initial + 2 rerolls

  // Modificateur de GEN selon la cohésion (en %)
  COHESION_GEN_MOD: { 0: -5, 1: -2, 2: 0, 3: 1, 4: 3, 5: 5 },

  // Winrate de base selon le GEN final : un gros potentiel doit payer
  winrateFromGen(gen) {
    if (gen <= 80) return 38;
    if (gen <= 85) return 49;
    if (gen <= 90) return 59;
    if (gen <= 95) return 71;
    return 84;
  },

  // Bonus de winrate selon le mental d'équipe (un bon vestiaire gagne les matchs serrés)
  MENTAL_WR_BONUS: { 0: -4, 1: -2, 2: 0, 3: 2, 4: 4, 5: 6 },

  // Bonus de winrate par Légende : une seule pèse peu, le vrai gain vient du collectif ;
  // 3 Légendes ⇒ winrate plancher de 90 %
  LEGEND_WR_BONUS: { 0: 0, 1: 1, 2: 5, 3: 8 },
  FULL_LEGEND_WR_FLOOR: 90,

  /* Aux Majors, le niveau mondial est un cran au-dessus — mais sans casser le fun. */
  majorPenalty(gen) {
    if (gen >= 95) return 2;
    if (gen >= 90) return 5;
    return 10;
  },

  // En dessous de ce total de points avant un Major, l'équipe n'y est pas qualifiée
  MAJOR_MIN_POINTS: 20,

  // Probabilité de "Mental Boom" au mercato selon le mental d'équipe
  MERCATO_BOOM: { 0: 95, 1: 75, 2: 50, 3: 30, 4: 5, 5: 0 },

  // Boom en finale des Worlds : mental 3 → 75 %, mental 4 → 20 %
  FINAL_BOOM: { 3: 75, 4: 20 },

  // Note "Bubble" : GEN de base ≤ 84
  BUBBLE_MAX: 84,

  // Points par tournoi régional selon le stade atteint (Major = ×2)
  POINTS: { top16: 6, quarts: 8, demies: 12, finale: 15, champion: 18 },

  /* Seuils de qualification DIRECTE aux Worlds, par région.
     En dessous du seuil : passage par le LCQ (jamais d'élimination sèche). */
  QUALI_DIRECT: { EU: 45, NA: 45, OCE: 70, SAM: 70, MENA: 55 },

  FINAL_GAME_DELAY: 2500, // 2,5 s par game de la finale (cahier des charges)
};

const ROLES   = ["Défenseur", "Playmaker", "Disrupteur"];
/* Tactiques : un pur choix de style de jeu. Chaque tactique reçoit un léger
   effet ALÉATOIRE (tiré en début de partie) sur le winrate — sans excès. */
const TACTICS = [
  { id: "def",  name: "Défensive",   desc: "Un bloc compact, des arrêts décisifs et des contres assassins." },
  { id: "free", name: "Freestyle",   desc: "Du spectacle, de l'air dribble et de la créativité offensive." },
  { id: "ball", name: "Ball Chaser", desc: "Tout le monde fonce sur la balle, sans calcul, à fond." },
  { id: "eq",   name: "Équilibrée",  desc: "Une approche posée qui s'appuie sur l'expérience et la lecture du jeu." },
];

/** Tire l'effet caché (léger) de chaque tactique pour la partie : -2 à +4 % de winrate. */
function rollTacticLuck() {
  const luck = {};
  TACTICS.forEach((t) => { luck[t.id] = randI(-2, 4); });
  return luck;
}

/**
 * Bonus de winrate selon la DIVERSITÉ des rôles :
 * 3 rôles différents ⇒ +4, deux identiques + un autre ⇒ +2, 3 identiques ⇒ 0.
 */
function roleDiversityBonus() {
  const distinct = new Set(state.roles.filter(Boolean)).size;
  return [0, 0, 2, 4][distinct] ?? 0;
}

/** Un joueur est « Bubble » s'il a un GEN modeste — une Légende ne l'est jamais. */
const isBubble = (p) => !p.isLegend && p.rating <= RULES.BUBBLE_MAX;

/** Difficulté de la région en étoiles 1–5 (table explicite dans data.js). */
const regionDifficulty = (region) => REGION_DIFFICULTY[region] ?? 3;

/* ============================================================
   3. ÉTAT GLOBAL
   ============================================================ */
const POOL = [
  ...PLAYERS.map((p) => ({ ...p, isLegend: false })),
  ...LEGENDS.map((p) => ({ ...p, isLegend: true, titles: p.titles ?? 1 })),
];

const state = {};

function resetState() {
  Object.assign(state, {
    org: null,
    orgRerolls: RULES.ORG_REROLLS,
    players: [null, null, null],     // 3 slots joueurs
    playerRerolls: 3,                // 3 Rerolls Random au total pour tout le draft
    regionRerolls: [true, true, true], // 1 Reroll Région par slot (région du joueur en place)
    coach: null,
    coachTriesLeft: RULES.COACH_TRIES,
    usedNames: new Set(),            // règle anti-doublon (par NOM, toutes versions)
    roles: [null, null, null],
    tactic: null,
    tacticLuck: rollTacticLuck(),    // effet caché (-2 à +4 %) de chaque tactique, par partie
    points: 0,
    split: "winter",
    finalOpponent: null,
    worldsChampion: false,
  });
}

/* ---------- Calculs dérivés de l'équipe ---------- */

/** Deux joueurs ont un historique commun s'ils ont déjà joué ensemble dans une équipe historique. */
function playedTogether(a, b) {
  return HIST_TEAMS.some((t) => t.roster?.includes(a.name) && t.roster?.includes(b.name));
}

/**
 * Cohésion 0–5, par paire de joueurs, avec priorité :
 *   Pays identique (3) > Langue identique (2) > Région identique (1) > rien (0)
 * + bonus Historique (+1) si la paire a déjà joué ensemble.
 * Score max : 3 paires × 4 = 12, ramené sur 5.
 */
function computeCohesion() {
  const ps = state.players;
  const pairs = [[0, 1], [0, 2], [1, 2]];
  let total = 0;
  for (const [i, j] of pairs) {
    const a = ps[i], b = ps[j];
    if      (a.nat === b.nat)             total += 3; // même pays
    else if (langOf(a) === langOf(b))     total += 2; // même langue
    else if (regionOf(a) === regionOf(b)) total += 1; // même région
    if (playedTogether(a, b))             total += 1; // déjà coéquipiers
  }
  return clamp(Math.round((total * 5) / 12), 0, 5);
}

/** Mental d'équipe 0–5 : (mental des 3 joueurs + bonus/malus coach) / 4, arrondi & bridé. */
function computeMental() {
  const sum = state.players.reduce((s, p) => s + p.mental, 0) + (state.coach?.m_bonus ?? 0);
  return clamp(Math.round(sum / 4), 0, 5);
}

/** GEN final : moyenne des ratings, modifiée par la cohésion, plafonnée à 99. */
function computeGen() {
  const avg = state.players.reduce((s, p) => s + p.rating, 0) / 3;
  const mod = RULES.COHESION_GEN_MOD[computeCohesion()];
  return Math.min(99, Math.round(avg * (1 + mod / 100)));
}

/** Bonus tactique (%) : effet léger ALÉATOIRE de la tactique choisie (tiré pour la partie). */
function computeTacticBonus() {
  if (!state.tactic) return 0;
  return state.tacticLuck[state.tactic] ?? 0;
}

/** Nombre de Légendes au roster. */
const legendCount = () => state.players.filter((p) => p?.isLegend).length;
/** Roster 100 % Légendes : destin doré (finale des Worlds garantie). */
const isFullLegendRoster = () => state.players.every((p) => p?.isLegend);

/**
 * Winrate (%) de l'équipe :
 *   base(GEN) + mental + diversité des rôles + Légendes + effet tactique
 *   + bonus/malus régional (hors Worlds).
 * Un roster de 3 Légendes a un plancher de 90 %.
 * @param {boolean} worlds — aux Worlds, le bonus/malus régional disparaît.
 */
function computeWinrate(worlds = false) {
  const base    = RULES.winrateFromGen(computeGen());
  const mental  = RULES.MENTAL_WR_BONUS[computeMental()] ?? 0;
  const roles   = roleDiversityBonus();
  const legends = RULES.LEGEND_WR_BONUS[legendCount()] ?? 0;
  const tactic  = computeTacticBonus();
  const malus   = worlds ? 0 : REGION_MALUS[state.org.region] ?? 0;
  let wr = base + mental + roles + legends + tactic + malus;
  if (isFullLegendRoster()) wr = Math.max(wr, RULES.FULL_LEGEND_WR_FLOOR);
  return clamp(wr, 1, 99);
}

/* ============================================================
   4. AUDIO
   ============================================================ */
const sfx = {
  /** Son de but : joué puis coupé après 2 secondes. */
  goal() {
    const a = $("#sfxGoal");
    if (!a) return;
    clearTimeout(sfx._goalCut);
    a.currentTime = 0;
    a.play().catch(() => {/* autoplay bloqué : ignoré */});
    sfx._goalCut = setTimeout(() => { a.pause(); a.currentTime = 0; }, 2000);
  },
  _goalCut: null,
  victory: () => playSafe($("#sfxVictory")),
};
function playSafe(audioEl) {
  if (!audioEl) return;
  audioEl.currentTime = 0;
  audioEl.play().catch(() => {/* autoplay bloqué avant interaction : ignoré */});
}

/* ============================================================
   5. ROUTEUR D'ÉCRANS + HUD
   ============================================================ */
function showScreen(id, phaseLabel) {
  $$(".screen").forEach((s) => s.classList.remove("active"));
  $(`#${id}`).classList.add("active");
  if (phaseLabel) $("#phaseIndicator").textContent = phaseLabel;
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function refreshHUD() {
  const hud = $("#hud");
  if (!state.org) { hud.hidden = true; return; }
  hud.hidden = false;
  $("#hudOrg").textContent = state.org.tag;
  const teamReady = state.players.every(Boolean) && state.coach;
  $("#hudGen").textContent    = teamReady ? computeGen() : "—";
  $("#hudCoh").innerHTML      = teamReady ? stars(computeCohesion()) : "—";
  $("#hudMental").innerHTML   = teamReady ? stars(computeMental()) : "—";
  $("#hudWr").textContent     = teamReady && state.tactic ? computeWinrate() + " %" : "—";
}

/* ============================================================
   6. ANIMATIONS ROULETTE & SLOT
   Principe commun : on construit une longue bande d'items,
   l'item gagnant est placé vers la fin, puis on anime un
   translate avec une courbe d'easing qui décélère fortement.
   ============================================================ */

/** Construit une bande d'items variée (cycles mélangés, pas de répétitions en rafale). */
function buildBand(items, length) {
  const band = [];
  while (band.length < length) band.push(...shuffle(items));
  return band.slice(0, length);
}

/** Roulette HORIZONTALE (orgs). Renvoie une promesse résolue à l'arrêt. */
function spinHorizontal(stripEl, viewportEl, items, winner, renderItem) {
  return new Promise((resolve) => {
    const CARD = 150, GAP = 14, PAD = 14;
    const WINNER_INDEX = 46; // position du gagnant dans la bande

    // Bande : items variés, gagnant injecté à WINNER_INDEX
    const band = buildBand(items, WINNER_INDEX + 8);
    band[WINNER_INDEX] = winner;

    stripEl.classList.remove("spinning");
    stripEl.style.transform = "translateX(0)";
    stripEl.innerHTML = "";
    band.forEach((it) => stripEl.appendChild(renderItem(it)));

    // Décalage pour centrer le gagnant sous le marqueur (+ léger offset aléatoire)
    const center = viewportEl.clientWidth / 2;
    const winnerCenter = PAD + WINNER_INDEX * (CARD + GAP) + CARD / 2;
    const jitter = rand(-CARD * 0.25, CARD * 0.25);
    const target = -(winnerCenter - center + jitter);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      stripEl.classList.add("spinning");
      stripEl.style.transform = `translateX(${target}px)`;
    }));
    stripEl.addEventListener("transitionend", () => resolve(), { once: true });
  });
}

/** Machine à sous VERTICALE (joueurs / coach). */
function spinVertical(stripEl, viewportEl, items, winner, renderItem) {
  return new Promise((resolve) => {
    const ROW = 72;
    const WINNER_INDEX = 38;

    const band = buildBand(items, WINNER_INDEX + 5);
    band[WINNER_INDEX] = winner;

    stripEl.classList.remove("spinning");
    stripEl.style.transform = "translateY(0)";
    stripEl.innerHTML = "";
    band.forEach((it) => stripEl.appendChild(renderItem(it)));

    const center = viewportEl.clientHeight / 2;
    const winnerCenter = WINNER_INDEX * ROW + ROW / 2;
    const target = -(winnerCenter - center);

    requestAnimationFrame(() => requestAnimationFrame(() => {
      stripEl.classList.add("spinning");
      stripEl.style.transform = `translateY(${target}px)`;
    }));
    stripEl.addEventListener("transitionend", () => resolve(), { once: true });
  });
}

/* ---------- Renderers d'items ---------- */
function renderOrgItem(org) {
  const el = document.createElement("div");
  el.className = "org-card";
  el.appendChild(orgLogoNode(org, 64));
  const name = document.createElement("div");
  name.className = "org-card-name";
  name.textContent = org.name;
  el.appendChild(name);
  return el;
}

/** Logo d'org avec fallback (badge tag coloré) si l'image manque. */
function orgLogoNode(org, size = 64) {
  const wrap = document.createElement("div");
  const img = document.createElement("img");
  img.src = org.logo;
  img.alt = org.name;
  img.style.width = img.style.height = size + "px";
  img.onerror = () => {
    const tag = document.createElement("div");
    tag.className = "org-card-tag";
    tag.style.width = tag.style.height = size + "px";
    tag.style.background = `linear-gradient(135deg, ${org.color || "#7c5cff"}, #20264a)`;
    tag.textContent = org.tag;
    wrap.replaceChildren(tag);
  };
  wrap.appendChild(img);
  return wrap;
}

function renderPersonItem(p) {
  const el = document.createElement("div");
  el.className = "slot-item";
  const meta = p.rating !== undefined
    ? `${p.rating} GEN · ${p.nat}${p.isLegend ? " · " + p.year : ""}`
    : `Coach · ${p.m_bonus >= 0 ? "+" : ""}${p.m_bonus} mental`;
  el.innerHTML = `<span>${p.name}</span><span class="si-meta">${meta}</span>`;
  return el;
}

/* ============================================================
   7. PHASE 1 — DRAFT DE LA STRUCTURE
   ============================================================ */
function initOrgPhase() {
  showScreen("screen-org", "Phase 1 · Structure");
  $("#btnOrgSpin").hidden = false;
  $("#btnOrgReroll").hidden = true;
  $("#btnOrgAccept").hidden = true;
  $("#orgResult").hidden = true;
  updateOrgRerollUI();
}

function updateOrgRerollUI() {
  $("#orgRerollPill").textContent = state.orgRerolls;
  $("#orgRerollsLabel").textContent =
    state.orgRerolls > 0 ? `${state.orgRerolls} reroll${state.orgRerolls > 1 ? "s" : ""}` : "aucun reroll";
}

async function spinOrg() {
  $("#btnOrgSpin").hidden = true;
  $("#btnOrgReroll").hidden = true;
  $("#btnOrgAccept").hidden = true;
  $("#orgResult").hidden = true;

  const winner = pick(ORGS);
  await spinHorizontal($("#orgStrip"), $("#orgViewport"), ORGS, winner, renderOrgItem);

  state.org = winner;
  // Carte résultat
  const logoBox = $("#orgResultLogo");
  logoBox.replaceChildren(orgLogoNode(winner, 64));
  $("#orgResultName").textContent = winner.name;
  $("#orgResultRegion").textContent = `Région ${winner.region}`;
  $("#orgResult").hidden = false;

  $("#btnOrgAccept").hidden = false;
  if (state.orgRerolls > 0) $("#btnOrgReroll").hidden = false;
  refreshHUD();
}

/* ============================================================
   8. PHASE 2 — DRAFT DU ROSTER & COACH
   ============================================================ */
const SLOT_LABELS = ["Joueur 1", "Joueur 2", "Joueur 3", "Coach"];

function initRosterPhase() {
  showScreen("screen-roster", "Phase 2 · Roster");
  renderRosterGrid();
  $("#rosterActions").innerHTML = "";
  const btn = document.createElement("button");
  btn.className = "btn btn-primary";
  btn.textContent = "Tirer le Joueur 1";
  btn.onclick = () => draftSlot(0, "initial");
  $("#rosterActions").appendChild(btn);
}

/** Pool de joueurs disponibles (anti-doublon par NOM : exclut 2026 + Légende du même joueur). */
function availablePlayers(filterRegion = null) {
  return POOL.filter((p) =>
    !state.usedNames.has(p.name) &&
    (!filterRegion || regionOf(p) === filterRegion)
  );
}

function renderRosterGrid(activeSlot = -1) {
  const grid = $("#rosterGrid");
  grid.innerHTML = "";

  // 3 slots joueurs
  state.players.forEach((p, i) => {
    const card = document.createElement("div");
    card.className = "player-card " + (p ? (p.isLegend ? "filled legend" : "filled") : "empty");
    if (i === activeSlot) card.classList.add("active-slot");

    if (!p) {
      card.textContent = SLOT_LABELS[i] + " — à tirer";
    } else {
      card.innerHTML = `
        <span class="pc-badge ${p.isLegend ? "" : "y2026"}">${p.isLegend ? "Légende " + p.year : "2026"}</span>
        <div class="pc-name">${p.name}</div>
        <div class="pc-meta">${p.nat} · ${regionOf(p)} · Mental ${p.mental}/5${p.titles ? " · 🏆 " + p.titles : ""}</div>
        <div class="pc-rating">${p.rating}</div>
        <div class="pc-rerolls" data-slot="${i}"></div>`;
      // Boutons de reroll : 3 Rerolls Random partagés + 1 Reroll Région par slot
      const zone = card.querySelector(".pc-rerolls");
      if (state.draftingPhase) {
        if (state.playerRerolls > 0) {
          zone.appendChild(makeRerollBtn(`Reroll Random (${state.playerRerolls})`, () => draftSlot(i, "random")));
        }
        if (state.regionRerolls[i]) {
          // Reroll Région : retire uniquement dans la région du joueur actuellement en place
          zone.appendChild(makeRerollBtn(`Reroll ${regionOf(p)}`, () => draftSlot(i, "region")));
        }
      }
    }
    grid.appendChild(card);
  });

  // Slot coach
  const c = state.coach;
  const card = document.createElement("div");
  card.className = "player-card " + (c ? "filled" : "empty");
  card.classList.add("pv-coach");
  if (activeSlot === 3) card.classList.add("active-slot");
  card.innerHTML = c
    ? `<span class="pc-badge">Coach</span>
       <div class="pc-name">${c.name}</div>
       <div class="pc-meta">${c.nat} · Mental ${c.m_bonus >= 0 ? "+" : ""}${c.m_bonus}</div>
       <div class="pc-meta" style="margin-top:auto">${c.desc}</div>`
    : `Coach — à tirer`;
  grid.appendChild(card);
}

function makeRerollBtn(label, onClick) {
  const b = document.createElement("button");
  b.className = "btn btn-ghost btn-sm";
  b.textContent = label;
  b.onclick = onClick;
  return b;
}

/**
 * Tirage d'un slot joueur.
 * @param {number} slot  0–2
 * @param {"initial"|"random"|"region"} mode
 *   - "random" consomme un des 3 Rerolls partagés
 *   - "region" (1× par slot) : nouveau joueur de la MÊME région que celui en place
 */
async function draftSlot(slot, mode) {
  state.draftingPhase = true;

  let pool;
  let regionLabel = null;
  if (mode === "region") {
    if (!state.regionRerolls[slot] || !state.players[slot]) return; // garde-fou
    state.regionRerolls[slot] = false;
    regionLabel = regionOf(state.players[slot]);
    pool = availablePlayers(regionLabel);
    if (pool.length <= 1) pool = availablePlayers(); // garde-fou : région épuisée
  } else {
    if (mode === "random") {
      if (state.playerRerolls <= 0) return; // garde-fou
      state.playerRerolls--;
    }
    pool = availablePlayers();
  }

  // Si on reroll, l'ancien joueur libère son nom
  const old = state.players[slot];
  if (old) {
    state.usedNames.delete(old.name);
    pool = pool.filter((p) => p.name !== old.name); // pas de re-tirage immédiat du même nom
  }

  const winner = pick(pool);

  // Animation slot machine
  $("#rosterActions").innerHTML = "";
  renderRosterGrid(slot);
  const wrap = $("#slotWrap");
  wrap.hidden = false;
  $("#slotTitle").textContent =
    `${SLOT_LABELS[slot]} — ${mode === "region" ? "Reroll Région (" + regionLabel + ")" : mode === "random" ? "Reroll Random" : "Sélection des joueurs"}`;
  await spinVertical($("#slotStrip"), wrap.querySelector(".slot-viewport"), pool, winner, renderPersonItem);
  await sleep(500);
  wrap.hidden = true;

  state.players[slot] = winner;
  state.usedNames.add(winner.name);
  renderRosterGrid();
  refreshHUD();
  renderRosterNextAction();
}

/** Bouton d'action suivant : prochain joueur à tirer, coach, ou validation. */
function renderRosterNextAction() {
  const actions = $("#rosterActions");
  actions.innerHTML = "";

  const nextEmpty = state.players.findIndex((p) => p === null);
  if (nextEmpty !== -1) {
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.textContent = `Tirer le ${SLOT_LABELS[nextEmpty]}`;
    b.onclick = () => draftSlot(nextEmpty, "initial");
    actions.appendChild(b);
    return;
  }

  if (!state.coach) {
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.textContent = `Tirer le Coach (${state.coachTriesLeft} essai${state.coachTriesLeft > 1 ? "s" : ""})`;
    b.onclick = draftCoach;
    actions.appendChild(b);
    return;
  }

  // Coach présent : reroll possible tant qu'il reste des essais
  if (state.coachTriesLeft > 0) {
    const b = document.createElement("button");
    b.className = "btn btn-ghost";
    b.innerHTML = `Reroll Coach <span class="pill">${state.coachTriesLeft}</span>`;
    b.onclick = draftCoach;
    actions.appendChild(b);
  }
  const ok = document.createElement("button");
  ok.className = "btn btn-gold";
  ok.textContent = "Valider l'équipe →";
  ok.onclick = () => { state.draftingPhase = false; initPreviewPhase(); };
  actions.appendChild(ok);
}

async function draftCoach() {
  state.coachTriesLeft--;
  const pool = COACHES.filter((c) => c.name !== state.coach?.name);
  const winner = pick(pool);

  $("#rosterActions").innerHTML = "";
  renderRosterGrid(3);
  const wrap = $("#slotWrap");
  wrap.hidden = false;
  $("#slotTitle").textContent = "Tirage du Coach";
  await spinVertical($("#slotStrip"), wrap.querySelector(".slot-viewport"), COACHES, winner, renderPersonItem);
  await sleep(500);
  wrap.hidden = true;

  state.coach = winner;
  renderRosterGrid();
  refreshHUD();
  renderRosterNextAction();
}

/* ============================================================
   9. PHASE 3 — PREVIEW & TACTIQUES
   ============================================================ */
function initPreviewPhase(continueLabel = "Lancer le Winter Split", onContinue = startWinterSplit) {
  showScreen("screen-preview", "Phase 3 · Tactiques");

  // Rôles par défaut
  state.roles = state.roles.map((r) => r ?? "Défenseur");

  // ----- Colonne équipe -----
  const team = $("#previewTeam");
  team.innerHTML = `<h3 class="card-title">${state.org.name} — ${state.org.region}</h3>`;

  state.players.forEach((p, i) => {
    const row = document.createElement("div");
    row.className = "pv-player";
    row.innerHTML = `
      <div class="pc-rating">${p.rating}</div>
      <div class="pv-player-info">
        <div class="pc-name">${p.name} ${p.isLegend ? '<span class="pc-badge">Légende ' + p.year + "</span>" : ""}</div>
        <div class="pc-meta">${langOf(p).toUpperCase()} · ${regionOf(p)} · Mental ${p.mental}/5${isBubble(p) ? " · Bubble" : ""}</div>
      </div>`;
    const sel = document.createElement("select");
    sel.className = "role-select";
    ROLES.forEach((r) => {
      const o = document.createElement("option");
      o.value = o.textContent = r;
      if (state.roles[i] === r) o.selected = true;
      sel.appendChild(o);
    });
    sel.onchange = () => { state.roles[i] = sel.value; refreshPreviewStats(); };
    row.appendChild(sel);
    team.appendChild(row);
  });

  const coachRow = document.createElement("div");
  coachRow.className = "pv-player pv-coach";
  coachRow.innerHTML = `
    <div class="pc-rating" style="color:var(--violet)">${state.coach.m_bonus >= 0 ? "+" : ""}${state.coach.m_bonus}</div>
    <div class="pv-player-info">
      <div class="pc-name">${state.coach.name} <span class="pc-badge">Coach</span></div>
      <div class="pc-meta">${state.coach.desc}</div>
    </div>`;
  team.appendChild(coachRow);

  // ----- Tactiques -----
  const list = $("#tacticList");
  list.innerHTML = "";
  TACTICS.forEach((t) => {
    const btn = document.createElement("button");
    btn.className = "tactic-option" + (state.tactic === t.id ? " selected" : "");
    btn.dataset.tactic = t.id;
    btn.innerHTML = `<div class="t-name">${t.name}</div><div class="t-desc">${t.desc}</div>`;
    btn.onclick = () => {
      state.tactic = t.id;
      $$(".tactic-option").forEach((b) => b.classList.remove("selected"));
      btn.classList.add("selected");
      refreshPreviewStats();
    };
    list.appendChild(btn);
  });
  if (!state.tactic) state.tactic = "def";
  [...list.children].find((b) => b.dataset.tactic === state.tactic)?.classList.add("selected");

  const next = $("#btnPreviewNext");
  next.textContent = continueLabel;
  next.onclick = onContinue;

  refreshPreviewStats();
}

function refreshPreviewStats() {
  const coh = computeCohesion(), mental = computeMental(), gen = computeGen();
  $("#pvGen").textContent = gen;
  $("#pvCohesion").innerHTML = stars(coh);
  $("#pvMental").innerHTML = stars(mental);
  $("#pvRegionDiff").innerHTML = stars(regionDifficulty(state.org.region));
  $("#pvWinrate").textContent = computeWinrate() + " %";
  refreshHUD();
}

/* ============================================================
   10. PHASE 4 — SPLITS & MERCATO
   ============================================================ */
function startWinterSplit() { state.split = "winter"; runSplit("Winter Split", onWinterDone); }
function startSpringSplit() { state.split = "spring"; runSplit("Spring Split", onSpringDone); }

/**
 * Simule un split : 3 tournois régionaux + 1 Major.
 * Chaque tournoi = 4 rounds (Top 16 → Finale), un jet de winrate par round.
 * Affichage séquentiel avec suspense.
 */
async function runSplit(title, onDone) {
  showScreen("screen-season", `Phase 4 · ${title}`);
  $("#seasonTitle").textContent = title;
  $("#seasonPoints").textContent = state.points;
  $("#btnSeasonNext").hidden = true;

  const grid = $("#seasonGrid");
  grid.innerHTML = "";

  const tournaments = [
    { name: "Régional 1", major: false },
    { name: "Régional 2", major: false },
    { name: "Régional 3", major: false },
    { name: "MAJOR",      major: true  },
  ];
  const wr = computeWinrate(false);
  // Le Major réunit l'élite mondiale : winrate réduit, sauf pour les équipes vraiment fortes
  const wrMajor = clamp(wr - RULES.majorPenalty(computeGen()), 1, 99);

  for (const t of tournaments) {
    // Règle Major : moins de 20 points avant le Major ⇒ non qualifié
    if (t.major && state.points < RULES.MAJOR_MIN_POINTS) {
      const card = document.createElement("div");
      card.className = "card tournament-card major done";
      card.innerHTML = `<div class="t-tag">${title} · ×2 points</div><h3>${t.name}</h3>
                        <div class="t-final-result"><span class="red">Non qualifié</span>
                        <span class="pc-meta">Pas assez de points pour décrocher sa place au Major.</span></div>`;
      grid.appendChild(card);
      await sleep(900);
      continue;
    }

    const card = document.createElement("div");
    card.className = "card tournament-card" + (t.major ? " major" : "");
    card.innerHTML = `<div class="t-tag">${title}${t.major ? " · ×2 points" : ""}</div>
                      <h3>${t.name}</h3><div class="round-list"></div>`;
    grid.appendChild(card);
    card.classList.add("live");
    await sleep(600);

    const rounds = [
      { label: "Top 16",       lossPts: RULES.POINTS.top16 },
      { label: "Quarts",       lossPts: RULES.POINTS.quarts },
      { label: "Demi-finales", lossPts: RULES.POINTS.demies },
      { label: "Finale",       lossPts: RULES.POINTS.finale },
    ];
    const list = card.querySelector(".round-list");
    let earned = 0, champion = true;

    for (const r of rounds) {
      await sleep(850); // suspense
      const win = roll(t.major ? wrMajor : wr);
      const line = document.createElement("div");
      line.className = "round-line";
      line.innerHTML = `<span>${r.label}</span><span class="${win ? "green" : "red"}">${win ? "VICTOIRE" : "DÉFAITE"}</span>`;
      list.appendChild(line);
      if (!win) { earned = r.lossPts; champion = false; break; }
    }
    if (champion) earned = RULES.POINTS.champion;
    if (t.major) earned *= 2;

    state.points += earned;
    const res = document.createElement("div");
    res.className = "t-final-result";
    res.innerHTML = champion
      ? `<span>🏆 CHAMPION !</span> <span class="t-points">+ ${earned} pts</span>`
      : `<span>Éliminé</span> <span class="t-points">+ ${earned} pts</span>`;
    card.appendChild(res);
    card.classList.remove("live");
    card.classList.add("done");
    $("#seasonPoints").textContent = state.points;
    await sleep(500);
  }

  const next = $("#btnSeasonNext");
  next.hidden = false;
  next.onclick = onDone;
}

function onWinterDone() { initMercato(); }
function onSpringDone() { initQuali(); }

/* ---------- MERCATO (entre Winter et Spring) ---------- */
async function initMercato() {
  showScreen("screen-mercato", "Mercato");
  const mental = computeMental();
  const boomChance = RULES.MERCATO_BOOM[mental];
  const actions = $("#mercatoActions");
  actions.innerHTML = "";

  $("#mercatoText").innerHTML =
    `Mental d'équipe : ${stars(mental)}<br>Le vestiaire retient son souffle…`;
  await sleep(1800);

  if (roll(boomChance)) {
    // BOOM : un joueur force son départ → reroll obligatoire de ce slot
    const slot = randI(0, 2);
    const leaver = state.players[slot];
    $("#mercatoText").innerHTML =
      `💥 <strong>MENTAL BOOM !</strong><br><strong>${leaver.name}</strong> force son départ de ${state.org.name}.<br>Vous devez le remplacer immédiatement (tirage aléatoire).`;
    const b = document.createElement("button");
    b.className = "btn btn-primary";
    b.textContent = `Remplacer ${leaver.name}`;
    b.onclick = () => mercatoReplace(slot);
    actions.appendChild(b);
  } else {
    $("#mercatoText").innerHTML =
      `✅ Le vestiaire tient bon, aucun départ forcé.<br>Vous pouvez <strong>garder votre équipe</strong>… ou tenter un changement risqué (le nouveau joueur devra être accepté).`;
    const keep = document.createElement("button");
    keep.className = "btn btn-gold";
    keep.textContent = "Garder l'équipe";
    keep.onclick = () => initPreviewPhase("Lancer le Spring Split", startSpringSplit);
    actions.appendChild(keep);

    state.players.forEach((p, i) => {
      const b = document.createElement("button");
      b.className = "btn btn-ghost";
      b.textContent = `Remplacer ${p.name} 🎲`;
      b.onclick = () => mercatoReplace(i);
      actions.appendChild(b);
    });
  }
}

/** Remplacement mercato : animation slot + retour preview pour ré-assigner rôle/tactique. */
async function mercatoReplace(slot) {
  showScreen("screen-roster", "Mercato · Remplacement");
  $("#rosterSub").textContent = "Sélection des joueurs";
  state.draftingPhase = false; // pas de boutons reroll de draft au mercato

  const old = state.players[slot];
  state.usedNames.delete(old.name);
  const pool = availablePlayers().filter((p) => p.name !== old.name);
  const winner = pick(pool);

  renderRosterGrid(slot);
  $("#rosterActions").innerHTML = "";
  const wrap = $("#slotWrap");
  wrap.hidden = false;
  $("#slotTitle").textContent = `Remplaçant de ${old.name}`;
  await spinVertical($("#slotStrip"), wrap.querySelector(".slot-viewport"), pool, winner, renderPersonItem);
  await sleep(500);
  wrap.hidden = true;

  state.players[slot] = winner;
  state.usedNames.add(winner.name);
  state.roles[slot] = null; // le rôle du nouveau venu sera ré-assigné
  renderRosterGrid();
  refreshHUD();

  const b = document.createElement("button");
  b.className = "btn btn-gold";
  b.textContent = "Ajuster les tactiques →";
  b.onclick = () => initPreviewPhase("Lancer le Spring Split", startSpringSplit);
  $("#rosterActions").appendChild(b);
}

/* ============================================================
   11. QUALIFICATION AUX WORLDS (+ LCQ)
   ============================================================ */
async function initQuali() {
  showScreen("screen-quali", "Qualification Worlds");
  const pts = state.points;
  $("#qualiPoints").textContent = pts;

  const verdict = $("#qualiVerdict");
  const actions = $("#qualiActions");
  actions.innerHTML = "";
  verdict.textContent = "…";
  await sleep(1400);

  // Seuil de qualification directe propre à la région ; en dessous : LCQ (toujours jouable)
  const threshold = RULES.QUALI_DIRECT[state.org.region] ?? 45;
  if (pts >= threshold) {
    verdict.innerHTML = `<span class="green">✅ QUALIFICATION DIRECTE AUX WORLDS !</span>`;
    addBtn(actions, "btn-gold", "Direction les Worlds →", startWorlds);
  } else {
    verdict.innerHTML = `<span class="gold">⚠️ Passage par le LCQ — gagnez 2 matchs sur 3 !</span>`;
    addBtn(actions, "btn-primary", "Jouer le LCQ", playLCQ);
  }
}

function addBtn(parent, cls, label, onClick) {
  const b = document.createElement("button");
  b.className = "btn " + cls;
  b.textContent = label;
  b.onclick = onClick;
  parent.appendChild(b);
  return b;
}

/** LCQ : 3 matchs (sans malus régional, format mondial), 2 victoires requises. */
async function playLCQ() {
  const verdict = $("#qualiVerdict");
  const actions = $("#qualiActions");
  actions.innerHTML = "";
  const wr = computeWinrate(true);
  let w = 0, l = 0;

  for (let i = 1; i <= 3 && w < 2 && l < 2; i++) {
    verdict.innerHTML = `LCQ — Match ${i}…`;
    await sleep(1300);
    roll(wr) ? w++ : l++;
    verdict.innerHTML = `LCQ — <span class="green">${w} V</span> / <span class="red">${l} D</span>`;
    await sleep(900);
  }

  if (w >= 2) {
    verdict.innerHTML = `<span class="green">✅ LCQ remporté ! Les Worlds vous attendent.</span>`;
    addBtn(actions, "btn-gold", "Direction les Worlds →", startWorlds);
  } else {
    verdict.innerHTML = `<span class="red">❌ Éliminé au LCQ.</span>`;
    addBtn(actions, "btn-primary", "Voir le bilan", () => endGame(false, "Si proche… le LCQ aura eu raison de votre équipe."));
  }
}

/* ============================================================
   12. PHASE 5 — WORLDS : PHASE SUISSE & PLAYOFFS
   ============================================================ */

/**
 * Une équipe historique est en conflit si son roster contient un joueur
 * portant le MÊME NOM qu'un joueur de votre équipe, quelle que soit l'année
 * (ex. : M0nkey M00n 2026 ou 2022 ne peut pas affronter Team BDS 2022).
 */
function rosterConflict(team) {
  return team.roster?.some((n) => state.players.some((p) => p?.name === n)) ?? false;
}

/** Tire N adversaires historiques distincts, sans conflit de joueur avec votre roster. */
function drawOpponents(n, exclude = new Set()) {
  let pool = HIST_TEAMS.filter((t) => !exclude.has(t.name) && !rosterConflict(t));
  // Garde-fou : si le filtre vide le pool (roster très chargé), on relâche la contrainte
  if (pool.length < n) pool = HIST_TEAMS.filter((t) => !exclude.has(t.name));
  return shuffle(pool).slice(0, n);
}

/** Probabilité de victoire contre une équipe historique (Worlds : sans malus régional). */
function matchWinChance(opp) {
  if (opp.unbeatable) return 0; // Team BDS 2022 / 2024 : invincibles
  const wr = computeWinrate(true);
  // Léger ajustement par l'écart de niveau (plancher relevé : jamais désespéré)
  return clamp(wr + (computeGen() - opp.rating) * 1.5, 15, 97);
}

async function startWorlds() {
  showScreen("screen-worlds", "Phase 5 · Worlds");
  $("#worldsStageTitle").textContent = "Phase Suisse";
  $("#worldsSub").textContent = "3 victoires = qualifié, 3 défaites = éliminé.";
  $("#worldsMatches").innerHTML = "";
  $("#btnWorldsNext").hidden = true;
  $("#swissRecord").hidden = false;
  // Le compteur du round suisse démarre TOUJOURS à 0-0
  $("#swissW").textContent = "0";
  $("#swissL").textContent = "0";
  await sleep(600);

  const mental = computeMental();

  /* Règles spéciales de mental sur la phase suisse :
     - roster 3 Légendes : destin doré, qualification garantie
     - mental 0 : ne peut JAMAIS passer → 0-3 ou 1-3 max
     - mental 1 : finit TOUJOURS 2-3
     - sinon : simulation honnête au winrate */
  const goldenDestiny = isFullLegendRoster();
  let forcedWins = null;
  if (!goldenDestiny && mental === 0) forcedWins = randI(0, 1);
  if (!goldenDestiny && mental === 1) forcedWins = 2;

  let w = 0, l = 0;
  const faced = new Set();

  while (w < 3 && l < 3) {
    const opp = drawOpponents(1, faced)[0]
      ?? pick(HIST_TEAMS.filter((t) => !rosterConflict(t))) ?? pick(HIST_TEAMS);
    faced.add(opp.name);
    await sleep(1100);

    let win;
    if (goldenDestiny) {
      // Trois Légendes sur le terrain : la phase suisse est une formalité
      win = true;
    } else if (forcedWins !== null) {
      // Script du destin : exactement `forcedWins` victoires avant la 3e défaite
      const remainingW = forcedWins - w, remainingL = 3 - l;
      win = remainingW > 0 && (remainingL <= remainingW ? true : roll(50));
      if (remainingW <= 0) win = false;
    } else {
      win = roll(matchWinChance(opp));
    }

    win ? w++ : l++;
    addMatchLine($("#worldsMatches"), opp.name, win);
    $("#swissW").textContent = w;
    $("#swissL").textContent = l;
  }

  await sleep(800);
  const next = $("#btnWorldsNext");
  next.hidden = false;
  if (w >= 3) {
    next.textContent = "Qualifié en Playoffs →";
    next.onclick = startPlayoffs;
  } else {
    next.textContent = "Voir le bilan";
    next.onclick = () => endGame(false, `Éliminé en phase suisse (${w}-${l}). ${mental <= 1 ? "Le mental a lâché au pire moment." : "Les Worlds ne pardonnent pas."}`);
  }
}

function addMatchLine(container, oppName, win, label = null) {
  const line = document.createElement("div");
  line.className = "match-line " + (win ? "win" : "loss");
  line.innerHTML = `<span class="opp">${label ? label + " · " : ""}vs ${oppName}</span>
                    <span class="res ${win ? "green" : "red"}">${win ? "VICTOIRE" : "DÉFAITE"}</span>`;
  container.appendChild(line);
}

/** Playoffs : Quarts → Demies → Grande Finale. Mental ≤ 2 ⇒ bloqué aux portes des demies. */
async function startPlayoffs() {
  $("#worldsStageTitle").textContent = "Playoffs";
  $("#worldsSub").textContent = "Arbre final : Quarts, Demi-finales, Grande Finale.";
  $("#worldsMatches").innerHTML = "";
  $("#swissRecord").hidden = true;
  $("#btnWorldsNext").hidden = true;

  const mental = computeMental();
  const goldenDestiny = isFullLegendRoster(); // 3 Légendes ⇒ finale des Worlds garantie
  const faced = new Set();
  const stages = [
    { label: "Quart de finale" },
    { label: "Demi-finale" },
  ];

  for (const [i, stage] of stages.entries()) {
    const opp = drawOpponents(1, faced)[0];
    faced.add(opp.name);
    await sleep(1400);

    // 3 Légendes : victoire assurée jusqu'à la finale.
    // Sinon, mental ≤ 2 : l'équipe craque en quarts, aux portes des demies.
    const win = goldenDestiny
      ? true
      : (i === 0 && mental <= 2) ? false : roll(matchWinChance(opp));
    addMatchLine($("#worldsMatches"), opp.name, win, stage.label);

    if (!win) {
      await sleep(700);
      const next = $("#btnWorldsNext");
      next.hidden = false;
      next.textContent = "Voir le bilan";
      const msg = (i === 0 && mental <= 2)
        ? "Le mental fragile de l'équipe l'a bloquée aux portes des demi-finales."
        : `Battu en ${stage.label.toLowerCase()} par ${opp.name}.`;
      next.onclick = () => endGame(false, msg);
      return;
    }
  }

  // Finale : adversaire tiré parmi les équipes restantes (BDS possible…)
  state.finalOpponent = drawOpponents(1, faced)[0];
  await sleep(900);
  const next = $("#btnWorldsNext");
  next.hidden = false;
  next.textContent = `GRANDE FINALE vs ${state.finalOpponent.name} →`;
  next.onclick = startFinal;
}

/* ============================================================
   13. GRANDE FINALE — BO7 + MOTEUR 2D
   ============================================================ */
const engine = {
  raf: null,
  ball: { x: 50, y: 50, vx: 0.5, vy: 0.4 },
  cars: [{ x: 50, y: 80 }, { x: 50, y: 20 }],
};

/** Boucle d'animation : balle qui rebondit + voitures qui chassent la balle. */
function engineStart() {
  const ballEl = $("#ball"), car1El = $("#car1"), car2El = $("#car2");
  const b = engine.ball;
  b.x = 50; b.y = 50;
  b.vx = rand(-0.7, 0.7); b.vy = rand(-0.7, 0.7) || 0.5;
  engine.cars[0] = { x: 50, y: 82 };
  engine.cars[1] = { x: 50, y: 18 };
  let t = 0;

  const frame = () => {
    t++;
    // Balle : déplacement + rebonds sur les bords du terrain (en %)
    b.x += b.vx; b.y += b.vy;
    if (b.x < 8 || b.x > 92) { b.vx *= -1; b.x = clamp(b.x, 8, 92); }
    if (b.y < 6 || b.y > 94) { b.vy *= -1; b.y = clamp(b.y, 6, 94); }

    // Voitures : poursuite de la balle avec inertie + zigzag
    engine.cars.forEach((c, i) => {
      const wobble = Math.sin(t / 14 + i * 3) * 4;
      c.x += (b.x - c.x) * 0.045 + wobble * 0.04;
      c.y += (b.y - c.y) * 0.045;
      // "Frappe" : si une voiture touche la balle, impulsion aléatoire
      if (Math.hypot(c.x - b.x, c.y - b.y) < 7) {
        b.vx = rand(-1.1, 1.1);
        b.vy = rand(-1.1, 1.1) || 0.6;
      }
    });

    placeOnPitch(ballEl, b.x, b.y);
    placeOnPitch(car1El, engine.cars[0].x, engine.cars[0].y, b);
    placeOnPitch(car2El, engine.cars[1].x, engine.cars[1].y, b);
    engine.raf = requestAnimationFrame(frame);
  };
  engine.raf = requestAnimationFrame(frame);
}

function engineStop() {
  cancelAnimationFrame(engine.raf);
  engine.raf = null;
}

/** Positionne un élément en % sur le terrain (et oriente les voitures vers la balle). */
function placeOnPitch(el, x, y, lookAt = null) {
  let rot = "";
  if (lookAt) {
    const ang = Math.atan2(lookAt.y - y, lookAt.x - x) * 180 / Math.PI + 90;
    rot = ` rotate(${ang}deg)`;
  }
  el.style.left = x + "%";
  el.style.top = y + "%";
  el.style.transform = `translate(-50%, -50%)${rot}`;
}

/** Animation de but : la balle file vers la cage (haut = on marque, bas = on encaisse). */
async function animateGoal(weScored) {
  engineStop();
  const b = engine.ball;
  const targetY = weScored ? 3 : 97; // cage orange en haut, bleue en bas (field.png)
  const targetX = 50;
  const steps = 18;
  const ballEl = $("#ball");
  for (let i = 1; i <= steps; i++) {
    b.x += (targetX - b.x) / (steps - i + 2);
    b.y += (targetY - b.y) / (steps - i + 2);
    placeOnPitch(ballEl, b.x, b.y);
    await sleep(16);
  }
}

/* ---------- Horloge de game (style Rocket League : 5:00 décompté, accéléré) ----------
   Le temps file en accéléré pendant la game et atteint TOUJOURS 0:00 à la fin
   (drainToZero est appelé au coup de sifflet final). Si le 0 est atteint en cours
   de jeu, on bascule en PROLONGATION jusqu'à la fin de la game. */
const gameClock = {
  id: null,
  t: 300, // secondes de jeu restantes

  start() {
    this.stop();
    this.t = 300;
    this.render();
    // Temps accéléré : ~1,8 s de jeu toutes les 100 ms réelles
    this.id = setInterval(() => {
      this.t = Math.max(0, this.t - 1.8);
      this.render();
    }, 100);
  },

  stop() {
    clearInterval(this.id);
    this.id = null;
  },

  /** Fin de game : vide rapidement le temps restant jusqu'à 0:00. */
  async drainToZero() {
    this.stop();
    while (this.t > 0) {
      this.t = Math.max(0, this.t - 12);
      this.render(true); // pas d'affichage PROLONGATION pendant le drain
      await sleep(40);
    }
    this.render(true);
  },

  render(draining = false) {
    const el = $("#gameTimer");
    if (!el) return;
    if (this.t <= 0 && !draining) {
      el.textContent = "PROLONGATION";
      el.classList.add("overtime");
    } else {
      const total = Math.ceil(this.t);
      const m = Math.floor(total / 60), s = total % 60;
      el.textContent = `${m}:${String(s).padStart(2, "0")}`;
      el.classList.remove("overtime");
    }
  },
};

/** Met à jour le score de la game en cours sous le terrain. */
function renderGameScore(us, them, oppName) {
  $("#gameScore").textContent = `${state.org.tag} ${us} – ${them} ${oppName}`;
}

async function startFinal() {
  showScreen("screen-final", "GRANDE FINALE");
  const opp = state.finalOpponent;
  $("#finalUsName").textContent = state.org.name;
  $("#finalThemName").textContent = opp.name;
  $("#finalUsScore").textContent = "0";
  $("#finalThemScore").textContent = "0";
  $("#finalLog").innerHTML = "";
  $("#finalActions").innerHTML = "";
  $("#gameTimer").textContent = "5:00";
  renderGameScore(0, 0, opp.name);

  /* Règle de Boom en finale : mental 3 ⇒ 75 % de craquage, mental 4 ⇒ 20 %.
     Si l'équipe craque, son winrate en finale s'effondre. */
  const mental = computeMental();
  const boomChance = RULES.FINAL_BOOM[mental] ?? 0;
  const cracked = roll(boomChance);

  let pWin = matchWinChance(opp); // 0 si BDS 2022/2024 (invincibles)
  if (cracked && !opp.unbeatable) pWin = clamp(pWin * 0.4, 5, 100);

  logFinal(`Coup d'envoi du BO7 face à ${opp.name} !`);
  if (cracked) { await sleep(900); logFinal("😰 La pression est immense… l'équipe semble tendue."); }
  if (opp.unbeatable) { await sleep(900); logFinal("⚫ Face à cette équipe, l'histoire est déjà écrite…"); }

  let us = 0, them = 0, game = 0;
  let timeoutUsed = false; // un SEUL timeout autorisé sur toute la finale

  while (us < 4 && them < 4) {
    game++;
    const r = await playFinalGame(game, opp, pWin);
    r.weWin ? us++ : them++;
    $("#finalUsScore").textContent = us;
    $("#finalThemScore").textContent = them;
    logFinal(`${r.weWin ? "✅" : "❌"} Game ${game} : ${state.org.tag} ${r.usGoals}–${r.themGoals} ${opp.name}`);
    logFinal(`   Buteurs : ${r.scorers.join(", ")}`);
    await sleep(700);

    // ---- Pause entre les games (timeout possible UNE seule fois) ----
    if (us < 4 && them < 4) {
      const out = await timeoutBreak(pWin, opp, timeoutUsed);
      pWin = out.pWin;
      if (out.usedTimeout) timeoutUsed = true;
    }
  }

  engineStop();
  await sleep(1000);

  if (us >= 4) {
    state.worldsChampion = true;
    endGame(true, `${state.org.name} remporte les Worlds ${cracked ? "malgré la pression " : ""}4–${them} face à ${opp.name} !`);
  } else {
    const msg = opp.unbeatable
      ? `Personne ne bat ${opp.name}. Personne. Défaite ${us}–4.`
      : cracked
        ? `L'équipe a craqué sous la pression de la grande finale. Défaite ${us}–4 face à ${opp.name}.`
        : `Défaite ${us}–4 en grande finale face à ${opp.name}. Si proche du sommet…`;
    endGame(false, msg);
  }
}

/**
 * Joue UNE game du BO7 : plusieurs buts animés (sans son), chacun avec son buteur.
 * Le vainqueur de la game est décidé par pWin ; le score est généré pour coller au résultat.
 * @returns {{weWin:boolean, usGoals:number, themGoals:number, scorers:string[]}}
 */
async function playFinalGame(gameNo, opp, pWin) {
  logFinal(`— Game ${gameNo} —`);

  // Bannière "GAME N" sur le terrain
  const gb = $("#gameBanner");
  gb.textContent = `GAME ${gameNo}`;
  gb.hidden = false;
  gb.classList.remove("show");
  void gb.offsetWidth;
  gb.classList.add("show");
  await sleep(1400);
  gb.hidden = true;

  const weWin = roll(pWin);
  // Score réaliste : le vainqueur marque 1–4 buts, le perdant strictement moins
  const winGoals  = randI(1, 4);
  const loseGoals = randI(0, winGoals - 1);
  const usGoals   = weWin ? winGoals : loseGoals;
  const themGoals = weWin ? loseGoals : winGoals;

  // Séquence des buts mélangée (true = on marque, false = on encaisse)
  const sequence = shuffle([
    ...Array(usGoals).fill(true),
    ...Array(themGoals).fill(false),
  ]);

  const scorers = [];
  let liveUs = 0, liveThem = 0;
  renderGameScore(0, 0, opp.name);
  gameClock.start();
  engineStart();
  await sleep(RULES.FINAL_GAME_DELAY); // phase de jeu avant le premier but

  for (const ourGoal of sequence) {
    await animateGoal(ourGoal); // la balle file vers la cage

    // Son de but (coupé après 2 s) + flash + secousse du terrain
    sfx.goal();
    const pitch = $("#pitch");
    $("#goalFlash").classList.remove("on");
    pitch.classList.remove("shake");
    void $("#goalFlash").offsetWidth; // reflow pour relancer les animations
    $("#goalFlash").classList.add("on");
    pitch.classList.add("shake");

    // Buteur tiré dans l'équipe qui marque
    const scorer = ourGoal ? pick(state.players).name : pick(opp.roster ?? [opp.name]);
    scorers.push(`${scorer} (${ourGoal ? state.org.tag : opp.name})`);
    ourGoal ? liveUs++ : liveThem++;
    renderGameScore(liveUs, liveThem, opp.name);
    const banner = $("#scorerBanner");
    $("#scorerLabel").textContent = `GAME ${gameNo}`;
    $("#scorerName").textContent = `${scorer} · ${ourGoal ? state.org.tag : opp.name} — ${liveUs}-${liveThem}`;
    banner.hidden = false;
    pulseScore(ourGoal);
    await sleep(1300);
    banner.hidden = true;

    // Remise en jeu : le moteur repart pour le but suivant
    engineStart();
    await sleep(rand(1200, 2200));
  }

  await gameClock.drainToZero(); // le timer atteint toujours 0:00 à la fin de la game
  engineStop();
  return { weWin, usGoals, themGoals, scorers };
}

/** Fait pulser le panneau de score du camp qui vient de marquer. */
function pulseScore(weScored) {
  const el = $(weScored ? "#finalUsScore" : "#finalThemScore");
  el.classList.remove("pulse");
  void el.offsetWidth;
  el.classList.add("pulse");
}

/**
 * Pause entre deux games : TIMEOUT (une seule fois par finale) ou CONTINUER.
 * - Motiver l'équipe        → petit bonus de winrate
 * - Réprimander l'équipe    → effondrement mental… sauf si des Légendes encaissent
 *                             la critique (petit bonus à la place)
 * - Trashtalk l'adversaire  → aucun effet sur le match
 * @returns {Promise<{pWin:number, usedTimeout:boolean}>}
 */
function timeoutBreak(pWin, opp, timeoutUsed) {
  return new Promise((resolve) => {
    const actions = $("#finalActions");
    actions.innerHTML = "";

    const done = (newPWin, usedTimeout = false) => {
      actions.innerHTML = "";
      resolve({ pWin: clamp(newPWin, 1, 99), usedTimeout });
    };

    if (!timeoutUsed) {
      addBtn(actions, "btn-primary", "⏸ TIMEOUT", () => {
        actions.innerHTML = "";

        addBtn(actions, "btn-gold", "💪 Motiver l'équipe", () => {
          logFinal("📣 Timeout — le coach motive ses joueurs, le banc s'enflamme !");
          done(opp.unbeatable ? pWin : pWin + 5, true);
        });

        addBtn(actions, "btn-ghost", "😡 Réprimander l'équipe", () => {
          const hasLegend = state.players.some((p) => p.isLegend);
          if (hasLegend) {
            logFinal("🧊 Timeout — la critique est dure, mais les Légendes en ont vu d'autres. L'équipe se resserre.");
            done(opp.unbeatable ? pWin : pWin + 3, true);
          } else {
            logFinal("💔 Timeout — la soufflante de trop… le vestiaire s'effondre mentalement.");
            done(Math.max(pWin * 0.5, 2), true);
          }
        });

        addBtn(actions, "btn-ghost", "🗣 Trashtalk l'équipe adverse", () => {
          logFinal(`🗣 Timeout — vous chambrez ${opp.name}. Ils n'ont même pas levé les yeux. Aucun effet.`);
          done(pWin, true);
        });
      });
    }

    addBtn(actions, "btn-gold", "▶ CONTINUER LE MATCH", () => done(pWin, false));
  });
}

function logFinal(text) {
  const log = $("#finalLog");
  const div = document.createElement("div");
  div.textContent = text;
  log.prepend(div);
}

/* ============================================================
   14. ÉCRANS DE FIN
   ============================================================ */
function endGame(victory, message) {
  showScreen("screen-end", victory ? "CHAMPIONS DU MONDE" : "Fin de saison");
  $("#trophyScene").hidden = !victory;
  $("#goatText").hidden = true;
  $("#endTitle").textContent = victory ? "🏆 CHAMPIONS DU MONDE !" : "Fin de la saison";
  $("#endTitle").className = "end-title " + (victory ? "gold" : "");
  $("#endText").textContent = message;

  if (victory) {
    sfx.victory();
    spawnConfetti();
    // Easter egg : M0nkey M00n dans l'équipe championne
    if (state.players.some((p) => p.name === "M0nkey M00n")) {
      $("#goatText").hidden = false;
    }
  }
}

/** Génère ~130 confettis dorés/violets/bleus en CSS. */
function spawnConfetti() {
  const box = $("#confetti");
  box.innerHTML = "";
  const colors = ["#f5c24b", "#7c5cff", "#2ea8ff", "#ffffff"];
  for (let i = 0; i < 130; i++) {
    const c = document.createElement("i");
    c.style.left = rand(0, 100) + "%";
    c.style.background = pick(colors);
    c.style.animationDuration = rand(2.2, 4.5) + "s";
    c.style.animationDelay = rand(0, 3) + "s";
    c.style.transform = `scale(${rand(0.6, 1.3)})`;
    box.appendChild(c);
  }
}

/* ============================================================
   15. INITIALISATION & LISTENERS
   ============================================================ */
function bindEvents() {
  $("#btnStart").onclick = () => initOrgPhase();
  $("#btnOrgSpin").onclick = spinOrg;
  $("#btnOrgReroll").onclick = () => {
    if (state.orgRerolls <= 0) return;
    state.orgRerolls--;
    updateOrgRerollUI();
    spinOrg();
  };
  $("#btnOrgAccept").onclick = () => initRosterPhase();
  $("#btnReplay").onclick = () => {
    // Couper la musique de célébration avant de relancer une carrière
    const v = $("#sfxVictory");
    if (v) { v.pause(); v.currentTime = 0; }
    resetState();
    refreshHUD();
    showScreen("screen-title", "Draft de la structure");
  };
}

resetState();
bindEvents();
