/**
 * Compact opening book.
 *
 * lichess stores openings as an ECO + PGN table keyed by FEN (deepest match
 * wins, stop below 20 pieces). We keep the same *semantics* — longest match on
 * the move history — but ship a hand-curated book so the app stays dependency
 * free and tiny. Names are given in both English and Chinese.
 *
 * Used for three things:
 *   1. showing "Opening: Sicilian Defence" while playing,
 *   2. letting weak engine levels play real book moves instantly,
 *   3. marking moves as `book` in the review so they are not graded.
 */

export interface Opening {
  eco: string;
  name: string;
  nameZh: string;
  /** SAN moves, e.g. ['e4', 'c5', 'Nf3']. */
  moves: string[];
}

export const OPENINGS: Opening[] = [
  // --- first moves -------------------------------------------------------
  { eco: 'C20', name: "King's Pawn Opening", nameZh: '王兵开局', moves: ['e4'] },
  { eco: 'D00', name: "Queen's Pawn Opening", nameZh: '后兵开局', moves: ['d4'] },
  { eco: 'A10', name: 'English Opening', nameZh: '英格兰开局', moves: ['c4'] },
  { eco: 'A04', name: 'Réti Opening', nameZh: '列蒂开局', moves: ['Nf3'] },
  { eco: 'A01', name: 'Nimzo-Larsen Attack', nameZh: '尼姆佐-拉尔森攻击', moves: ['b3'] },
  { eco: 'A02', name: "Bird's Opening", nameZh: '伯德开局', moves: ['f4'] },
  { eco: 'A00', name: 'Benko Opening', nameZh: '本科开局', moves: ['g3'] },
  { eco: 'C20', name: 'Open Game', nameZh: '开放性开局', moves: ['e4', 'e5'] },
  { eco: 'D00', name: 'Closed Game', nameZh: '封闭性开局', moves: ['d4', 'd5'] },
  { eco: 'A10', name: 'English, Reversed Sicilian', nameZh: '英格兰开局·反向西西里', moves: ['c4', 'e5'] },
  { eco: 'A15', name: 'English, Anglo-Indian', nameZh: '英格兰开局·英印变例', moves: ['c4', 'Nf6'] },

  // --- 1.e4 e5 ----------------------------------------------------------
  { eco: 'C50', name: 'Italian Game', nameZh: '意大利开局', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4'] },
  { eco: 'C53', name: 'Giuoco Piano', nameZh: '意大利开局·平静变例', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5'] },
  { eco: 'C52', name: 'Evans Gambit', nameZh: '埃文斯弃兵', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Bc5', 'b4'] },
  { eco: 'C55', name: 'Two Knights Defence', nameZh: '双马防御', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bc4', 'Nf6'] },
  { eco: 'C60', name: 'Ruy Lopez', nameZh: '西班牙开局', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'C65', name: 'Ruy Lopez, Berlin Defence', nameZh: '西班牙开局·柏林防御', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'Nf6'] },
  { eco: 'C68', name: 'Ruy Lopez, Exchange Variation', nameZh: '西班牙开局·兑换变例', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Bxc6'] },
  { eco: 'C84', name: 'Ruy Lopez, Closed', nameZh: '西班牙开局·封闭变例', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'a6', 'Ba4', 'Nf6', 'O-O', 'Be7'] },
  { eco: 'C63', name: 'Ruy Lopez, Schliemann Defence', nameZh: '西班牙开局·施利曼防御', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'f5'] },
  { eco: 'C65', name: 'Ruy Lopez, Steinitz Defence', nameZh: '西班牙开局·斯坦尼茨防御', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Bb5', 'd6'] },
  { eco: 'C45', name: 'Scotch Game', nameZh: '苏格兰开局', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4'] },
  { eco: 'C45', name: 'Scotch Game, Mieses Variation', nameZh: '苏格兰开局·米泽斯变例', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd4', 'exd4', 'Nxd4', 'Nf6'] },
  { eco: 'C47', name: 'Four Knights Game', nameZh: '四马开局', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'Nc3', 'Nf6'] },
  { eco: 'C25', name: 'Vienna Game', nameZh: '维也纳开局', moves: ['e4', 'e5', 'Nc3'] },
  { eco: 'C33', name: "King's Gambit", nameZh: '王翼弃兵', moves: ['e4', 'e5', 'f4'] },
  { eco: 'C23', name: "Bishop's Opening", nameZh: '象开局', moves: ['e4', 'e5', 'Bc4'] },
  { eco: 'C42', name: 'Petrov Defence', nameZh: '彼得罗夫防御', moves: ['e4', 'e5', 'Nf3', 'Nf6'] },
  { eco: 'C41', name: 'Philidor Defence', nameZh: '菲利多尔防御', moves: ['e4', 'e5', 'Nf3', 'd6'] },
  { eco: 'C44', name: "King's Gambit Declined", nameZh: '王翼弃兵拒吃', moves: ['e4', 'e5', 'Nf3', 'Nc6', 'd3'] },

  // --- Sicilian ---------------------------------------------------------
  { eco: 'B20', name: 'Sicilian Defence', nameZh: '西西里防御', moves: ['e4', 'c5'] },
  { eco: 'B22', name: 'Sicilian, Alapin Variation', nameZh: '西西里·阿拉平变例', moves: ['e4', 'c5', 'c3'] },
  { eco: 'B23', name: 'Sicilian, Closed', nameZh: '西西里·封闭变例', moves: ['e4', 'c5', 'Nc3'] },
  { eco: 'B21', name: 'Sicilian, Smith-Morra Gambit', nameZh: '西西里·史密斯-莫拉弃兵', moves: ['e4', 'c5', 'd4'] },
  { eco: 'B31', name: 'Sicilian, Rossolimo Variation', nameZh: '西西里·罗索里莫变例', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'Bb5'] },
  { eco: 'B51', name: 'Sicilian, Moscow Variation', nameZh: '西西里·莫斯科变例', moves: ['e4', 'c5', 'Nf3', 'd6', 'Bb5+'] },
  { eco: 'B90', name: 'Sicilian, Najdorf Variation', nameZh: '西西里·纳伊多夫变例', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3', 'a6'] },
  { eco: 'B34', name: 'Sicilian, Accelerated Dragon', nameZh: '西西里·加速龙式', moves: ['e4', 'c5', 'Nf3', 'Nc6', 'd4', 'cxd4', 'Nxd4', 'g6'] },
  { eco: 'B47', name: 'Sicilian, Taimanov Variation', nameZh: '西西里·泰马诺夫变例', moves: ['e4', 'c5', 'Nf3', 'e6', 'd4', 'cxd4', 'Nxd4', 'Nc6'] },
  { eco: 'B40', name: 'Sicilian, French Variation', nameZh: '西西里·法兰西变例', moves: ['e4', 'c5', 'Nf3', 'e6'] },
  { eco: 'B50', name: 'Sicilian, Classical Variation', nameZh: '西西里·古典变例', moves: ['e4', 'c5', 'Nf3', 'd6', 'd4', 'cxd4', 'Nxd4', 'Nf6', 'Nc3'] },

  // --- French / Caro-Kann / others vs e4 --------------------------------
  { eco: 'C00', name: 'French Defence', nameZh: '法兰西防御', moves: ['e4', 'e6'] },
  { eco: 'C15', name: 'French, Winawer Variation', nameZh: '法兰西·维纳维尔变例', moves: ['e4', 'e6', 'd4', 'd5', 'Nc3', 'Bb4'] },
  { eco: 'C03', name: 'French, Tarrasch Variation', nameZh: '法兰西·塔拉什变例', moves: ['e4', 'e6', 'd4', 'd5', 'Nd2'] },
  { eco: 'C02', name: 'French, Advance Variation', nameZh: '法兰西·前进变例', moves: ['e4', 'e6', 'd4', 'd5', 'e5'] },
  { eco: 'B10', name: 'Caro-Kann Defence', nameZh: '卡罗-卡恩防御', moves: ['e4', 'c6'] },
  { eco: 'B12', name: 'Caro-Kann, Advance Variation', nameZh: '卡罗-卡恩·前进变例', moves: ['e4', 'c6', 'd4', 'd5', 'e5'] },
  { eco: 'B18', name: 'Caro-Kann, Classical Variation', nameZh: '卡罗-卡恩·古典变例', moves: ['e4', 'c6', 'd4', 'd5', 'Nc3', 'dxe4', 'Nxe4', 'Bf5'] },
  { eco: 'B01', name: 'Scandinavian Defence', nameZh: '斯堪的纳维亚防御', moves: ['e4', 'd5'] },
  { eco: 'B02', name: 'Alekhine Defence', nameZh: '阿廖欣防御', moves: ['e4', 'Nf6'] },
  { eco: 'B07', name: 'Pirc Defence', nameZh: '皮尔茨防御', moves: ['e4', 'd6'] },
  { eco: 'B06', name: 'Modern Defence', nameZh: '现代防御', moves: ['e4', 'g6'] },
  { eco: 'A40', name: "Queen's Pawn, Englund Gambit", nameZh: '后兵·恩格伦德弃兵', moves: ['d4', 'e5'] },

  // --- 1.d4 d5 ----------------------------------------------------------
  { eco: 'D06', name: "Queen's Gambit", nameZh: '后翼弃兵', moves: ['d4', 'd5', 'c4'] },
  { eco: 'D20', name: "Queen's Gambit Accepted", nameZh: '接受后翼弃兵', moves: ['d4', 'd5', 'c4', 'dxc4'] },
  { eco: 'D10', name: 'Slav Defence', nameZh: '斯拉夫防御', moves: ['d4', 'd5', 'c4', 'c6'] },
  { eco: 'D30', name: "Queen's Gambit Declined", nameZh: '拒吃后翼弃兵', moves: ['d4', 'd5', 'c4', 'e6'] },
  { eco: 'D37', name: 'QGD, Orthodox Defence', nameZh: '正统防御', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6'] },
  { eco: 'D53', name: 'QGD, Classical Variation', nameZh: '正统防御·古典变例', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'Nf6', 'Bg5'] },
  { eco: 'D32', name: 'Tarrasch Defence', nameZh: '塔拉什防御', moves: ['d4', 'd5', 'c4', 'e6', 'Nc3', 'c5'] },
  { eco: 'D06', name: 'Marshall Defence', nameZh: '马歇尔防御', moves: ['d4', 'd5', 'c4', 'Nf6'] },
  { eco: 'D04', name: 'Colle System', nameZh: '科莱体系', moves: ['d4', 'd5', 'Nf3', 'Nf6', 'e3'] },

  // --- Indian defences --------------------------------------------------
  { eco: 'E60', name: "King's Indian Defence", nameZh: '王印度防御', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'Bg7'] },
  { eco: 'E20', name: 'Nimzo-Indian Defence', nameZh: '尼姆佐-印度防御', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nc3', 'Bb4'] },
  { eco: 'E12', name: "Queen's Indian Defence", nameZh: '后印度防御', moves: ['d4', 'Nf6', 'c4', 'e6', 'Nf3', 'b6'] },
  { eco: 'D80', name: 'Grünfeld Defence', nameZh: '格林菲尔德防御', moves: ['d4', 'Nf6', 'c4', 'g6', 'Nc3', 'd5'] },
  { eco: 'A56', name: 'Benoni Defence', nameZh: '贝诺尼防御', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5'] },
  { eco: 'A57', name: 'Benko Gambit', nameZh: '本科弃兵', moves: ['d4', 'Nf6', 'c4', 'c5', 'd5', 'b5'] },
  { eco: 'A80', name: 'Dutch Defence', nameZh: '荷兰防御', moves: ['d4', 'f5'] },
  { eco: 'A45', name: 'Indian Defence', nameZh: '印度防御', moves: ['d4', 'Nf6'] },
  { eco: 'A07', name: "King's Indian Attack", nameZh: '王印度攻击', moves: ['Nf3', 'd5', 'g3'] },
  { eco: 'A04', name: 'Réti Opening, King-side', nameZh: '列蒂开局·王翼', moves: ['Nf3', 'Nf6', 'c4'] },
];

/** Longest opening whose move list is a prefix of `history` (SAN). */
export function lookupOpening(history: string[]): { opening: Opening; plies: number } | null {
  let best: { opening: Opening; plies: number } | null = null;
  for (const opening of OPENINGS) {
    if (opening.moves.length > history.length) continue;
    let matches = true;
    for (let i = 0; i < opening.moves.length; i++) {
      if (opening.moves[i] !== history[i]) {
        matches = false;
        break;
      }
    }
    if (matches && (!best || opening.moves.length > best.plies)) best = { opening, plies: opening.moves.length };
  }
  return best;
}

/** Book continuations available after `history` (SAN moves to choose from). */
export function bookContinuations(history: string[]): string[] {
  const out = new Set<string>();
  for (const opening of OPENINGS) {
    if (opening.moves.length <= history.length) continue;
    let matches = true;
    for (let i = 0; i < history.length; i++) {
      if (opening.moves[i] !== history[i]) {
        matches = false;
        break;
      }
    }
    if (matches) out.add(opening.moves[history.length]);
  }
  return [...out];
}

/**
 * True while the played moves are still a prefix of *some* book line, i.e. the
 * game has not yet left known theory.
 */
export function isBookPosition(history: string[]): boolean {
  if (!history.length) return true;
  return OPENINGS.some(
    opening => opening.moves.length >= history.length && history.every((san, index) => opening.moves[index] === san),
  );
}

/** True when the last move of `history` was itself a book move. */
export function isBookMove(history: string[]): boolean {
  if (!history.length) return false;
  return bookContinuations(history.slice(0, -1)).includes(history[history.length - 1]);
}

export function openingName(opening: Opening, locale: 'zh' | 'en'): string {
  return locale === 'zh' ? opening.nameZh : opening.name;
}
