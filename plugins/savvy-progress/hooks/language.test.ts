import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const STEP = 'mcp__savvy-progress__step'

const plan = {
  tool: PROGRESS,
  title: 'Pick a language',
  phase: 'delegate',
  tasks: [
    { title: 'First task', tier: 'light' },
    { title: 'Second task', tier: 'light' },
  ],
} as const

// What the tool answers once a plan is reported, per detected language.
const REPORTED = { en: 'ok: Tasks 0/2', th: 'ok: งาน 0/2', ru: 'ok: Задачи 0/2' } as const
// What the step tool answers the main session, which is not a worker.
const IGNORED = {
  en: 'ignored: only subagents report steps',
  th: 'ignored: เฉพาะซับเอเจนต์เท่านั้นที่รายงานขั้นตอนได้',
  ru: 'ignored: о шагах сообщают только субагенты',
} as const

// What the progress tool answers a subagent: the flow is the main session's to report.
const MAIN_ONLY = {
  en: 'ignored: only the main session reports the flow',
  th: 'ignored: เฉพาะเซสชันหลักเท่านั้นที่รายงานความคืบหน้าของ flow ได้',
  ru: 'ignored: о ходе потока сообщает только основная сессия',
} as const

type Case = {
  name: string
  option: string
  // Claude Code's settings as `$.settings.read()` returns them; null when reading them fails.
  settings: Record<string, unknown> | null
  // The environment as `$.env.get` sees it: a variable left out is unset.
  env: Record<string, string>
  expected: keyof typeof REPORTED
}

const cases: readonly Case[] = [
  {
    name: 'the option th wins over a Russian setting',
    option: 'th',
    settings: { language: 'Russian' },
    env: {},
    expected: 'th',
  },
  {
    name: 'auto reads the language setting (ไทย)',
    option: 'auto',
    settings: { language: 'ไทย' },
    env: {},
    expected: 'th',
  },
  {
    name: 'auto: a setting, when present, wins over the locale',
    option: 'auto',
    settings: { language: 'English' },
    env: { LANG: 'th_TH.UTF-8' },
    expected: 'en',
  },
  {
    name: 'auto without a language setting falls back to LANG',
    option: 'auto',
    settings: {},
    env: { LANG: 'th_TH.UTF-8' },
    expected: 'th',
  },
  {
    name: 'auto without a language setting reads LC_ALL before LANG',
    option: 'auto',
    settings: {},
    env: { LC_ALL: 'ru_RU.UTF-8', LANG: 'th_TH.UTF-8' },
    expected: 'ru',
  },
  {
    name: 'auto: a locale that only starts with "th" (the_XX) is not Thai',
    option: 'auto',
    settings: {},
    env: { LANG: 'the_XX' },
    expected: 'en',
  },
  {
    name: 'auto without a language setting reads LC_MESSAGES before LANG',
    option: 'auto',
    settings: {},
    env: { LC_MESSAGES: 'th_TH.UTF-8', LANG: 'ru_RU.UTF-8' },
    expected: 'th',
  },
  {
    name: 'auto falls back to the locale when the settings cannot be read',
    option: 'auto',
    settings: null,
    env: { LANG: 'th_TH.UTF-8' },
    expected: 'th',
  },
  {
    name: 'auto ignores a language setting that is only whitespace',
    option: 'auto',
    settings: { language: '   ' },
    env: { LANG: 'th_TH.UTF-8' },
    expected: 'th',
  },
]

for (const c of cases) {
  test(`language: ${c.name}`, { options: { language: c.option } }, async ($, on) => {
    mock.clock(on)
    mock.env(on, c.env)
    on('settings.read', () => (c.settings ? { value: c.settings } : { deny: 'settings are unreadable' }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

    expect(await $.tool.call(plan as never)).toMatchObject({ result: REPORTED[c.expected] })
    expect(await $.tool.call({ tool: STEP, done: 1 } as never)).toMatchObject({ result: IGNORED[c.expected] })
    expect(await $.tool.call({ tool: PROGRESS, agentId: 'a1', title: 'Not mine' } as never)).toMatchObject({ result: MAIN_ONLY[c.expected] })
  })
}
