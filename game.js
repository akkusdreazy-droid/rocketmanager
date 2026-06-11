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

  // Les équipes historiques antérieures à cette année ne vont jamais en playoffs des Worlds
  PLAYOFFS_MIN_YEAR: 2019,

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

/** Deux joueurs sont coéquipiers ACTUELS (RLCS 2026, monde réel). */
function currentTeammates(a, b) {
  return CURRENT_TEAMS.some((t) => t.roster.includes(a.name) && t.roster.includes(b.name));
}

/**
 * Cohésion 0–5, par paire de joueurs, avec priorité :
 *   Coéquipiers actuels RLCS 2026 (4 = score max direct)
 *   > Pays identique (3) > Langue identique (2) > Région identique (1) > rien (0)
 * + bonus Historique (+1, plafonné à 4) si la paire a déjà joué ensemble par le passé.
 * Score max : 3 paires × 4 = 12, ramené sur 5. Un trio qui joue déjà ensemble
 * dans le monde réel a donc automatiquement une cohésion de 5/5.
 */
function computeCohesion() {
  const ps = state.players;
  const pairs = [[0, 1], [0, 2], [1, 2]];
  let total = 0;
  for (const [i, j] of pairs) {
    const a = ps[i], b = ps[j];
    let score;
    if (currentTeammates(a, b)) {
      score = 4; // ils jouent DÉJÀ ensemble : alchimie immédiate
    } else {
      if      (a.nat === b.nat)             score = 3; // même pays
      else if (langOf(a) === langOf(b))     score = 2; // même langue
      else if (regionOf(a) === regionOf(b)) score = 1; // même région
      else                                  score = 0;
      if (playedTogether(a, b)) score = Math.min(score + 1, 4); // ex-coéquipiers
    }
    total += score;
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

/**
 * Remplacement d'un joueur : animation slot + retour preview pour ré-assigner rôle/tactique.
 * @param {number} slot
 * @param {string} nextLabel — libellé du bouton de suite
 * @param {Function} nextFn — action de suite (par défaut : preview puis Spring Split)
 */
async function mercatoReplace(slot, nextLabel = "Ajuster les tactiques →",
                              nextFn = () => initPreviewPhase("Lancer le Spring Split", startSpringSplit)) {
  showScreen("screen-roster", "Transfert");
  $("#rosterSub").textContent = "Sélection des joueurs";
  state.draftingPhase = false; // pas de boutons reroll de draft hors phase 2

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
  b.textContent = nextLabel;
  b.onclick = nextFn;
  $("#rosterActions").appendChild(b);
}

/**
 * Transfert pré-Worlds : une fois la qualification acquise, possibilité de
 * remplacer UN joueur avant de lancer les Worlds (ou de garder l'équipe).
 */
function preWorldsTransfer() {
  showScreen("screen-mercato", "Transfert pré-Worlds");
  $("#mercatoText").innerHTML =
    `Votre billet pour les <strong>Worlds</strong> est en poche.<br>
     Dernière fenêtre de transfert : vous pouvez remplacer <strong>un joueur</strong>
     avant le plus grand tournoi de l'année — ou faire confiance au groupe.`;

  const actions = $("#mercatoActions");
  actions.innerHTML = "";
  addBtn(actions, "btn-gold", "Garder l'équipe → Worlds", startWorlds);
  state.players.forEach((p, i) => {
    addBtn(actions, "btn-ghost", `Transférer ${p.name} 🎲`, () =>
      mercatoReplace(i, "Ajuster les tactiques →", () => initPreviewPhase("Lancer les Worlds", startWorlds)));
  });
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
    addBtn(actions, "btn-gold", "Direction les Worlds →", preWorldsTransfer);
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
    addBtn(actions, "btn-gold", "Direction les Worlds →", preWorldsTransfer);
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

/** Tire N adversaires historiques distincts, sans conflit de joueur avec votre roster.
 *  @param {boolean} playoffsOnly — exclut les équipes trop anciennes (avant 2019) des playoffs. */
function drawOpponents(n, exclude = new Set(), playoffsOnly = false) {
  const eligible = (t) =>
    !exclude.has(t.name) &&
    !rosterConflict(t) &&
    (!playoffsOnly || (t.year ?? 2024) >= RULES.PLAYOFFS_MIN_YEAR);
  let pool = HIST_TEAMS.filter(eligible);
  // Garde-fou : si le filtre vide le pool (roster très chargé), on relâche la contrainte
  if (pool.length < n) pool = HIST_TEAMS.filter((t) => !exclude.has(t.name));
  return shuffle(pool).slice(0, n);
}

/**
 * Probabilité de gagner un match aux Worlds contre une équipe historique.
 * - Bonus de FORME : bons résultats de saison + bon mental + bon coach.
 * - Les équipes trop anciennes (avant 2019) sont moins fortes qu'à leur époque.
 */
function matchWinChance(opp) {
  if (opp.unbeatable) return 0; // BDS 2022 / 2024 : intouchables
  const wr = computeWinrate(true);

  // Bonus de forme : une équipe qui a réussi sa saison arrive lancée
  const formBonus =
    (state.points >= 90 ? 6 : state.points >= 70 ? 4 : state.points >= 50 ? 2 : 0) +
    (computeMental() >= 4 ? 2 : 0) +
    ((state.coach?.m_bonus ?? 0) >= 2 ? 2 : 0);

  // Les gloires du passé (avant 2019) ont pris un coup de vieux
  const oppRating = opp.rating - ((opp.year ?? 2024) < RULES.PLAYOFFS_MIN_YEAR ? 6 : 0);

  // Léger ajustement par l'écart de niveau (plancher relevé : jamais désespéré)
  return clamp(wr + formBonus + (computeGen() - oppRating) * 1.5, 15, 97);
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
    const opp = drawOpponents(1, faced, true)[0]; // playoffs : équipes 2019+ uniquement
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

  // Finale : adversaire tiré parmi les équipes modernes restantes (BDS possible…)
  state.finalOpponent = drawOpponents(1, faced, true)[0];
  await sleep(900);
  const next = $("#btnWorldsNext");
  next.hidden = false;
  next.textContent = `GRANDE FINALE vs ${state.finalOpponent.name} →`;
  next.onclick = startFinal;
}

/* ============================================================
   13. GRANDE FINALE — BO7 + MOTEUR 2D (3 contre 3)
   ============================================================ */
/* Bornes du terrain en % (la balle et les voitures ne sortent JAMAIS de là) */
const FIELD = { minX: 10, maxX: 90, minY: 7, maxY: 93 };

const engine = {
  raf: null,
  ball: { x: 50, y: 50, vx: 0.4, vy: 0.4 },
  cars: [], // 6 voitures {x, y, vx, vy, el, img, team, offX, offY, chase}
};

/**
 * Construit les 6 voitures (3 vs 3) avec le pseudo de chaque joueur :
 * en bas votre équipe (Car1), en haut l'adversaire (Car2, roster historique).
 */
function setupCars(opp) {
  const layer = $("#carsLayer");
  layer.innerHTML = "";
  engine.cars = [];

  const oppNames = (opp.roster ?? []).slice(0, 3);
  while (oppNames.length < 3) oppNames.push(opp.name);

  /* Chaque voiture a un rôle : chasseur (fonce sur la balle), soutien, couverture.
     offX/offY décalent sa position cible par rapport à la balle. */
  const layout = [
    // --- Votre équipe (bas du terrain) ---
    { team: 0, name: state.players[0].name, x: 50, y: 78, chase: 1.0, offX: 0,   offY: 4  },
    { team: 0, name: state.players[1].name, x: 32, y: 84, chase: 0.65, offX: -12, offY: 10 },
    { team: 0, name: state.players[2].name, x: 68, y: 84, chase: 0.65, offX: 12,  offY: 10 },
    // --- Adversaire (haut du terrain) ---
    { team: 1, name: oppNames[0], x: 50, y: 22, chase: 1.0, offX: 0,   offY: -4  },
    { team: 1, name: oppNames[1], x: 32, y: 16, chase: 0.65, offX: -12, offY: -10 },
    { team: 1, name: oppNames[2], x: 68, y: 16, chase: 0.65, offX: 12,  offY: -10 },
  ];

  for (const c of layout) {
    const unit = document.createElement("div");
    unit.className = "car-unit";
    unit.innerHTML = `<img src="assets/${c.team === 0 ? "Car1" : "Car2"}.png" alt="">
                      <span class="car-name">${c.name}</span>`;
    layer.appendChild(unit);
    engine.cars.push({ ...c, vx: 0, vy: 0, el: unit, img: unit.querySelector("img") });
  }
}

/** Replace IMMÉDIATEMENT la balle au centre et les voitures à leur camp (coup d'envoi). */
function engineResetPositions() {
  engine.ball = { x: 50, y: 50, vx: 0, vy: 0 };
  placeOnPitch($("#ball"), 50, 50);
  const homes = [[50, 78], [32, 84], [68, 84], [50, 22], [32, 16], [68, 16]];
  engine.cars.forEach((c, i) => {
    c.x = homes[i][0]; c.y = homes[i][1]; c.vx = 0; c.vy = 0;
    placeCar(c);
  });
}

/** Boucle d'animation : balle fluide qui rebondit + 6 voitures en poursuite lissée. */
function engineStart() {
  engineStop();
  const ballEl = $("#ball");
  const b = engine.ball;
  b.x = 50; b.y = 50;
  const ang = rand(0, Math.PI * 2);
  b.vx = Math.cos(ang) * 0.55;
  b.vy = Math.sin(ang) * 0.55 || 0.4;
  let t = 0;

  const frame = () => {
    t++;
    // ---- Balle : inertie + rebonds amortis, TOUJOURS dans les bornes ----
    b.x += b.vx; b.y += b.vy;
    if (b.x < FIELD.minX || b.x > FIELD.maxX) { b.vx *= -0.92; b.x = clamp(b.x, FIELD.minX, FIELD.maxX); }
    if (b.y < FIELD.minY || b.y > FIELD.maxY) { b.vy *= -0.92; b.y = clamp(b.y, FIELD.minY, FIELD.maxY); }
    // Légère friction + vitesse minimale pour que le jeu vive
    b.vx *= 0.996; b.vy *= 0.996;
    const speed = Math.hypot(b.vx, b.vy);
    if (speed < 0.25) { b.vx *= 1.12; b.vy *= 1.12; }

    // ---- Voitures : accélération douce vers la cible (balle + décalage de rôle) ----
    for (const c of engine.cars) {
      const wob = Math.sin(t / 26 + c.offX) * 1.6;
      const tx = clamp(b.x + c.offX * (1 - c.chase) + wob, FIELD.minX, FIELD.maxX);
      const ty = clamp(b.y + c.offY * (1 - c.chase), FIELD.minY, FIELD.maxY);
      // Accélération proportionnelle à la distance, vitesse plafonnée, friction
      c.vx = (c.vx + (tx - c.x) * 0.0085 * c.chase) * 0.90;
      c.vy = (c.vy + (ty - c.y) * 0.0085 * c.chase) * 0.90;
      const v = Math.hypot(c.vx, c.vy), VMAX = 0.85;
      if (v > VMAX) { c.vx = c.vx / v * VMAX; c.vy = c.vy / v * VMAX; }
      c.x = clamp(c.x + c.vx, FIELD.minX, FIELD.maxX);
      c.y = clamp(c.y + c.vy, FIELD.minY, FIELD.maxY);

      // "Frappe" : contact avec la balle ⇒ impulsion dans la direction de la voiture
      if (Math.hypot(c.x - b.x, c.y - b.y) < 6) {
        const push = Math.atan2(b.y - c.y, b.x - c.x) + rand(-0.5, 0.5);
        const force = rand(0.6, 1.0);
        b.vx = Math.cos(push) * force;
        b.vy = Math.sin(push) * force;
      }
      placeCar(c);
    }

    placeOnPitch(ballEl, b.x, b.y);
    engine.raf = requestAnimationFrame(frame);
  };
  engine.raf = requestAnimationFrame(frame);
}

function engineStop() {
  cancelAnimationFrame(engine.raf);
  engine.raf = null;
}

/** Positionne une voiture (rotation de l'image vers la balle, pseudo lisible). */
function placeCar(c) {
  const ang = Math.atan2(engine.ball.y - c.y, engine.ball.x - c.x) * 180 / Math.PI + 90;
  c.el.style.left = c.x + "%";
  c.el.style.top = c.y + "%";
  c.img.style.transform = `rotate(${ang}deg)`;
}

/** Positionne un élément en % sur le terrain. */
function placeOnPitch(el, x, y) {
  el.style.left = x + "%";
  el.style.top = y + "%";
  el.style.transform = "translate(-50%, -50%)";
}

/** Animation de but : la balle file vers la cage (haut = on marque, bas = on encaisse). */
async function animateGoal(weScored) {
  engineStop();
  const b = engine.ball;
  const targetY = weScored ? 4 : 96; // cage du haut = on marque, cage du bas = on encaisse
  const targetX = rand(42, 58);      // dans la largeur de la cage
  const steps = 22;
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
  scoreTied: true, // mis à jour par renderGameScore : la PROLONGATION n'existe qu'à égalité
  RATE: 2.4, // secondes de jeu écoulées toutes les 100 ms réelles

  start() {
    this.stop();
    this.t = 300;
    this.render();
    this.id = setInterval(() => {
      this.t = Math.max(0, this.t - this.RATE);
      this.render();
    }, 100);
  },

  /** Fait défiler le chrono jusqu'à `target` (temps restant), puis résout. */
  runTo(target) {
    this.stop();
    return new Promise((resolve) => {
      this.id = setInterval(() => {
        this.t = Math.max(target, this.t - this.RATE);
        this.render();
        if (this.t <= target) { this.stop(); resolve(); }
      }, 100);
    });
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
    // PROLONGATION uniquement si le score est à ÉGALITÉ quand le temps tombe à 0
    if (this.t <= 0 && !draining && this.scoreTied) {
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

/** Met à jour le score de la game en cours sous le terrain (et l'état d'égalité). */
function renderGameScore(us, them, oppName) {
  gameClock.scoreTied = (us === them);
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
  setupCars(opp);            // 3 vs 3 avec les pseudos des joueurs de la game
  renderGameScore(0, 0, opp.name);
  engineResetPositions(); // balle au centre dès l'ouverture de l'écran

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
  let timeoutUsed = false;     // un SEUL timeout autorisé pour VOUS sur toute la finale
  let oppTimeoutUsed = false;  // l'adversaire aussi n'en prend qu'un
  let oppLossStreak = 0;       // défaites consécutives de l'adversaire

  while (us < 4 && them < 4) {
    game++;
    const r = await playFinalGame(game, opp, pWin);
    r.weWin ? us++ : them++;
    oppLossStreak = r.weWin ? oppLossStreak + 1 : 0;
    $("#finalUsScore").textContent = us;
    $("#finalThemScore").textContent = them;
    logFinal(`${r.weWin ? "✅" : "❌"} Game ${game} : ${state.org.tag} ${r.usGoals}–${r.themGoals} ${opp.name}`);
    logFinal(`   Buteurs : ${r.scorers.join(", ")}`);
    await sleep(700);

    if (us < 4 && them < 4) {
      // ---- Timeout ADVERSE : après 2 défaites d'affilée, leur coach réagit (aucun effet) ----
      if (oppLossStreak >= 2 && !oppTimeoutUsed) {
        oppTimeoutUsed = true;
        logFinal(`⏸ TIMEOUT de ${opp.name} ! Leur coach tente de briser votre élan… mais le momentum est de votre côté.`);
        await sleep(1500);
      }
      // ---- Votre pause entre les games (timeout possible UNE seule fois) ----
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

  // Bannière "GAME N" sur le terrain — la balle est replacée au CENTRE (coup d'envoi)
  engineResetPositions();
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

  /* Chaque but a une MINUTE précise : le chrono pilote la game.
     Temps restants décroissants, espacés d'au moins 15 s de jeu. */
  const goalTimes = sequence
    .map(() => randI(25, 275))
    .sort((a, b) => b - a)
    .map((t, k, arr) => (k === 0 ? t : Math.min(t, arr[k - 1] - 15)))
    .map((t) => Math.max(t, 5));

  /* Si le score est à égalité avant le DERNIER but : soit prolongation (~1 fois sur 3,
     but en or après le 0:00), soit but décisif dans les dernières secondes. */
  let preUs = 0, preThem = 0;
  sequence.slice(0, -1).forEach((g) => (g ? preUs++ : preThem++));
  const tiedBeforeLast = preUs === preThem;
  const overtime = tiedBeforeLast && Math.random() < 0.35;
  const last = goalTimes.length - 1;
  if (overtime) {
    goalTimes[last] = 0;
  } else if (tiedBeforeLast) {
    // But décisif au buzzer (dans la dernière minute de jeu)
    goalTimes[last] = Math.min(randI(5, 45), (goalTimes[last - 1] ?? 60) - 10);
  }

  const scorers = [];
  let liveUs = 0, liveThem = 0;
  renderGameScore(0, 0, opp.name);
  gameClock.t = 300;
  gameClock.render();
  engineStart();

  for (let k = 0; k < sequence.length; k++) {
    const ourGoal = sequence[k];
    await gameClock.runTo(goalTimes[k]); // le chrono décide du moment du but
    await animateGoal(ourGoal);          // la balle file vers la cage

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

    // Remise en jeu : le moteur repart, le chrono pilotera le but suivant
    if (k < sequence.length - 1) engineStart();
  }

  await gameClock.drainToZero(); // le timer affiche 0:00 au coup de sifflet final
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
 * - Motiver l'équipe        → vrai bonus de winrate, d'autant plus grand que
 *                             l'équipe est bonne (GEN + mental)
 * - Réprimander l'équipe    → aucun effet : les joueurs haussent les épaules
 * - Trashtalk l'adversaire  → efficace UNIQUEMENT si l'équipe en face a un
 *                             mental faible (≤ 2), sinon aucun effet
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
          // Plus l'équipe est bonne (GEN, mental), plus le discours porte
          const boost = clamp(4 + Math.round((computeGen() - 85) / 2) + (computeMental() >= 4 ? 3 : 0), 4, 14);
          logFinal(`📣 Timeout — le coach motive ses joueurs, le banc s'enflamme ! L'équipe répond présent.`);
          done(opp.unbeatable ? pWin : pWin + boost, true);
        });

        addBtn(actions, "btn-ghost", "😡 Réprimander l'équipe", () => {
          logFinal("😡 Timeout — la soufflante tombe à plat… les joueurs haussent les épaules. Aucun effet.");
          done(pWin, true);
        });

        addBtn(actions, "btn-ghost", "🗣 Trashtalk l'équipe adverse", () => {
          if ((opp.mental ?? 3) <= 2 && !opp.unbeatable) {
            logFinal(`🗣 Timeout — vous chambrez ${opp.name}… et ça marche ! Leur mental fragile vacille, ils perdent leurs moyens.`);
            done(pWin + 6, true);
          } else {
            logFinal(`🗣 Timeout — vous chambrez ${opp.name}. Ils n'ont même pas levé les yeux. Aucun effet.`);
            done(pWin, true);
          }
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
