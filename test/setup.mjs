import { vi } from 'vitest';

vi.stubGlobal('game', {
  i18n: { localize: (key) => key },
  sr4: {
    dialogUtility: {
      openActionDialog: vi.fn(),
      openMatrixActionDialog: vi.fn(),
      handleSkillRoll:  vi.fn(),
      handleAttackRoll: vi.fn(),
      handleFreeRoll:   vi.fn(),
    },
    SpellcastingFlow: { start: vi.fn() },
    SummoningFlow: { start: vi.fn(), startWatcher: vi.fn() },
    ThreadingFlow: { start: vi.fn() },
    DismissalFlow: { start: vi.fn() },
    BindingFlow: { startTargeted: vi.fn() },
    ActionCategory: { MATRIX: 'MATRIX', RIGGING: 'RIGGING' },
    reloadWeapon: vi.fn().mockResolvedValue(undefined),
    rigging: {
      ControlModes: { AUTONOMOUS: 'autonomous', REMOTE: 'remote', JUMPED: 'jumped' },
      DroneActions: { MANEUVERING: 'maneuvering', PERCEPTION: 'perception', INFILTRATION: 'infiltration' },
      resolveRigger: vi.fn().mockResolvedValue(null),
      resolveDronePool: vi.fn().mockReturnValue({ pool: 5, parts: [], warnings: [] }),
      openDroneRollDialog: vi.fn(),
      openDroneAttackDialog: vi.fn(),
    },
    initiative: {
      REALMS: ['physical', 'matrix', 'astral'],
      getAvailableRealms: vi.fn().mockReturnValue(['physical']),
      getCombatantRealm: vi.fn().mockReturnValue('physical'),
    },
  },
  combat: null,
  tokenActionHud: { update: vi.fn() },
});

vi.stubGlobal('ui', {
  notifications: { warn: vi.fn() },
});

vi.stubGlobal('foundry', {
  applications: { api: { DialogV2: { wait: vi.fn() } } },
});

vi.stubGlobal('Hooks', { once: vi.fn(), call: vi.fn() });
