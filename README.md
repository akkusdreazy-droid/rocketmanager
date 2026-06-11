# 🚀 Rocket Manager

Jeu de gestion d'équipe esport Rocket League — HTML / CSS / JS Vanilla, zéro dépendance.

## Lancer le jeu

Les navigateurs bloquent parfois l'audio/images en `file://`. Le plus simple :

```bash
cd rocket-manager
python3 -m http.server 8000
# puis ouvrir http://localhost:8000
```

(Ouvrir directement `index.html` fonctionne aussi dans la plupart des cas.)

## Architecture

| Fichier      | Rôle |
|--------------|------|
| `index.html` | Tous les écrans (title, draft org, roster, preview, saison, mercato, quali, worlds, finale, fin) |
| `style.css`  | Dark mode bleu/violet/doré, Rajdhani + Inter, animations roulette/slot/moteur 2D/trophée |
| `data.js`    | ORGS, PLAYERS, LEGENDS, COACHES, HIST_TEAMS, mapping nationalités, malus régionaux |
| `game.js`    | Moteur complet (phases 1→5), toutes les règles regroupées dans l'objet `RULES` |
| `assets/`    | Images + sons fournis |

## À personnaliser dans `data.js`

- **`ORGS`** : échantillon fourni. Format : `{ name, tag, region, logo, color }`.
  Déposez vos logos dans `assets/logos/` ; si l'image manque, un badge coloré avec le tag s'affiche (fallback automatique).
- **`HIST_TEAMS`** : échantillon fourni. `unbeatable: true` = 100 % winrate contre vous (Team BDS 2022/2024). `roster` sert au tirage du buteur en finale.

## Hypothèses prises (modifiables facilement)

1. **Cohésion** (par paire de joueurs, priorité décroissante) : même **pays** (3 pts) > même **langue** (2) > même **région** (1), **+1** si la paire a un **historique commun** (déjà coéquipiers dans une équipe de `HIST_TEAMS`). Total /12 ramené sur 5 — `computeCohesion()`.
2. **Mental d'équipe** : `(mental J1 + J2 + J3 + bonus coach) / 4`, arrondi, bridé 0–5.
3. **Winrate** : base selon GEN (40/52/64/76/88 %) + bonus **mental** (-4 à +6) + bonus **diversité des rôles** (3 rôles différents +4, deux identiques +2, trois identiques 0) + bonus **Légendes** (+3 / +6 / +8 selon le nombre, **plancher 90 % avec 3 Légendes**, qui garantissent aussi la finale des Worlds) + effet **tactique** + modificateur régional (hors Worlds).
4. **Régions** : OCE **+10 %** et SAM **+8 %** de winrate en saison (une grosse équipe y écrase tout), MENA −4 %, NA −2 %, EU −6 %. Difficulté affichée en étoiles via `REGION_DIFFICULTY` (OCE ★ → EU ★★★★★).
4. **Tactiques** : les 4 tactiques ont chacune un léger effet **aléatoire** (-2 à +4 %) tiré en début de partie — `rollTacticLuck()`.
5. **Rerolls joueurs** : **3 Rerolls Random au total** pour tout le draft (compteur partagé entre les 3 slots).
6. **Points de split** : Top16 **6** / Quarts **8** / Demies **12** / Finaliste **15** / Champion **18**, Major **×2**. Moins de **20 points** avant un Major ⇒ non qualifié au Major.
7. **Qualification Worlds** (seuil direct par région, sinon **LCQ garanti**, plus d'élimination sèche) : EU 45, NA 45, OCE 70, SAM 70 (MENA 55, interpolé).
8. **Majors** : malus de winrate léger −10 % (−5 % si GEN ≥ 90, −2 % si GEN ≥ 95) — `RULES.majorPenalty()`.
10. **Grande finale** : bannière « GAME N », buts multiples animés par game (sans son), secousse du terrain et pulse du score à chaque but, tous les buteurs affichés, et **un seul timeout** pour toute la finale (Motiver / Réprimander / Trashtalk — réprimander booste une équipe avec des Légendes, effondre les autres). Sacre : titre doré animé (reflet), rayons rotatifs derrière le trophée, pluie de confettis.
11. **Maroc (MA)** : rattaché à la scène EU et à la langue française (dralii, nass, Itachi). `crr` et `ApparentlyJack` ont un champ `region` explicite pour corriger leur scène.
12. **Assets** : vos fichiers `Ball.png` / `Car1.png` / `Car2.png` sont en réalité des JPEG à fond noir — le CSS `mix-blend-mode: screen` rend ce fond invisible sur le terrain. Si vous fournissez de vrais PNG transparents, supprimez simplement cette propriété dans `.ball, .car`.
13. Le fichier terrain fourni s'appelle `field.png` (le cahier des charges mentionnait `field_2.jpg`) — le code pointe vers `assets/field.png`.
14. **"kofyr"** apparaissait deux fois dans votre liste source : la règle anti-doublon par nom n'en gardera qu'un par partie.

## Réglages rapides

Toutes les probabilités sont dans `RULES` en tête de `game.js` : boom mercato, boom finale, table de winrate, points, délai des games de finale (2,5 s), etc.
