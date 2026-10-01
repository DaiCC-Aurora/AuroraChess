/**
 * UCI protocol parsing.
 *
 * Everything here is pure so it can be unit tested without an engine
 * (see `uci.test.ts`). The parser only understands what we actually consume:
 * `id`, `option`, `uciok`, `readyok`, `info` and `bestmove`.
 */

export interface EngineScore {
  /** `cp` = centipawns, `mate` = moves to mate (negative = getting mated). */
  type: 'cp' | 'mate';
  value: number;
  /** Present when the engine marks a bound, e.g. `score cp 30 lowerbound`. */
  bound?: 'lower' | 'upper';
}

export interface EngineInfo {
  depth: number;
  seldepth?: number;
  /** 1-based index when MultiPV is used. */
  multipv: number;
  score?: EngineScore;
  nodes?: number;
  nps?: number;
  hashfull?: number;
  timeMs?: number;
  pv: string[];
  /** `info string ...` payloads (engine status messages). */
  string?: string;
  /** `currmove` / `currmovenumber`, useful for slow searches. */
  currentMove?: string;
  currentMoveNumber?: number;
}

export interface UciOption {
  name: string;
  type: string;
  default?: string;
  min?: number;
  max?: number;
  var?: string[];
}

export interface BestMove {
  move: string;
  ponder?: string;
}

export function parseScoreToken(tokens: string[], index: number): EngineScore | undefined {
  const kind = tokens[index];
  const value = Number(tokens[index + 1]);
  if ((kind !== 'cp' && kind !== 'mate') || Number.isNaN(value)) return undefined;
  const bound = tokens[index + 2];
  return {
    type: kind,
    value,
    bound: bound === 'lowerbound' ? 'lower' : bound === 'upperbound' ? 'upper' : undefined,
  };
}

export function parseInfoLine(line: string): EngineInfo | null {
  if (!line.startsWith('info ')) return null;
  const tokens = line.split(/\s+/);
  const info: EngineInfo = { depth: 0, multipv: 1, pv: [] };

  for (let i = 1; i < tokens.length; i++) {
    switch (tokens[i]) {
      case 'depth':
        info.depth = Number(tokens[++i]) || 0;
        break;
      case 'seldepth':
        info.seldepth = Number(tokens[++i]) || undefined;
        break;
      case 'multipv':
        info.multipv = Number(tokens[++i]) || 1;
        break;
      case 'score':
        info.score = parseScoreToken(tokens, i + 1) ?? info.score;
        i += 2;
        break;
      case 'nodes':
        info.nodes = Number(tokens[++i]);
        break;
      case 'nps':
        info.nps = Number(tokens[++i]);
        break;
      case 'hashfull':
        info.hashfull = Number(tokens[++i]);
        break;
      case 'time':
        info.timeMs = Number(tokens[++i]);
        break;
      case 'currmove':
        info.currentMove = tokens[++i];
        break;
      case 'currmovenumber':
        info.currentMoveNumber = Number(tokens[++i]);
        break;
      case 'pv':
        // `pv` is always last; the rest of the line is the principal variation.
        info.pv = tokens.slice(i + 1).filter(t => t && t !== '(' && t !== ')');
        i = tokens.length;
        break;
      case 'string':
        info.string = tokens.slice(i + 1).join(' ');
        i = tokens.length;
        break;
      default:
        break;
    }
  }
  return info;
}

export function parseBestMove(line: string): BestMove | null {
  if (!line.startsWith('bestmove')) return null;
  const tokens = line.split(/\s+/);
  const move = tokens[1];
  if (!move) return null;
  const ponderIndex = tokens.indexOf('ponder');
  return {
    move,
    ponder: ponderIndex > 0 ? tokens[ponderIndex + 1] : undefined,
  };
}

export function parseOptionLine(line: string): UciOption | null {
  const match = /^option name (.+?) type (\w+)(.*)$/.exec(line);
  if (!match) return null;
  const [, name, type, rest] = match;
  const option: UciOption = { name, type };
  const def = / default ([^ ]+)/.exec(rest);
  if (def) option.default = def[1];
  const min = / min (-?\d+)/.exec(rest);
  if (min) option.min = Number(min[1]);
  const max = / max (-?\d+)/.exec(rest);
  if (max) option.max = Number(max[1]);
  const vars = [...rest.matchAll(/ var ([^ ]+)/g)].map(m => m[1]);
  if (vars.length) option.var = vars;
  return option;
}

export function formatSetOption(name: string, value: string | number | boolean): string {
  const normalized = typeof value === 'boolean' ? (value ? 'true' : 'false') : String(value);
  return `setoption name ${name} value ${normalized}`;
}

/** Splits a raw worker payload into clean protocol lines. */
export function splitEngineMessages(payload: string): string[] {
  return payload
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(Boolean);
}

/**
 * UCI move string -> parts. `e7e8q`, `e1g1` (castling is encoded as a king move).
 */
export function parseUciMove(uci: string): { from: string; to: string; promotion?: string } | null {
  const match = /^([a-h][1-8])([a-h][1-8])([qrbn])?$/.exec(uci.trim());
  if (!match) return null;
  return { from: match[1], to: match[2], promotion: match[3] };
}
