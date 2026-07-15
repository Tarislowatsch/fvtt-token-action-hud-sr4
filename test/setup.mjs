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
    rigging: {
      ControlModes: { AUTONOMOUS: 'autonomous', REMOTE: 'remote', JUMPED: 'jumped' },
      DroneActions: { MANEUVERING: 'maneuvering', PERCEPTION: 'perception', INFILTRATION: 'infiltration' },
      resolveRigger: vi.fn().mockResolvedValue(null),
      resolveDronePool: vi.fn().mockReturnValue({ pool: 5, parts: [], warnings: [] }),
      openDroneRollDialog: vi.fn(),
      openDroneAttackDialog: vi.fn(),
    },
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
