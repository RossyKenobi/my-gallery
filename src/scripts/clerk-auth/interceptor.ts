export function initNavigationInterception() {
  const isClerkRedirect = (url: string) => typeof url === 'string' && (url.includes('accounts.') || url.includes('clerk.') || url.includes('sign-up'));
  try {
    const origAssign = Location.prototype.assign;
    Location.prototype.assign = function(url: string) {
      if (isClerkRedirect(url)) { return; }
      return origAssign.call(this, url);
    };
    const origReplace = Location.prototype.replace;
    Location.prototype.replace = function(url: string) {
      if (isClerkRedirect(url)) { return; }
      return origReplace.call(this, url);
    };
  } catch(e) {}
  const origOpen = window.open;
  window.open = function(url?: string | URL, ...args: any[]) {
    if (typeof url === 'string' && isClerkRedirect(url)) return null;
    return origOpen.call(this, url, ...args);
  };
  if ((window as any).navigation) {
    (window as any).navigation.addEventListener('navigate', (e: any) => {
      if (isClerkRedirect(e.destination.url)) e.preventDefault();
    });
  }
  window.addEventListener('beforeunload', () => {
    const m = document.getElementById('custom-signin-modal');
    if (m && m.classList.contains('active')) {
      sessionStorage.setItem('clerk_bounce', window.location.href);
    }
  });
  const bounce = sessionStorage.getItem('clerk_bounce');
  if (bounce) { sessionStorage.removeItem('clerk_bounce'); }
}
