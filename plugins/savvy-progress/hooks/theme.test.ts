import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'
const pane = { title: '', isFocused: false, bodyColumns: 80, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const
const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }

// Text colour of each palette, and the rule that hides one behind the page's preference.
const LIGHT_TEXT = '.t{fill:#1f1f1f}'
const DARK_TEXT = '.t{fill:#ececec}'
const BY_PAGE = '@media (prefers-color-scheme: dark)'

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
  await $.session.start({ cwd: '/tmp', surface: 'desktop', isInteractive: true })
  await $.tool.call({ tool: PROGRESS, title: 'Ship the thing', phase: 'delegate', tasks: [{ title: 'Cook', tier: 'medium' }, { title: 'Count', tier: 'haiku' }] } as never)
}

// Every drawing of the panel and the band, joined.
const drawings = async ($: Engine) => {
  const panel = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'Pane', requestId: 'savvy-agents', props: pane })
  const row = await $.ui.mount({ plugin: PLUGIN, surface: 'desktop', component: 'AbovePrompt', props: band })
  return [...(await panel.findAll({ type: 'Svg' })), ...(await row.findAll({ type: 'Svg' }))].map(el => String(el.props.source))
}

// Claude Code's `theme` setting is the terminal's: the desktop app may be light while it
// says dark, so whatever it holds the page's own preference decides.
for (const setting of [undefined, 'auto', 'dark', 'light', 'dark-ansi'] as const) {
  test(`theme: with ${setting ?? 'no'} theme setting the page's preference decides`, async ($, on) => {
    await session($, on, setting)
    for (const source of await drawings($)) {
      expect(source).toContain(LIGHT_TEXT)
      expect(source).toContain(`${BY_PAGE}{`)
      expect(source).toContain(DARK_TEXT)
    }
  })
}

for (const [option, mine, other] of [
  ['light', LIGHT_TEXT, DARK_TEXT],
  ['dark', DARK_TEXT, LIGHT_TEXT],
] as const) {
  test(`theme: the ${option} option gives every drawing that palette alone`, { options: { theme: option } }, async ($, on) => {
    await session($, on, option === 'light' ? 'dark' : 'light')
    for (const source of await drawings($)) {
      expect(source).toContain(mine)
      expect(source).not.toContain(other)
      expect(source).not.toContain(BY_PAGE)
    }
  })
}

// A tier's name is too pale on a light page in its own colour; a costume's white parts would
// vanish. Both are drawn in a class, so the palette in force colours them.
test('theme: each palette has its own tier names and paper', async ($, on) => {
  await session($, on, undefined)
  const rows = (await drawings($)).join('')
  expect(rows).toContain('<tspan class="i-haiku">haiku</tspan>')
  expect(rows).not.toContain('<tspan fill=')
  expect(rows).toContain('class="pp"')
  expect(rows).not.toContain('fill="#F4F3EE"')
  // The panel's stylesheet: light first, dark behind the page's preference.
  const sheet = rows.slice(rows.indexOf(LIGHT_TEXT))
  const [light, dark] = [sheet.slice(0, sheet.indexOf(BY_PAGE)), sheet.slice(sheet.indexOf(BY_PAGE))]
  expect(light).toContain('.i-haiku{fill:#5E7F1E}')
  expect(dark).toContain('.i-haiku{fill:#8DB33A}')
  expect(rows).toContain(`.pp{fill:#bdbab1}${BY_PAGE}{.pp{fill:#F4F3EE}}`)
})
