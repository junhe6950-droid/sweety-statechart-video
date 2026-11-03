// An upload with retries: an XState v5 machine written with setup(), in TypeScript (sample for scv.py import).
import { setup, assign, fromPromise } from 'xstate';

type Ctx = { retries: number; done: boolean };

const MAX = 3;

export const uploadMachine = setup({
  types: {} as { context: Ctx; events: { type: 'PICK' } | { type: 'CANCEL' } },
  actors: { send: fromPromise(async () => 'ok') },
  guards: {
    canRetry: ({ context }: { context: Ctx }) => context.retries < MAX,
    gaveUp: ({ context }) => context.retries >= 3,
  },
  actions: {
    bump: assign({ retries: ({ context }) => context.retries + 1 }),
  },
}).createMachine({
  id: 'upload',
  initial: 'idle',
  context: { retries: 0, done: false } as Ctx,
  states: {
    idle: { on: { PICK: 'sending' } },
    sending: {
      invoke: { src: 'send', onDone: 'sent', onError: 'failed' },
      on: { CANCEL: 'idle' },
    },
    failed: {
      always: [
        { guard: 'canRetry', target: 'sending', actions: 'bump' },
        { guard: 'gaveUp', target: 'broken' },
      ],
    },
    broken: { on: { PICK: { target: 'sending', actions: assign({ retries: 0 }) } } },
    sent: { type: 'final' },
  },
});
