/** Joins conditional class names (a dependency-free `clsx`). */
export function cx(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(' ');
}
