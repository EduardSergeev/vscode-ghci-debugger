import { basename, normalize, resolve } from 'path';


export { basename as fileName };

export function normalizePath(root: string, path: string) {
  return normalize(root && path ? resolve(root, path) : path);
}
