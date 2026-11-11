// Narrow redirect interception strictly to Clerk hosted /sign-up or local /sign-up routes (GA-25)
// so OAuth provider redirects (e.g. accounts.google.com) and Clerk account portal pages still work.
export function isClerkSignUpUrl(rawUrl: string | URL | undefined): boolean {
  if (!rawUrl) return false;
  try {
    const parsed = new URL(String(rawUrl), window.location.origin);
    const isSignUpPath = parsed.pathname === '/sign-up' || parsed.pathname.startsWith('/sign-up/');
    if (!isSignUpPath) return false;
    return (
      parsed.origin === window.location.origin ||
      parsed.hostname === 'accounts.penumbrae.uk' ||
      parsed.hostname.endsWith('.accounts.dev') ||
      parsed.hostname.endsWith('.clerk.accounts.dev')
    );
  } catch {
    return false;
  }
}

export function initNavigationInterception() {
  try {
    const origAssign = Location.prototype.assign;
    Location.prototype.assign = function (url: string) {
      if (isClerkSignUpUrl(url)) {
        window.location.hash = '#invite';
        return;
      }
      return origAssign.call(this, url);
    };
    const origReplace = Location.prototype.replace;
    Location.prototype.replace = function (url: string) {
      if (isClerkSignUpUrl(url)) {
        window.location.hash = '#invite';
        return;
      }
      return origReplace.call(this, url);
    };
  } catch (e) {}

  const origOpen = window.open;
  window.open = function (url?: string | URL, ...args: any[]) {
    if (isClerkSignUpUrl(url)) {
      window.location.hash = '#invite';
      return null;
    }
    return origOpen.call(this, url, ...args);
  };

  if ((window as any).navigation) {
    (window as any).navigation.addEventListener('navigate', (e: any) => {
      if (isClerkSignUpUrl(e.destination?.url)) {
        e.preventDefault();
        window.location.hash = '#invite';
      }
    });
  }
}
