import { expect, mock, test } from 'claude-code/testing'

const PLUGIN = 'savvy-progress'
const PROGRESS = 'mcp__savvy-progress__progress'

const band = { hasSurvey: false, isWorking: false, maxRows: 4, bodyColumns: 100, scroll: { offset: 0, bodyRows: 4 }, view: {} }
const pane = { title: '', isFocused: false, bodyColumns: 60, placement: 'dock', scroll: { offset: 0, bodyRows: 30 }, view: {} } as const

const plan = {
  tool: PROGRESS,
  title: 'Ship the thing',
  phase: 'delegate',
  tasks: [
    { title: 'Write the parser', tier: 'careful' },
    { title: 'Wire the CLI', tier: 'light', after: [1] },
  ],
} as const

for (const surface of ['terminal', 'desktop'] as const) {
  test(`${surface}: the band shows what the flow reports`, async ($, on) => {
    // Reporting a plan opens the panel by itself, once per flow.
    const opened: string[] = []
    on('ui.open', (_$, e) => {
      opened.push(e.id)
      return { value: { isPlaced: true } }
    })

    const reported = await $.tool.call(plan as never)
    expect(reported).toMatchObject({ result: 'ok: Tasks 0/2' })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    // Two planned tasks, none started: the crew button counts both.
    expect((await ui.find({ key: 'savvy-agents' }))?.props.label).toBe('×2')

    await $.tool.call({ tool: PROGRESS, done: 1 } as never)
    expect(opened).toEqual(['savvy-agents'])
    expect(await $.tool.call({ tool: PROGRESS, finished: true } as never)).toMatchObject({ result: 'ok: Done' })
  })

  // The terminal's element table names `Svg` too, but draws nothing for it: its row must be text.
  test(`${surface}: the band is ${surface === 'terminal' ? 'text' : 'one drawing'}`, async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.tool.call(plan as never)

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    const drawings = await ui.findAll({ type: 'Svg' })
    if (surface === 'terminal') {
      expect(drawings).toHaveLength(0)
      expect(await ui.find({ type: 'Text', text: /Ship the thing/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /Tasks 0\/2/ })).toBeDefined()
    } else {
      expect(drawings).toHaveLength(1)
      expect(String(drawings[0]?.props.source)).toContain('Ship the thing')
    }
  })

  test(`${surface}: the panel lists planned tasks in Thai`, { options: { language: 'th' } }, async ($, on) => {
    mock.clock(on)
    on('session.start', (_$, e) => ({ cwd: e.cwd }))
    on('tool.register', (_$, e) => ({ value: { tool: `mcp__${PLUGIN}__${e.name}` } }))
    on('command.register', (_$, e) => ({ value: { command: e.name } }))
    on('ui.open', () => ({ value: { isPlaced: true } }))
    await $.session.start({ cwd: '/tmp', surface, isInteractive: true })

    expect(await $.tool.call(plan as never)).toMatchObject({ result: 'ok: งาน 0/2' })

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    expect(await ui.find({ text: /วางแผนไว้ · 2/ })).toBeDefined()
    expect((await ui.find({ key: 'compact' }))?.props.label).toBe('ย่อ')
  })

  // The schema's enum and bounds are advice to the model: a call outside them must still draw.
  test(`${surface}: input outside the tool's schema cannot break the drawing`, async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const tasks = [
      { title: 'Odd one', tier: '__proto__' },
      { title: 'Odd two', tier: 'constructor' },
      ...Array.from({ length: 500 }, (_, i) => ({ title: `Task ${i}`, tier: 'light' })),
    ]
    const reported = await $.tool.call({ tool: PROGRESS, title: 'Odd input', phase: 'delegate', tasks, total: 1e9 } as never)
    expect(reported).toMatchObject({ result: 'ok: Tasks 0/200' })

    const bar = await $.ui.mount({ plugin: PLUGIN, surface, component: 'AbovePrompt', props: band })
    expect((await bar.find({ key: 'savvy-agents' }))?.props.label).toBe('×200')

    const ui = await $.ui.mount({ plugin: PLUGIN, surface, component: 'Pane', requestId: 'savvy-agents', props: pane })
    expect(await ui.find({ text: /Planned · 200/ })).toBeDefined()
    const drawn = (await ui.findAll({ type: 'Svg' })).map(el => String(el.props.source)).join('')
    expect(drawn).not.toContain('native code')
    expect(drawn).not.toContain('[object')
  })

  // The stored title is clipped, so the incoming one is clipped before the two are compared.
  test(`${surface}: a title past the cap is still the same flow`, async ($, on) => {
    on('ui.open', () => ({ value: { isPlaced: true } }))
    const long = 'L'.repeat(500)

    const first = await $.tool.call({ tool: PROGRESS, title: long, phase: 'delegate', total: 4, done: 2 } as never)
    expect(first).toMatchObject({ result: 'ok: Tasks 2/4' })

    // Repeating the long title keeps the counters instead of starting over at 0/0.
    expect(await $.tool.call({ tool: PROGRESS, title: long } as never)).toMatchObject({ result: 'ok: Tasks 2/4' })

    const started = await $.tool.call({ tool: PROGRESS, title: 'Another flow', phase: 'delegate', total: 3 } as never)
    expect(started).toMatchObject({ result: 'ok: Tasks 0/3' })
  })
}
