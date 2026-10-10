import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

// Text colour of each palette, and the rule that hides one behind the system's preference.
const LIGHT_TEXT = '.t{fill:#1f1f1f}'
const DARK_TEXT = '.t{fill:#ececec}'
const BY_SYSTEM = '@media (prefers-color-scheme: dark)'

// A session whose `/config` holds `setting` as its theme, with a flow planned for two tiers.
const session = async ($: Engine, on: On, setting: string | undefined) => {
  mock.clock(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('settings.read', () => ({ value: {} }))
  mock.env(on, {})
  on('config.list', () => ({ value: setting === undefined ? [] : [{ key: 'theme', label: 'Theme', kind: 'enum', value: setting, provider: 'engine', isLocked: false }] }) as never)
  on('config.set', (_$, e) => ({ value: e.value }))
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PROGRESS, title: 'Ship the thing', phase: 'delegate', tasks: [{ title: 'Cook', tier: 'medium' }, { title: 'Count', tier: 'haiku' }] } as never)
}

// Every drawing of the panel and the band, joined.
const drawings = async ($: Engine) => {
  const panel = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const row = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  return [...(await panel.findAll({ type: 'Svg' })), ...(await row.findAll({ type: 'Svg' }))].map(el => String(el.props.source))
}

for (const [setting, mine, other] of [
  ['dark', DARK_TEXT, LIGHT_TEXT],
  ['light', LIGHT_TEXT, DARK_TEXT],
  ['light-daltonized', LIGHT_TEXT, DARK_TEXT],
  ['dark-ansi', DARK_TEXT, LIGHT_TEXT],
] as const) {
  test(`theme: Claude Code's ${setting} theme gives every drawing that palette alone`, async ($, on) => {
    await session($, on, setting)
    for (const source of await drawings($)) {
      expect(source).toContain(mine)
      expect(source).not.toContain(other)
      expect(source).not.toContain(BY_SYSTEM)
    }
  })
}

for (const setting of [undefined, 'auto'] as const) {
  test(`theme: with ${setting ?? 'no'} theme setting the system's preference decides`, async ($, on) => {
    await session($, on, setting)
    for (const source of await drawings($)) {
      expect(source).toContain(LIGHT_TEXT)
      expect(source).toContain(`${BY_SYSTEM}{`)
      expect(source).toContain(DARK_TEXT)
    }
  })
}

test('theme: the theme option wins over the setting', { options: { theme: 'light' } }, async ($, on) => {
  await session($, on, 'dark')
  for (const source of await drawings($)) {
    expect(source).toContain(LIGHT_TEXT)
    expect(source).not.toContain(DARK_TEXT)
  }
})

test('theme: changing the setting repaints at once', async ($, on) => {
  await session($, on, 'dark')
  await ($.config.set as (e: unknown) => Promise<unknown>)({ key: 'theme', value: 'light', previous: 'dark', provider: 'engine', origin: 'menu' })
  for (const source of await drawings($)) {
    expect(source).toContain(LIGHT_TEXT)
    expect(source).not.toContain(DARK_TEXT)
  }
})

// A tier's name is too pale on a light page in its own colour; a costume's white parts would vanish.
test('theme: a light page gets deeper tier names and grey paper', { options: { theme: 'light' } }, async ($, on) => {
  await session($, on, undefined)
  const rows = (await drawings($)).join('')
  expect(rows).toContain('<tspan fill="#5E7F1E">haiku</tspan>')
  expect(rows).not.toContain('<tspan fill="#8DB33A">haiku</tspan>')
  // The chef's hat is paper: a class the palette colours, not a fixed white.
  expect(rows).toContain('class="pp"')
  expect(rows).toContain('.pp{fill:#bdbab1}')
  expect(rows).not.toContain('fill="#F4F3EE"')
})
