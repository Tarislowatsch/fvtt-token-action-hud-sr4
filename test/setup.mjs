import { vi } from 'vitest';

vi.stubGlobal('game', {
  i18n: { localize: (key) => key },
  sr4: {
    dialogUtility: {
      openActionDialog: vi.fn(),
      handleSkillRoll:  vi.fn(),
      handleAttackRoll: vi.fn(),
      handleFreeRoll:   vi.fn(),
    },
    SpellcastingFlow: { start: vi.fn() },
    reloadWeapon: vi.fn().mockResolvedValue(undefined),
  },
  tokenActionHud: { update: vi.fn() },
});

vi.stubGlobal('ui', {
  notifications: { warn: vi.fn() },
});

vi.stubGlobal('foundry', {
  applications: { api: { DialogV2: { wait: vi.fn() } } },
});

vi.stubGlobal('Hooks', { once: vi.fn(), call: vi.fn() });
