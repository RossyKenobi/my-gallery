/**
 * hero-scroll.ts — Hero section scroll effects (glassmorphism blur + nav transitions).
 * Used only by index.astro (main page).
 */

export function initHeroScroll() {
  const heroOverlay = document.createElement('div');
  heroOverlay.className = 'hero-overlay-blur';
  document.body.prepend(heroOverlay);

  const minimalNav = document.querySelector('.minimal-nav') as HTMLElement | null;
  const heroDivider = document.querySelector('.hero-divider');
  let isTicking = false;

  window.addEventListener('scroll', () => {
    if (!isTicking) {
      window.requestAnimationFrame(() => {
        const scrollY = window.scrollY;
        const viewportHeight = window.innerHeight;
        const progress = Math.min(scrollY / (viewportHeight * 0.8), 1);
        const opacity = 0.2 + (progress * 0.1);
        heroOverlay.style.background = `rgba(0, 0, 0, ${opacity})`;
        heroOverlay.style.backdropFilter = `blur(${progress * 5}px)`;
        heroOverlay.style.webkitBackdropFilter = `blur(${progress * 5}px)`;

        if (minimalNav) {
          const navTransitionThreshold = viewportHeight * 0.66;
          const navProgress = Math.min(scrollY / navTransitionThreshold, 1);
          minimalNav.style.backgroundColor = `rgba(0, 0, 0, ${navProgress * 0.05})`;
          minimalNav.style.backdropFilter = `blur(${navProgress * 2}px)`;
          minimalNav.style.webkitBackdropFilter = `blur(${navProgress * 2}px)`;
          if (scrollY > 20) minimalNav.classList.add('is-scrolled');
          else minimalNav.classList.remove('is-scrolled');

          // Sync custom user menu glassmorphism with navbar
          const userMenu = document.getElementById('user-menu-popover');
          if (userMenu) {
            const baseOpacity = 0.01;
            const baseBlur = 1;
            userMenu.style.background = `rgba(0, 0, 0, ${baseOpacity + (navProgress * 0.05)})`;
            userMenu.style.backdropFilter = `blur(${baseBlur + (navProgress * 2)}px)`;
            userMenu.style.webkitBackdropFilter = `blur(${baseBlur + (navProgress * 2)}px)`;
          }
        }

        if (heroDivider) {
          if (scrollY > 20) heroDivider.classList.add('visible');
          else heroDivider.classList.remove('visible');
        }
        isTicking = false;
      });
      isTicking = true;
    }
  });

  // Initial state
  heroOverlay.style.background = `rgba(0, 0, 0, 0.2)`;
  heroOverlay.style.backdropFilter = `blur(0px)`;
  heroOverlay.style.webkitBackdropFilter = `blur(0px)`;
}
