import type { On } from 'claude-code'
import { expect, mock, test } from 'claude-code/testing'
import type { Engine } from 'claude-code/testing'

const PROGRESS = 'mcp__savvy-progress__progress'

// What reached the person: toasts in the app, and notifications on their own channel.
const heard = (on: On) => {
  const toasts: string[] = []
  const native: string[] = []
  mock.clock(on)
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('ui.toast', (_$, e) => {
    toasts.push(e.text)
    return { value: undefined }
  })
  on('ui.notify', (_$, e) => {
    native.push(e.text)
    return { value: { isSent: true, channel: 'terminal_bell' } }
  })
  on('agent.spawn', () => ({ model: 'claude-opus-5-5', agentId: 'a1' }))
  on('turn.complete', () => ({ text: '' }) as never)
  return { toasts, native }
}

const plan = { tool: PROGRESS, title: 'Ship the thing', phase: 'delegate', total: 2 } as const
const finish = ($: Engine, more: object = {}) => $.tool.call({ tool: PROGRESS, done: 2, finished: true, ...more } as never)

// One worker whose turn ends for `reason`.
const workerEnds = async ($: Engine, reason: 'answer' | 'aborted' | 'refusal' | 'error') => {
  await $.agent.spawn({ tool_use_id: 't1', prompt: 'p', description: 'Write the parser', subagentType: 'general-purpose', provider: 'engine', parentModel: 'claude-opus-5-5', background: false, fork: false } as never)
  await ($.turn.complete as (e: unknown) => Promise<unknown>)({ agentId: 'a1', reason, answer: reason === 'answer' ? 'ok' : '', usage: null })
}

test('notify: a flow that finishes is announced once, as a toast', async ($, on) => {
  const { toasts, native } = heard(on)
  await $.tool.call(plan as never)
  expect(toasts).toEqual([])

  await finish($)
  expect(toasts).toEqual(['Ship the thing: Done · 2/2'])
  // Saying it is finished again is not a second flow finishing.
  await finish($)
  await finish($, { title: 'Ship the thing' })
  expect(toasts).toHaveLength(1)
  // The native channel is asked for, not the default.
  expect(native).toEqual([])
})

test('notify: a second flow that finishes is announced too', async ($, on) => {
  const { toasts } = heard(on)
  await $.tool.call(plan as never)
  await finish($)
  await $.tool.call({ tool: PROGRESS, title: 'Another flow', phase: 'delegate', total: 1 } as never)
  await finish($, { done: 1 })
  expect(toasts).toEqual(['Ship the thing: Done · 2/2', 'Another flow: Done · 1/1'])
})

test('notify: the announcement carries what the workers cost and took', async ($, on) => {
  const { toasts } = heard(on)
  await $.tool.call(plan as never)
  await workerEnds($, 'answer')
  await finish($)
  expect(toasts).toEqual(['Ship the thing: Done · 2/2 · ≈$0.00 · 0:00'])
})

for (const reason of ['error', 'refusal'] as const) {
  test(`notify: a worker that ends in ${reason} is announced`, async ($, on) => {
    const { toasts } = heard(on)
    await workerEnds($, reason)
    expect(toasts).toEqual(['Write the parser: error'])
  })
}

for (const reason of ['answer', 'aborted'] as const) {
  test(`notify: a worker that ends in ${reason} is not announced`, async ($, on) => {
    const { toasts } = heard(on)
    await workerEnds($, reason)
    expect(toasts).toEqual([])
  })
}

test('notify: native adds the notification channel to the toast', { options: { notify: 'native' } }, async ($, on) => {
  const { toasts, native } = heard(on)
  await $.tool.call(plan as never)
  await finish($)
  await workerEnds($, 'error')
  expect(toasts).toEqual(['Ship the thing: Done · 2/2', 'Write the parser: error'])
  expect(native).toEqual(toasts)
})

test('notify: off says nothing', { options: { notify: 'off' } }, async ($, on) => {
  const { toasts, native } = heard(on)
  await $.tool.call(plan as never)
  await finish($)
  await workerEnds($, 'error')
  expect(toasts).toEqual([])
  expect(native).toEqual([])
})

test('notify: the toast is in the panel language', { options: { language: 'th' } }, async ($, on) => {
  const { toasts } = heard(on)
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('tool.register', (_$, e) => ({ value: { tool: `mcp__savvy-progress__${e.name}` } }))
  on('command.register', (_$, e) => ({ value: { command: e.name } }))
  await $.session.start({ cwd: '/tmp', surface: 'terminal', isInteractive: true })
  await $.tool.call(plan as never)
  await finish($)
  await workerEnds($, 'error')
  expect(toasts).toEqual(['Ship the thing: เสร็จสิ้น · 2/2', 'Write the parser: ผิดพลาด'])
})
