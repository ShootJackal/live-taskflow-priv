const __DEV__ =
  typeof process !== "undefined" && process.env?.NODE_ENV !== "production";

function noop(..._args: unknown[]): void {}

function devLog(...args: unknown[]): void {
  // eslint-disable-next-line no-console
  console.log(...args);
}

export const log = __DEV__ ? devLog : noop;
