/* ============================================================
   ROCKET MANAGER — data.js
   Toutes les données du jeu.

   ⚠️  ORGS et HIST_TEAMS sont des ÉCHANTILLONS fonctionnels :
       remplacez-les librement par vos propres tableaux,
       le moteur s'adapte automatiquement.
   PLAYERS / LEGENDS / COACHES proviennent de votre fichier.
   ============================================================ */

/* ------------------------------------------------------------
   MAPPING NATIONALITÉ → { langue parlée, région par défaut }
   Sert au calcul de cohésion (langue + région d'origine).
   Un joueur peut surcharger sa région avec un champ `region`.
   ------------------------------------------------------------ */
const NAT_INFO = {
  FR: { lang: "fr", region: "EU"   }, // France
  BE: { lang: "fr", region: "EU"   }, // Belgique (francophone côté RL)
  MA: { lang: "fr", region: "EU"   }, // Maroc (pros francophones, scène EU)
  UK: { lang: "en", region: "EU"   },
  NL: { lang: "nl", region: "EU"   },
  ES: { lang: "es", region: "EU"   },
  DK: { lang: "da", region: "EU"   },
  DE: { lang: "de", region: "EU"   },
  LT: { lang: "lt", region: "EU"   },
  AT: { lang: "de", region: "EU"   },
  SE: { lang: "sv", region: "EU"   },
  IT: { lang: "it", region: "EU"   },
  NO: { lang: "no", region: "EU"   },
  US: { lang: "en", region: "NA"   },
  CA: { lang: "en", region: "NA"   },
  SA: { lang: "ar", region: "MENA" },
  BR: { lang: "pt", region: "SAM"  },
  CL: { lang: "es", region: "SAM"  },
  AU: { lang: "en", region: "OCE"  },
  JP: { lang: "ja", region: "OCE"  },
};

/* ------------------------------------------------------------
   STRUCTURES ESPORT (Phase 1) — ÉCHANTILLON À PERSONNALISER
   logo : chemin local (assets/logos/...). Si l'image n'existe
   pas, un badge avec le tag est affiché à la place (fallback).
   ------------------------------------------------------------ */
const ORGS = [
  { name: "Karmine Corp",     tag: "KC",  region: "EU",   logo: "assets/logos/kc.png",        color: "#00b8f5" },
  { name: "Team Vitality",    tag: "VIT", region: "EU",   logo: "assets/logos/vitality.png",  color: "#ffd400" },
  { name: "Team BDS",         tag: "BDS", region: "EU",   logo: "assets/logos/bds.png",       color: "#ff2e63" },
  { name: "Gentle Mates",     tag: "M8",  region: "EU",   logo: "assets/logos/m8.png",        color: "#c9f24b" },
  { name: "NRG",              tag: "NRG", region: "NA",   logo: "assets/logos/nrg.png",       color: "#e6e6e6" },
  { name: "Gen.G Mobil1",     tag: "GEN", region: "NA",   logo: "assets/logos/geng.png",      color: "#a78b2f" },
  { name: "Spacestation",     tag: "SSG", region: "NA",   logo: "assets/logos/ssg.png",       color: "#ff4655" },
  { name: "Luminosity",       tag: "LG",  region: "NA",   logo: "assets/logos/lg.png",        color: "#2ea8ff" },
  { name: "Team Falcons",     tag: "FLC", region: "MENA", logo: "assets/logos/falcons.png",   color: "#27e07f" },
  { name: "Twisted Minds",    tag: "TM",  region: "MENA", logo: "assets/logos/twisted.png",   color: "#b04bff" },
  { name: "FURIA",            tag: "FUR", region: "SAM",  logo: "assets/logos/furia.png",     color: "#0d0d0d" },
  { name: "Team Secret",      tag: "TS",  region: "SAM",  logo: "assets/logos/secret.png",    color: "#dfe3ee" },
  { name: "PWR",              tag: "PWR", region: "OCE",  logo: "assets/logos/pwr.png",       color: "#ff5fa2" },
  { name: "Ground Zero",      tag: "GZG", region: "OCE",  logo: "assets/logos/gz.png",        color: "#37d6c3" },
];

/* ------------------------------------------------------------
   MALUS RÉGIONAL appliqué au winrate (Phase 4, hors Worlds)
   ------------------------------------------------------------ */
/* Modificateur de winrate en saison régionale : les régions faibles (OCE/SAM)
   offrent un vrai BONUS — une grosse équipe doit y écraser la concurrence —
   tandis que les régions fortes (EU/NA) gardent un malus adouci. */
const REGION_MALUS = { OCE: 10, SAM: 8, NA: -2, MENA: -4, EU: -6 };

/* Difficulté de la région affichée en étoiles 1–5 (purement informatif). */
const REGION_DIFFICULTY = { OCE: 1, SAM: 2, MENA: 3, NA: 4, EU: 5 };

/* ------------------------------------------------------------
   JOUEURS 2026 (fournis)
   ------------------------------------------------------------ */
const PLAYERS = [
  // --- EUROPE ---
  {name: "Zen", year: 2026, rating: 96, nat: "FR", mental: 4, titles: 1},
  {name: "M0nkey M00n", year: 2026, rating: 91, nat: "FR", mental: 3, titles: 2},
  {name: "ExoTiiK", year: 2026, rating: 92, nat: "FR", mental: 5, titles: 1},
  {name: "dralii", year: 2026, rating: 93, nat: "MA", mental: 2, titles: 1},
  {name: "Vatira", year: 2026, rating: 95, nat: "FR", mental: 3, titles: 0},
  {name: "Atow.", year: 2026, rating: 92, nat: "BE", mental: 3, titles: 0},
  {name: "Rise.", year: 2026, rating: 85, nat: "UK", mental: 1, titles: 0},
  {name: "Itachi", year: 2026, rating: 82, nat: "MA", mental: 5, titles: 0},
  {name: "Seikoo", year: 2026, rating: 90, nat: "FR", mental: 3, titles: 1},
  {name: "juicy", year: 2026, rating: 91, nat: "FR", mental: 3, titles: 0},
  {name: "Oski", year: 2026, rating: 91, nat: "UK", mental: 3, titles: 0},
  {name: "Joyo", year: 2026, rating: 89, nat: "UK", mental: 3, titles: 0},
  {name: "Archie", year: 2026, rating: 90, nat: "UK", mental: 2, titles: 0},
  {name: "nass", year: 2026, rating: 91, nat: "MA", mental: 2, titles: 0},
  {name: "Joreuz", year: 2026, rating: 87, nat: "NL", mental: 2, titles: 0},
  {name: "stizzy", year: 2026, rating: 89, nat: "ES", mental: 3, titles: 0},
  {name: "oaly.", year: 2026, rating: 86, nat: "NL", mental: 1, titles: 0},

  // --- EUROPE (Sub-top / Bubble / Pépites) ---
  {name: "MTZR", year: 2026, rating: 84, nat: "FR", mental: 3, titles: 0},
  {name: "Giuk", year: 2026, rating: 78, nat: "FR", mental: 3, titles: 0},
  {name: "Nico", year: 2026, rating: 79, nat: "DK", mental: 3, titles: 0},
  {name: "Tox", year: 2026, rating: 84, nat: "DE", mental: 2, titles: 0},
  {name: "Catalysm", year: 2026, rating: 84, nat: "DE", mental: 3, titles: 0},
  {name: "rehzzy", year: 2026, rating: 84, nat: "UK", mental: 3, titles: 0},
  {name: "Simas", year: 2026, rating: 82, nat: "LT", mental: 3, titles: 0},
  {name: "TehQoz", year: 2026, rating: 82, nat: "ES", mental: 4, titles: 0},
  {name: "ivn", year: 2026, rating: 81, nat: "AT", mental: 3, titles: 0},
  {name: "Accro", year: 2026, rating: 80, nat: "UK", mental: 3, titles: 0},
  {name: "Pisces", year: 2026, rating: 79, nat: "FR", mental: 3, titles: 0},
  {name: "Cbell", year: 2026, rating: 76, nat: "UK", mental: 4, titles: 0},

  // --- AMERIQUE DU NORD (NA) ---
  {name: "Daniel", year: 2026, rating: 91, nat: "US", mental: 4, titles: 1},
  {name: "BeastMode", year: 2026, rating: 93, nat: "US", mental: 4, titles: 1},
  {name: "Atomic", year: 2026, rating: 90, nat: "US", mental: 2, titles: 1},
  {name: "Firstkiller", year: 2026, rating: 91, nat: "US", mental: 3, titles: 0},
  {name: "ApparentlyJack", year: 2026, rating: 88, nat: "UK", region: "NA", mental: 5, titles: 0},
  {name: "Chronic", year: 2026, rating: 90, nat: "US", mental: 3, titles: 0},
  {name: "Lj", year: 2026, rating: 90, nat: "US", mental: 3, titles: 0},
  {name: "Justin.", year: 2026, rating: 85, nat: "US", mental: 3, titles: 1},
  {name: "GarrettG", year: 2026, rating: 82, nat: "US", mental: 5, titles: 1},
  {name: "2Piece", year: 2026, rating: 86, nat: "US", mental: 3, titles: 0},
  {name: "Wahvey", year: 2026, rating: 85, nat: "US", mental: 3, titles: 0},
  {name: "AYYJAYY", year: 2026, rating: 87, nat: "US", mental: 2, titles: 0},
  {name: "CHEESE.", year: 2026, rating: 86, nat: "US", mental: 3, titles: 0},
  {name: "kofyr", year: 2026, rating: 85, nat: "US", mental: 3, titles: 0},
  {name: "Majicbear", year: 2026, rating: 85, nat: "US", mental: 3, titles: 0},

  // --- AMERIQUE DU NORD (Sub-top / Bubble / Pépites) ---
  {name: "Aris", year: 2026, rating: 84, nat: "US", mental: 3, titles: 0},
  {name: "Frosty", year: 2026, rating: 83, nat: "US", mental: 3, titles: 0},
  {name: "Fiv3Up", year: 2026, rating: 82, nat: "US", mental: 3, titles: 0},
  {name: "Percy.", year: 2026, rating: 82, nat: "US", mental: 3, titles: 0},
  {name: "Sosa", year: 2026, rating: 81, nat: "US", mental: 4, titles: 0},
  {name: "Gomb", year: 2026, rating: 81, nat: "US", mental: 2, titles: 0},
  // NOTE : "kofyr" apparaissait 2 fois dans la liste source (85 et 80).
  // La règle anti-doublon (par nom) ne garde qu'une version par partie.

  // --- MOYEN ORIENT (MENA) ---
  {name: "trk511", year: 2026, rating: 94, nat: "SA", mental: 4, titles: 0},
  {name: "Rw9", year: 2026, rating: 94, nat: "SA", mental: 4, titles: 0},
  {name: "Kiileerrz", year: 2026, rating: 93, nat: "SA", mental: 3, titles: 0},
  {name: "Nwpo", year: 2026, rating: 94, nat: "SA", mental: 2, titles: 0},
  {name: "Ahmad", year: 2026, rating: 88, nat: "SA", mental: 4, titles: 0},
  {name: "Twiz", year: 2026, rating: 85, nat: "SA", mental: 3, titles: 0},

  // --- AMERIQUE DU SUD (SAM) ---
  {name: "yANXNZ", year: 2026, rating: 90, nat: "BR", mental: 3, titles: 0},
  {name: "Lostt.", year: 2026, rating: 90, nat: "BR", mental: 3, titles: 0},
  {name: "crr", year: 2026, rating: 88, nat: "ES", region: "SAM", mental: 3, titles: 0},
  {name: "Reysbull", year: 2026, rating: 86, nat: "CL", mental: 4, titles: 0},
  {name: "diaz", year: 2026, rating: 86, nat: "BR", mental: 3, titles: 0},
  {name: "swiftt.", year: 2026, rating: 86, nat: "BR", mental: 3, titles: 0},
  {name: "kv1", year: 2026, rating: 86, nat: "BR", mental: 3, titles: 0},
  {name: "Sad", year: 2026, rating: 84, nat: "BR", mental: 3, titles: 0},

  // --- OCEANIE & APAC ---
  {name: "Fever", year: 2026, rating: 80, nat: "AU", mental: 3, titles: 0},
  {name: "Superlachie", year: 2026, rating: 79, nat: "AU", mental: 3, titles: 0},
  {name: "bananahead", year: 2026, rating: 80, nat: "AU", mental: 3, titles: 0},
  {name: "Torsos", year: 2026, rating: 78, nat: "AU", mental: 4, titles: 0},
  {name: "Fibérr", year: 2026, rating: 77, nat: "AU", mental: 3, titles: 0},
  {name: "ReaLize", year: 2026, rating: 76, nat: "JP", mental: 4, titles: 0},
];

/* ------------------------------------------------------------
   LÉGENDES (fournies) — flag isLegend ajouté au chargement
   ------------------------------------------------------------ */
const LEGENDS = [
  // --- TITRES UNIQUES ---
  {name: "Kronovi", year: 2016, rating: 82, nat: "US", mental: 4},
  {name: "Lachinio", year: 2016, rating: 80, nat: "CA", mental: 3},
  {name: "0ver_Zer0", year: 2016, rating: 79, nat: "US", mental: 4},
  {name: "Markydooda", year: 2016, rating: 81, nat: "UK", mental: 4},
  {name: "Kuxir97", year: 2016, rating: 88, nat: "IT", mental: 5},
  {name: "gREAZYMEISTER", year: 2016, rating: 80, nat: "NO", mental: 3},
  {name: "Remkoe", year: 2017, rating: 82, nat: "NL", mental: 4},
  {name: "Deevo", year: 2017, rating: 87, nat: "UK", mental: 4},
  {name: "Torment", year: 2018, rating: 89, nat: "US", mental: 4},
  {name: "Gimmick", year: 2018, rating: 85, nat: "US", mental: 4},
  {name: "GarrettG", year: 2019, rating: 91, nat: "US", mental: 5},
  {name: "Extra", year: 2022, rating: 95, nat: "FR", mental: 4},
  {name: "Zen", year: 2023, rating: 97, nat: "FR", mental: 5},
  {name: "Radosin", year: 2023, rating: 91, nat: "FR", mental: 5},
  {name: "Alpha54", year: 2023, rating: 94, nat: "FR", mental: 4},
  {name: "Seikoo", year: 2022, rating: 96, nat: "FR", mental: 4},
  {name: "ExoTiiK", year: 2024, rating: 96, nat: "FR", mental: 4},
  {name: "dralii", year: 2024, rating: 97, nat: "MA", mental: 3},
  {name: "Daniel", year: 2024, rating: 94, nat: "US", mental: 4},
  {name: "BeastMode", year: 2024, rating: 96, nat: "US", mental: 3},
  {name: "Atomic", year: 2024, rating: 92, nat: "US", mental: 3},

  // --- MULTI-TITRÉS ---
  {name: "ViolentPanda", year: 2017, rating: 89, nat: "NL", mental: 5},
  {name: "ViolentPanda", year: 2018, rating: 95, nat: "NL", mental: 5},
  {name: "Scrub Killa", year: 2019, rating: 88, nat: "UK", mental: 2},
  {name: "Jstn.", year: 2019, rating: 91, nat: "US", mental: 4},
  {name: "M0nkey M00n", year: 2022, rating: 97, nat: "FR", mental: 3},
  {name: "M0nkey M00n", year: 2024, rating: 95, nat: "FR", mental: 2},
  {name: "Fairy Peak!", year: 2019, rating: 91, nat: "FR", mental: 4},
  {name: "Kaydop", year: 2017, rating: 92, nat: "FR", mental: 4},
  {name: "Kaydop", year: 2018, rating: 94, nat: "FR", mental: 5},
  {name: "Kaydop", year: 2019, rating: 93, nat: "FR", mental: 4},
  {name: "SquishyMuffinz", year: 2018, rating: 91, nat: "CA", mental: 5},
  {name: "Turbopolsa", year: 2017, rating: 90, nat: "SE", mental: 5},
  {name: "Turbopolsa", year: 2017, rating: 92, nat: "SE", mental: 5}, // S4 back-to-back
  {name: "Turbopolsa", year: 2018, rating: 93, nat: "SE", mental: 5},
  {name: "Turbopolsa", year: 2019, rating: 92, nat: "SE", mental: 5},
];

/* ------------------------------------------------------------
   COACHES (fournis)
   ------------------------------------------------------------ */
const COACHES = [
  {name: "Extra", nat: "FR", m_bonus: 2, desc: "Ancien champion du monde, calme olympien et sens du collectif"},
  {name: "Kassio", nat: "FR", m_bonus: 2, desc: "Architecte tactique BDS, sang froid"},
  {name: "Ferra", nat: "FR", m_bonus: 2, desc: "Discours d'équipe, motivation absolue"},
  {name: "Eversax", nat: "BE", m_bonus: 1, desc: "Fondations tactiques, rigueur KC"},
  {name: "Mew", nat: "FR", m_bonus: 1, desc: "Rigueur et calme"},
  {name: "Satthew", nat: "US", m_bonus: 2, desc: "Gestion des égos, coach emblématique"},
  {name: "Allushin", nat: "CA", m_bonus: 1, desc: "Coach calme et analytique"},
  {name: "Chrome", nat: "US", m_bonus: -1, desc: "Très exigeant, parfois dur mentalement"},
  {name: "Torment", nat: "US", m_bonus: 1, desc: "Vétéran NA, excellente lecture du jeu"},
  {name: "Nick", nat: "US", m_bonus: 0, desc: "Stratégie pure, analyse vidéo poussée"},
  {name: "Sizz", nat: "US", m_bonus: 1, desc: "Ambianceur, hype les joueurs"},
  {name: "CJCJ", nat: "AU", m_bonus: 2, desc: "Vibes incroyables, dé-stresse l'équipe"},
  {name: "Mognus", nat: "SE", m_bonus: 2, desc: "Calme nordique, focus sur la cohésion"},
  {name: "Aguesome", nat: "ES", m_bonus: 1, desc: "Pousse les joueurs hispanophones / SAM"},
];

/* ------------------------------------------------------------
   ÉQUIPES HISTORIQUES (Worlds) — ÉCHANTILLON À PERSONNALISER
   `unbeatable: true` ⇒ winrate de 100% contre le joueur
   (règle absolue : Team BDS 2022 & Team BDS 2024).
   `roster` sert au tirage du buteur en finale.
   ------------------------------------------------------------ */
/* ================== ÉQUIPES ACTUELLES (RLCS 2026) ==================
   Joueurs qui jouent DÉJÀ ensemble dans le monde réel : tirer deux (ou trois)
   coéquipiers actuels garantit une excellente cohésion d'équipe.
   ⚠️ ÉCHANTILLON de mémoire — vérifiez/corrigez ces rosters sur
   liquipedia.net (RLCS 2026) ; les noms doivent être EXACTEMENT
   ceux de PLAYERS pour que la cohésion s'applique. */
const CURRENT_TEAMS = [
  { name: "Karmine Corp",   roster: ["Vatira", "Atow.", "juicy"] },
  { name: "Team BDS",       roster: ["M0nkey M00n", "ExoTiiK", "dralii"] },
  { name: "Team Vitality",  roster: ["Zen", "Seikoo", "nass"] },
  { name: "Team Falcons",   roster: ["trk511", "Kiileerrz", "Ahmad"] },
  { name: "Twisted Minds",  roster: ["Rw9", "Nwpo", "Twiz"] },
  { name: "G2 Stride",      roster: ["BeastMode", "Daniel", "Atomic"] },
  { name: "NRG",            roster: ["GarrettG", "Justin.", "AYYJAYY"] },
  { name: "Spacestation",   roster: ["Lj", "Chronic", "2Piece"] },
  { name: "FURIA",          roster: ["yANXNZ", "Lostt.", "diaz"] },
  { name: "PWR",            roster: ["Fever", "Superlachie", "bananahead"] },
];

const HIST_TEAMS = [
  { name: "Team BDS 2022",      rating: 99, unbeatable: true,  roster: ["M0nkey M00n", "Extra", "Seikoo"] },
  { name: "Team BDS 2024",      rating: 99, unbeatable: true,  roster: ["M0nkey M00n", "ExoTiiK", "dralii"] },
  { name: "NRG 2019",           rating: 92, roster: ["GarrettG", "Jstn.", "Turbopolsa"] },
  { name: "Renault Vitality 2019", rating: 93, roster: ["Kaydop", "Fairy Peak!", "Scrub Killa"] },
  { name: "Dignitas 2018",      rating: 94, roster: ["ViolentPanda", "Kaydop", "Turbopolsa"] },
  { name: "Cloud9 2018",        rating: 91, roster: ["SquishyMuffinz", "Torment", "Gimmick"] },
  { name: "iBP Cosmic 2016",    rating: 84, roster: ["Kronovi", "Lachinio", "0ver_Zer0"] },
  { name: "FlipSid3 2016",      rating: 85, roster: ["Kuxir97", "Markydooda", "gREAZYMEISTER"] },
  { name: "Karmine Corp 2023",  rating: 94, roster: ["Vatira", "Atow.", "ExoTiiK"] },
  { name: "Team Falcons 2025",  rating: 94, roster: ["trk511", "Rw9", "Kiileerrz"] },
  { name: "G2 Stride 2024",     rating: 93, roster: ["Daniel", "BeastMode", "Atomic"] },
  { name: "Gen.G 2023",         rating: 92, roster: ["Chronic", "ApparentlyJack", "Noly"] },
  { name: "FURIA 2024",         rating: 91, roster: ["yANXNZ", "Lostt.", "drufinho"] },
  { name: "Moist Esports 2023", rating: 91, roster: ["Vatira", "rise.", "Daniel"] },
];
