export { EMPTY_ARRAY } from './lib/array-utils';
export { default as assert, deprecate } from './lib/assert';
export { dict, DictSet, isDict, isObject, Set, StackImpl as Stack } from './lib/collections';
export * from './lib/destroy';
export * from './lib/dom';
export { ensureGuid, HasGuid, initializeGuid } from './lib/guid';
export {
  isSerializationFirstNode,
  SERIALIZATION_FIRST_NODE_STRING,
} from './lib/is-serialization-first-node';
export * from './lib/lifetimes';
export {
  CloneableListNode,
  EMPTY_SLICE,
  LinkedList,
  LinkedListNode,
  ListNode,
  ListSlice,
  Slice,
} from './lib/list-utils';
export { assign, fillNulls } from './lib/object-utils';
export * from './lib/platform-utils';
export * from './lib/string';

export type FIXME<T, S extends string> = T & S | T;

export function assertNever(value: never, desc = 'unexpected unreachable branch'): void {
  console.log('unreachable', value);
  console.trace(`${desc} :: ${JSON.stringify(value)} (${value})`);
}
