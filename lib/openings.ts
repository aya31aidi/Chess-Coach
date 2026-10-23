/**
 * A small opening book: enough to name the common openings and to mark early
 * moves as "Book" while a game still follows known theory. Lines are written
 * in SAN, the same notation chess.js puts in the move history.
 */

export interface Opening {
  eco: string;
  name: string;
  moves: string[];
}

const BOOK: [string, string, string][] = [
  // 1.e4 e5
  ['C20', "King's Pawn Game", 'e4 e5'],
  ['C21', 'Center Game', 'e4 e5 d4 exd4'],
  ['C21', 'Danish Gambit', 'e4 e5 d4 exd4 c3'],
  ['C23', "Bishop's Opening", 'e4 e5 Bc4'],
  ['C25', 'Vienna Game', 'e4 e5 Nc3'],
  ['C30', "King's Gambit", 'e4 e5 f4'],
  ['C33', "King's Gambit Accepted", 'e4 e5 f4 exf4'],
  ['C40', "King's Knight Opening", 'e4 e5 Nf3'],
  ['C40', 'Latvian Gambit', 'e4 e5 Nf3 f5'],
  ['C41', 'Philidor Defence', 'e4 e5 Nf3 d6'],
  ['C42', 'Petrov Defence', 'e4 e5 Nf3 Nf6'],
  ['C42', 'Stafford Gambit', 'e4 e5 Nf3 Nf6 Nxe5 Nc6'],
  ['C44', "King's Pawn Game", 'e4 e5 Nf3 Nc6'],
  ['C44', 'Ponziani Opening', 'e4 e5 Nf3 Nc6 c3'],
  ['C44', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4'],
  ['C45', 'Scotch Game', 'e4 e5 Nf3 Nc6 d4 exd4 Nxd4'],
  ['C46', 'Three Knights Game', 'e4 e5 Nf3 Nc6 Nc3'],
  ['C47', 'Four Knights Game', 'e4 e5 Nf3 Nc6 Nc3 Nf6'],
  ['C50', 'Italian Game', 'e4 e5 Nf3 Nc6 Bc4'],
  ['C50', 'Giuoco Piano', 'e4 e5 Nf3 Nc6 Bc4 Bc5'],
  ['C51', 'Evans Gambit', 'e4 e5 Nf3 Nc6 Bc4 Bc5 b4'],
  ['C53', 'Giuoco Piano, Main Line', 'e4 e5 Nf3 Nc6 Bc4 Bc5 c3'],
  ['C55', 'Two Knights Defence', 'e4 e5 Nf3 Nc6 Bc4 Nf6'],
  ['C57', 'Two Knights Defence, Knight Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5'],
  ['C57', 'Traxler Counterattack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 Bc5'],
  ['C57', 'Fried Liver Attack', 'e4 e5 Nf3 Nc6 Bc4 Nf6 Ng5 d5 exd5 Nxd5 Nxf7'],
  ['C60', 'Ruy Lopez', 'e4 e5 Nf3 Nc6 Bb5'],
  ['C65', 'Ruy Lopez, Berlin Defence', 'e4 e5 Nf3 Nc6 Bb5 Nf6'],
  ['C68', 'Ruy Lopez, Exchange Variation', 'e4 e5 Nf3 Nc6 Bb5 a6 Bxc6'],
  ['C70', 'Ruy Lopez, Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6'],
  ['C78', 'Ruy Lopez, Morphy Defence', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6'],
  ['C84', 'Ruy Lopez, Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7'],
  ['C88', 'Ruy Lopez, Closed', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3'],
  ['C89', 'Ruy Lopez, Marshall Attack', 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 O-O c3 d5'],

  // 1.e4, other replies
  ['B00', "King's Pawn Opening", 'e4'],
  ['B00', 'Nimzowitsch Defence', 'e4 Nc6'],
  ['B00', 'Owen Defence', 'e4 b6'],
  ['B01', 'Scandinavian Defence', 'e4 d5'],
  ['B01', 'Scandinavian Defence, Main Line', 'e4 d5 exd5 Qxd5'],
  ['B02', 'Alekhine Defence', 'e4 Nf6'],
  ['B06', 'Modern Defence', 'e4 g6'],
  ['B07', 'Pirc Defence', 'e4 d6 d4 Nf6 Nc3 g6'],
  ['B10', 'Caro-Kann Defence', 'e4 c6'],
  ['B12', 'Caro-Kann, Advance Variation', 'e4 c6 d4 d5 e5'],
  ['B13', 'Caro-Kann, Exchange Variation', 'e4 c6 d4 d5 exd5 cxd5'],
  ['B18', 'Caro-Kann, Classical Variation', 'e4 c6 d4 d5 Nc3 dxe4 Nxe4 Bf5'],
  ['B20', 'Sicilian Defence', 'e4 c5'],
  ['B21', 'Sicilian, Smith-Morra Gambit', 'e4 c5 d4 cxd4 c3'],
  ['B22', 'Sicilian, Alapin Variation', 'e4 c5 c3'],
  ['B23', 'Sicilian, Closed', 'e4 c5 Nc3'],
  ['B27', 'Sicilian Defence', 'e4 c5 Nf3'],
  ['B30', 'Sicilian Defence', 'e4 c5 Nf3 Nc6'],
  ['B33', 'Sicilian, Sveshnikov Variation', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 Nf6 Nc3 e5'],
  ['B35', 'Sicilian, Accelerated Dragon', 'e4 c5 Nf3 Nc6 d4 cxd4 Nxd4 g6'],
  ['B40', 'Sicilian Defence', 'e4 c5 Nf3 e6'],
  ['B41', 'Sicilian, Kan Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 a6'],
  ['B44', 'Sicilian, Taimanov Variation', 'e4 c5 Nf3 e6 d4 cxd4 Nxd4 Nc6'],
  ['B50', 'Sicilian Defence', 'e4 c5 Nf3 d6'],
  ['B54', 'Open Sicilian', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4'],
  ['B56', 'Sicilian, Classical Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 Nc6'],
  ['B70', 'Sicilian, Dragon Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 g6'],
  ['B80', 'Sicilian, Scheveningen Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 e6'],
  ['B90', 'Sicilian, Najdorf Variation', 'e4 c5 Nf3 d6 d4 cxd4 Nxd4 Nf6 Nc3 a6'],
  ['C00', 'French Defence', 'e4 e6'],
  ['C01', 'French, Exchange Variation', 'e4 e6 d4 d5 exd5 exd5'],
  ['C02', 'French, Advance Variation', 'e4 e6 d4 d5 e5'],
  ['C03', 'French, Tarrasch Variation', 'e4 e6 d4 d5 Nd2'],
  ['C10', 'French Defence', 'e4 e6 d4 d5 Nc3'],
  ['C10', 'French, Rubinstein Variation', 'e4 e6 d4 d5 Nc3 dxe4'],
  ['C11', 'French, Classical Variation', 'e4 e6 d4 d5 Nc3 Nf6'],
  ['C15', 'French, Winawer Variation', 'e4 e6 d4 d5 Nc3 Bb4'],

  // 1.d4
  ['A40', "Queen's Pawn Opening", 'd4'],
  ['A40', 'Englund Gambit', 'd4 e5'],
  ['A43', 'Old Benoni Defence', 'd4 c5'],
  ['A45', 'Indian Defence', 'd4 Nf6'],
  ['A45', 'Trompowsky Attack', 'd4 Nf6 Bg5'],
  ['A45', 'London System', 'd4 Nf6 Bf4'],
  ['A46', 'Indian Defence', 'd4 Nf6 Nf3'],
  ['A50', 'Indian Defence', 'd4 Nf6 c4'],
  ['A56', 'Benoni Defence', 'd4 Nf6 c4 c5 d5'],
  ['A57', 'Benko Gambit', 'd4 Nf6 c4 c5 d5 b5'],
  ['A60', 'Modern Benoni', 'd4 Nf6 c4 c5 d5 e6'],
  ['A80', 'Dutch Defence', 'd4 f5'],
  ['D00', "Queen's Pawn Game", 'd4 d5'],
  ['D00', 'London System', 'd4 d5 Bf4'],
  ['D02', "Queen's Pawn Game", 'd4 d5 Nf3'],
  ['D06', "Queen's Gambit", 'd4 d5 c4'],
  ['D07', 'Chigorin Defence', 'd4 d5 c4 Nc6'],
  ['D08', 'Albin Countergambit', 'd4 d5 c4 e5'],
  ['D10', 'Slav Defence', 'd4 d5 c4 c6'],
  ['D20', "Queen's Gambit Accepted", 'd4 d5 c4 dxc4'],
  ['D30', "Queen's Gambit Declined", 'd4 d5 c4 e6'],
  ['D35', "Queen's Gambit Declined", 'd4 d5 c4 e6 Nc3 Nf6'],
  ['D43', 'Semi-Slav Defence', 'd4 d5 c4 c6 Nf3 Nf6 Nc3 e6'],
  ['D80', 'Grünfeld Defence', 'd4 Nf6 c4 g6 Nc3 d5'],
  ['E01', 'Catalan Opening', 'd4 Nf6 c4 e6 g3'],
  ['E10', 'Indian Defence', 'd4 Nf6 c4 e6 Nf3'],
  ['E11', 'Bogo-Indian Defence', 'd4 Nf6 c4 e6 Nf3 Bb4+'],
  ['E12', "Queen's Indian Defence", 'd4 Nf6 c4 e6 Nf3 b6'],
  ['E20', 'Nimzo-Indian Defence', 'd4 Nf6 c4 e6 Nc3 Bb4'],
  ['E60', "King's Indian Defence", 'd4 Nf6 c4 g6'],
  ['E61', "King's Indian Defence", 'd4 Nf6 c4 g6 Nc3 Bg7'],
  ['E90', "King's Indian Defence, Main Line", 'd4 Nf6 c4 g6 Nc3 Bg7 e4 d6 Nf3'],

  // Flank openings
  ['A00', 'Polish Opening', 'b4'],
  ['A00', 'Grob Opening', 'g4'],
  ['A01', 'Nimzo-Larsen Attack', 'b3'],
  ['A02', 'Bird Opening', 'f4'],
  ['A04', 'Réti Opening', 'Nf3'],
  ['A07', "King's Indian Attack", 'Nf3 d5 g3'],
  ['A09', 'Réti Opening', 'Nf3 d5 c4'],
  ['A10', 'English Opening', 'c4'],
  ['A16', 'English Opening, Anglo-Indian', 'c4 Nf6'],
  ['A20', "English Opening, King's English", 'c4 e5'],
  ['A30', 'English Opening, Symmetrical', 'c4 c5'],
];

export const OPENINGS: Opening[] = BOOK.map(([eco, name, line]) => ({ eco, name, moves: line.split(' ') }));

const startsWith = (seq: string[], prefix: string[]) =>
  prefix.length <= seq.length && prefix.every((m, i) => seq[i] === m);

/** The most specific opening whose moves the game has played so far. */
export function findOpening(history: string[]): Opening | null {
  let found: Opening | null = null;
  for (const o of OPENINGS) {
    if (startsWith(history, o.moves) && (!found || o.moves.length > found.moves.length)) found = o;
  }
  return found;
}

/** True while the first `plies` moves still follow one of the book lines. */
export function isBookLine(history: string[], plies: number): boolean {
  const played = history.slice(0, plies);
  return OPENINGS.some((o) => startsWith(o.moves, played));
}
