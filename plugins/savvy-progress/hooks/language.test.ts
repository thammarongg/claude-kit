import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'

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

type Case = {
  name: string
  option: string
  // Claude Code's settings as `$.settings.read()` returns them.
  settings: Record<string, unknown>
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
]

for (const c of cases) {
  test(`language: ${c.name}`, { options: { language: c.option } }, async ($, on) => {
    mock.clock(on)
    mock.env(on, c.env)
    on('settings.read', () => ({ value: c.settings }))
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })

    expect(await $.tool.call(plan as never)).toMatchObject({ result: REPORTED[c.expected] })
  })
}
