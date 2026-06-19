/*
 * Copyright (C) 2026
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */

import { describe, expect, it } from 'vitest';
import { normalizeACLPolicy } from './normalizers';

describe('normalizeACLPolicy', () => {
  it('preserves modern and future policy fields', () => {
    const policy = normalizeACLPolicy({
      grants: [],
      nodeAttrs: [{ target: ['*'], attr: ['magicdns-aaaa'] }],
      autoApprovers: { routes: { '10.0.0.0/8': ['tag:router'] }, exitNode: ['tag:exit'] },
      randomizeClientPort: true,
      sshTests: [{ src: 'alice@' }],
      futurePolicyField: { enabled: true },
    });

    expect(policy?.grants).toEqual([]);
    expect(policy?.nodeAttrs).toEqual([{ target: ['*'], attr: ['magicdns-aaaa'] }]);
    expect(policy?.autoApprovers?.routes).toEqual({ '10.0.0.0/8': ['tag:router'] });
    expect(policy?.randomizeClientPort).toBe(true);
    expect(policy?.futurePolicyField).toEqual({ enabled: true });
  });
});
