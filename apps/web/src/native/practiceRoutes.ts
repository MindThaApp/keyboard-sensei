/** Routes where the user is playing, so the screen must not dim mid-piece. */
const PRACTICE_ROUTES = [/^\/lessons\/[^/]+/, /^\/practice(\/|$)/, /^\/play\/[^/]+/, /^\/welcome\/assessment/];

export const isPracticeRoute = (pathname: string): boolean => PRACTICE_ROUTES.some((pattern) => pattern.test(pathname));
