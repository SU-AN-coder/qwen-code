/**
 * @license
 * Copyright 2026 Qwen Team
 * SPDX-License-Identifier: Apache-2.0
 */

import { describe, expect, it } from 'vitest';
import {
  MAX_INDEX_CHARS,
  MAX_INDEX_LINE_CHARS,
  MAX_INDEX_LINES,
  selectIndexEntries,
  trimIndexToBudget,
} from './index-budget.js';

describe('trimIndexToBudget', () => {
  it('keeps empty and within-budget content unchanged', () => {
    expect(trimIndexToBudget([])).toBe('');
    const lines = ['- [One](notes/one.md)', '', '- [Two](notes/two.md)'];
    expect(trimIndexToBudget(lines)).toBe(lines.join('\n'));
  });

  it('keeps exactly 200 lines and excludes later entries', () => {
    const lines = Array.from(
      { length: MAX_INDEX_LINES + 1 },
      (_, i) => `- [Note ${i}](notes/${i}.md)`,
    );
    expect(trimIndexToBudget(lines)).toBe(
      lines.slice(0, MAX_INDEX_LINES).join('\n'),
    );
  });

  it('retains a complete entry at the character limit and drops one over it', () => {
    const entry = `- [Boundary](notes/${'a'.repeat(MAX_INDEX_CHARS - 23)}.md)`;
    expect(entry).toHaveLength(MAX_INDEX_CHARS);
    expect(trimIndexToBudget([entry])).toBe(entry);
    expect(trimIndexToBudget([`${entry}x`])).toBe('');
  });

  it('counts newline separators in the budget', () => {
    const first = 'a'.repeat(12_500);
    const second = 'b'.repeat(12_499);
    expect(trimIndexToBudget([first, second])).toBe(`${first}\n${second}`);
    expect(trimIndexToBudget([first, `${second}b`])).toBe(first);
  });

  it('drops an oversized first entry without cutting its percent-encoded target', () => {
    const oversized = `- [Oversized](notes/${'%28'.repeat(9_000)}.md)`;
    const kept = '- [Kept](notes/kept%28note%29.md)';
    expect(trimIndexToBudget([oversized, kept])).toBe(kept);
  });

  it('reserves space for ordinary entries and preserves the retained order', () => {
    const first = `- [First](notes/${'a'.repeat(10_000)}.md)`;
    const second = `- [Second](notes/${'b'.repeat(15_000)}.md)`;
    const ordinary = '- [Ordinary](notes/ordinary.md)';
    expect(trimIndexToBudget([first, second, ordinary])).toBe(
      `${first}\n${ordinary}`,
    );
  });

  it('does not replace the existing code-unit limit with UTF-8 bytes', () => {
    const entry = '😀'.repeat(MAX_INDEX_CHARS / 2);
    expect(trimIndexToBudget([entry])).toBe(entry);
    expect(trimIndexToBudget([`${entry}😀`])).toBe('');
  });
});

describe('selectIndexEntries', () => {
  it('reports the entries a legal-length store loses to the character budget', () => {
    // 175 entries of exactly MAX_INDEX_LINE_CHARS: every line is legal and the
    // line cap is never reached, but 175 × 150 + 174 separators exceeds
    // MAX_INDEX_CHARS — the count is what overflows.
    const lines = Array.from({ length: 175 }, (_, i) => {
      const prefix = `- [Memory ${i}](memory-${i}.md) — `;
      return `${prefix}${'h'.repeat(MAX_INDEX_LINE_CHARS - prefix.length)}`;
    });
    expect(Math.max(...lines.map((line) => line.length))).toBe(
      MAX_INDEX_LINE_CHARS,
    );

    const { kept, dropped } = selectIndexEntries(lines);

    expect(kept).toHaveLength(165);
    expect(dropped).toEqual(Array.from({ length: 10 }, (_, i) => 165 + i));
  });

  it('reports lines past MAX_INDEX_LINES as dropped even when each one fits', () => {
    const lines = Array.from(
      { length: MAX_INDEX_LINES + 3 },
      (_, i) => `- [Note ${i}](notes/${i}.md)`,
    );

    const { kept, dropped } = selectIndexEntries(lines);

    expect(kept).toEqual(Array.from({ length: MAX_INDEX_LINES }, (_, i) => i));
    expect(dropped).toEqual([
      MAX_INDEX_LINES,
      MAX_INDEX_LINES + 1,
      MAX_INDEX_LINES + 2,
    ]);
  });

  it('reports nothing dropped for empty and within-budget content', () => {
    expect(selectIndexEntries([])).toEqual({ kept: [], dropped: [] });
    expect(
      selectIndexEntries(['- [One](notes/one.md)', '- [Two](notes/two.md)']),
    ).toEqual({ kept: [0, 1], dropped: [] });
  });

  it('stays consistent with trimIndexToBudget on every fixture', () => {
    const fixtures: string[][] = [
      [],
      ['- [One](notes/one.md)', '', '- [Two](notes/two.md)'],
      Array.from(
        { length: MAX_INDEX_LINES + 1 },
        (_, i) => `- [Note ${i}](notes/${i}.md)`,
      ),
      [
        `- [Oversized](notes/${'%28'.repeat(9_000)}.md)`,
        '- [Kept](notes/kept.md)',
      ],
      [
        `- [First](notes/${'a'.repeat(10_000)}.md)`,
        `- [Second](notes/${'b'.repeat(15_000)}.md)`,
        '- [Ordinary](notes/ordinary.md)',
      ],
    ];
    for (const lines of fixtures) {
      const { kept } = selectIndexEntries(lines);
      expect(trimIndexToBudget(lines)).toBe(
        kept.map((index) => lines[index]).join('\n'),
      );
    }
  });
});
