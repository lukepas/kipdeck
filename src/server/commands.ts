// The commands `kipdeck <command>` runs instead of starting the office: one line each, loaded only
// when it's the one asked for. A command takes the arguments after its name and gives back the exit
// code. A new command is a module of its own, a line here and its lines in COMMANDS_HELP (which
// config.ts puts in --help).

export type Command = (argv: string[]) => Promise<number> | number;

export const COMMANDS: Readonly<Record<string, Command>> = {
  prune: async (argv) => (await import('./prune.js')).prune(argv),
  accounts: async (argv) => (await import('./accounts.js')).accountsCommand(argv),
  setup: async (argv) => (await import('./setup.js')).setupCommand(argv),
  tunnel: async (argv) => (await import('./tunnel/index.js')).tunnelCommand(argv),
  attach: async (argv) => (await import('./attach.js')).attachCommand(argv),
  open: async (argv) => (await import('./opencmd.js')).openCommand(argv),
  rundown: async (argv) => (await import('./rundown/command.js')).rundownCommand(argv),
  decide: async (argv) => (await import('./rundown/decide.js')).decideCommand(argv),
};

/** The command `argv` names first, if it names one. */
export function commandOf(argv: readonly string[]): Command | undefined {
  const name = argv[0];
  return name !== undefined && Object.hasOwn(COMMANDS, name) ? COMMANDS[name] : undefined;
}

/** The Commands part of `kipdeck --help` (config.ts), a few lines for each command above. */
export const COMMANDS_HELP = `Commands:
  open                    Open the running Kipdeck in your browser, signed in
                          (a new sign-in link; see open --help)
  attach                  Move an agent you started in a terminal (Claude Code,
                          Codex, Cursor) into the inbox: its session carries on
                          as one of Kipdeck's agents (see attach --help)
  setup                   Pick the folder projects are cloned into and clone
                          projects into it: a walkthrough in a terminal, or
                          just --projects / --project for scripts (see setup --help)
  prune                   Remove leftover agent worktrees (.agent-office/worktrees/)
                          and their office/* branches. Anything with uncommitted
                          changes or unpushed commits is kept unless --force is given.
  accounts                Invite, list and revoke people's own accounts, and switch
                          the shared password off or on (see accounts --help)
  tunnel                  On your own computer, for a Kipdeck that runs somewhere
                          else: every web server an agent starts there opens on the
                          same port here, by itself (see tunnel --help)
  rundown                 Write or refresh a checkout's project map in .rundown/,
                          no Claude needed; rundown install adds the /rundown
                          skill to Claude Code (see rundown --help)
  decide                  For agents: ask a person to make a call, as an open
                          decision in .rundown/decisions.md that shows in Needs
                          you; go on with the default meanwhile (see decide --help)
`;
