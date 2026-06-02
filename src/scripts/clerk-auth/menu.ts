export function initUserMenu() {
  const userMenuTrigger = document.getElementById('user-menu-trigger');
  const userMenuPopover = document.getElementById('user-menu-popover');
  const userMenuManage = document.getElementById('user-menu-manage');
  const userMenuSignout = document.getElementById('user-menu-signout');

  if (userMenuTrigger && userMenuPopover) {
    userMenuTrigger.addEventListener('click', (e) => {
      e.stopPropagation();
      userMenuPopover.classList.toggle('open');
      if (userMenuPopover.classList.contains('open')) {
        const vh = window.innerHeight;
        const prog = Math.min(window.scrollY / (vh * 0.66), 1);
        userMenuPopover.style.background = `rgba(0, 0, 0, ${prog * 0.05})`;
        userMenuPopover.style.backdropFilter = `blur(${prog * 2}px)`;
        userMenuPopover.style.webkitBackdropFilter = `blur(${prog * 2}px)`;
      }
    });

    document.addEventListener('click', (e) => {
      if (!userMenuPopover.contains(e.target as Node) && e.target !== userMenuTrigger) {
        userMenuPopover.classList.remove('open');
      }
    });

    if (userMenuManage) {
      userMenuManage.addEventListener('click', () => {
        userMenuPopover.classList.remove('open');
        if ((window as any).Clerk) {
          (window as any).Clerk.openUserProfile();
        }
      });
    }

    if (userMenuSignout) {
      userMenuSignout.addEventListener('click', () => {
        userMenuPopover.classList.remove('open');
        if ((window as any).Clerk) {
          (window as any).Clerk.signOut().then(() => window.location.reload());
        }
      });
    }
  }
}
