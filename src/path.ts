import { basename, normalize, resolve } from 'path';


export { basename as fileName };

export function normalizePath(root: string, path: string) {
  return root && path ? normalize(resolve(root, path)) : path;
}
