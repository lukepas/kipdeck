// The commands `kipdeck <command>` runs instead of starting the office: one line each, loaded only
// when it's the one asked for. A command takes the arguments after its name and gives back the exit
// code. A new command is a module of its own and a line here (and its lines in config.ts's help).

export type Command = (argv: string[]) => Promise<number> | number;

export const COMMANDS: Readonly<Record<string, Command>> = {
  prune: async (argv) => (await import('./prune.js')).prune(argv),
  accounts: async (argv) => (await import('./accounts.js')).accountsCommand(argv),
  setup: async (argv) => (await import('./setup.js')).setupCommand(argv),
  tunnel: async (argv) => (await import('./tunnel/index.js')).tunnelCommand(argv),
  attach: async (argv) => (await import('./attach.js')).attachCommand(argv),
  open: async (argv) => (await import('./opencmd.js')).openCommand(argv),
  rundown: async (argv) => (await import('./rundown/command.js')).rundownCommand(argv),
};

/** The command `argv` names first, if it names one. */
export function commandOf(argv: readonly string[]): Command | undefined {
  const name = argv[0];
  return name !== undefined && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
}
