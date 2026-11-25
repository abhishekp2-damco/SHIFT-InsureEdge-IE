function normalizeRoutePath(path: string) {
  if (!path) return '/';
  const normalized = path.startsWith('/') ? path : `/${path}`;
  return normalized.length > 1 ? normalized.replace(/\/+$/, '') : normalized;
}

/**
 * Keeps a parent navigation item active for its nested add, edit and view routes.
 * Segment-boundary matching prevents similar routes (for example /users-old)
 * from activating the /users menu item.
 */
export function isParentRouteActive(pathname: string, parentPath: string, exact = false) {
  const current = normalizeRoutePath(pathname.split(/[?#]/, 1)[0]);
  const parent = normalizeRoutePath(parentPath);

  if (current === parent) return true;
  return !exact && current.startsWith(`${parent}/`);
}
