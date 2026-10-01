import { describe, expect, it } from 'vitest';
import {
  formatSetOption,
  parseBestMove,
  parseInfoLine,
  parseOptionLine,
  parseUciMove,
  splitEngineMessages,
} from './uci';

describe('UCI parsing', () => {
  it('parses a full info line with MultiPV and a principal variation', () => {
    const info = parseInfoLine(
      'info depth 18 seldepth 24 multipv 2 score cp -34 lowerbound nodes 1234567 nps 987654 hashfull 120 tbhits 3 time 1250 pv e7e5 g1f3 b8c6',
    );
    expect(info).toMatchObject({
      depth: 18,
      seldepth: 24,
      multipv: 2,
      nodes: 1234567,
      nps: 987654,
      hashfull: 120,
      timeMs: 1250,
    });
    expect(info?.score).toEqual({ type: 'cp', value: -34, bound: 'lower' });
    expect(info?.pv).toEqual(['e7e5', 'g1f3', 'b8c6']);
  });

  it('parses mate scores', () => {
    const info = parseInfoLine('info depth 12 score mate 3 pv d1h5 g6h5');
    expect(info?.score).toEqual({ type: 'mate', value: 3, bound: undefined });
    expect(info?.pv).toEqual(['d1h5', 'g6h5']);
  });

  it('parses info string messages', () => {
    const info = parseInfoLine('info string NNUE evaluation using nn-61e7af4bb97d.nnue');
    expect(info?.string).toBe('NNUE evaluation using nn-61e7af4bb97d.nnue');
  });

  it('ignores non-info lines', () => {
    expect(parseInfoLine('bestmove e2e4')).toBeNull();
    expect(parseInfoLine('uciok')).toBeNull();
  });

  it('parses bestmove with and without a ponder move', () => {
    expect(parseBestMove('bestmove e2e4 ponder e7e5')).toEqual({ move: 'e2e4', ponder: 'e7e5' });
    expect(parseBestMove('bestmove e7e8q')).toEqual({ move: 'e7e8q', ponder: undefined });
    expect(parseBestMove('bestmove (none)')).toEqual({ move: '(none)', ponder: undefined });
  });

  it('parses engine option declarations including ranges', () => {
    expect(parseOptionLine('option name UCI_Elo type spin default 1320 min 1320 max 3190')).toEqual({
      name: 'UCI_Elo',
      type: 'spin',
      default: '1320',
      min: 1320,
      max: 3190,
    });
    expect(parseOptionLine('option name UCI_LimitStrength type check default false')).toEqual({
      name: 'UCI_LimitStrength',
      type: 'check',
      default: 'false',
    });
    expect(parseOptionLine('option name Skill Level type spin default 20 min 0 max 20')).toMatchObject({
      name: 'Skill Level',
      min: 0,
      max: 20,
    });
    const combo = parseOptionLine('option name Style type combo default Normal var Solid var Normal var Risky');
    expect(combo?.var).toEqual(['Solid', 'Normal', 'Risky']);
  });

  it('formats setoption commands', () => {
    expect(formatSetOption('UCI_LimitStrength', true)).toBe('setoption name UCI_LimitStrength value true');
    expect(formatSetOption('UCI_Elo', 1600)).toBe('setoption name UCI_Elo value 1600');
  });

  it('splits multi-line worker payloads', () => {
    expect(splitEngineMessages('info depth 1\r\n\r\nbestmove e2e4\n')).toEqual(['info depth 1', 'bestmove e2e4']);
  });

  it('parses UCI moves, rejecting malformed input', () => {
    expect(parseUciMove('e2e4')).toEqual({ from: 'e2', to: 'e4', promotion: undefined });
    expect(parseUciMove('e7e8q')).toEqual({ from: 'e7', to: 'e8', promotion: 'q' });
    expect(parseUciMove('O-O')).toBeNull();
    expect(parseUciMove('z9z9')).toBeNull();
  });
});
