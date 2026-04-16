/**
 * clerk-auth.ts — Clerk authentication UI logic.
 * Handles: user menu, sign-in mount, invite modal, navigation interception, text observer.
 * Used by both index.astro and /u/[username].astro (menu + signout),
 * but invite/signup logic only on main page.
 */

// --- Modal Helpers (duplicated here for independence from gallery.ts) ---
function openModal(modal: HTMLElement | null) {
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
function closeModal(modal: HTMLElement | null) {
  if (modal) {
    modal.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
  }
}

/**
 * Initialize the user menu (dropdown with Manage Account, My Page, Sign Out).
 * Used on all pages.
 */
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

/**
 * Initialize navigation interception to block Clerk external redirects.
 */
export function initNavigationInterception() {
  const isClerkRedirect = (url: string) => typeof url === 'string' && (url.includes('accounts.') || url.includes('clerk.') || url.includes('sign-up'));
  try {
    const origAssign = Location.prototype.assign;
    Location.prototype.assign = function(url: string) {
      if (isClerkRedirect(url)) { console.log('Blocked redirect:', url); return; }
      return origAssign.call(this, url);
    };
    const origReplace = Location.prototype.replace;
    Location.prototype.replace = function(url: string) {
      if (isClerkRedirect(url)) { console.log('Blocked redirect:', url); return; }
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

/**
 * Initialize Clerk Sign In modal mount + invite modal logic.
 * Only used on the main page (index.astro).
 */
export function initClerkSignInAndInvite() {
  const signinModal = document.getElementById('custom-signin-modal');
  const inviteModal = document.getElementById('invite-modal');
  const verifyInviteBtn = document.getElementById('verify-invite-btn');
  const cancelInviteBtn = document.getElementById('cancel-invite-btn');
  const inviteInput = document.getElementById('invite-input') as HTMLInputElement;
  const inviteErrorMsg = document.getElementById('invite-error-msg');

  document.getElementById('custom-login-btn')?.addEventListener('click', (e) => {
    e.preventDefault();
    openModal(signinModal);
    if ((window as any).Clerk) {
      (window as any).Clerk.mountSignIn(document.getElementById('clerk-signin-mount'), {
        signUpUrl: window.location.origin + '/#invite',
        transferable: false,
        routerPush: (to: string) => {
          if (to.includes('sign-up') || to.includes('accounts.') || to.includes('clerk.')) {
            window.location.hash = '#invite';
          } else {
            window.history.pushState({}, '', to);
          }
        },
        routerReplace: (to: string) => {
          if (to.includes('sign-up') || to.includes('accounts.') || to.includes('clerk.')) {
            window.location.hash = '#invite';
          } else {
            window.history.replaceState({}, '', to);
          }
        },
        afterSignInUrl: window.location.href,
        afterSignUpUrl: window.location.href,
        appearance: {
          variables: { colorBackground: 'transparent', colorText: '#ededed', colorPrimary: '#ededed', colorTextOnPrimaryBackground: '#0a0a0a', colorInputBackground: 'transparent', colorInputText: '#ededed', colorNeutral: 'rgba(237,237,237,0.5)', colorTextSecondary: 'rgba(237,237,237,0.5)' },
          elements: {
            cardBox: { backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)', boxShadow: 'none', borderRadius: '24px' },
            card: { backgroundColor: 'transparent', border: 'none', boxShadow: 'none' },
            headerTitle: { color: '#ededed', fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.1em', fontWeight: '400', textTransform: 'uppercase' },
            headerSubtitle: { display: 'none' },
            socialButtonsBlockButton: { border: '1px solid rgba(237, 237, 237, 0.2)', borderRadius: '40px', color: '#ededed' },
            socialButtonsBlockButtonText: { color: '#ededed' },
            dividerLine: { background: 'rgba(237,237,237,0.1)' },
            dividerText: { color: 'rgba(237,237,237,0.5)' },
            formFieldLabel: { color: 'rgba(237,237,237,0.7)', fontFamily: "'Montserrat', sans-serif", fontSize: '0.8rem' },
            formFieldInput: { background: 'transparent', border: '1px solid rgba(237,237,237,0.15)', borderRadius: '40px', color: '#ededed', padding: '0.75rem 1.25rem', outline: 'none', boxShadow: 'none' },
            formFieldInputShowPasswordButton: { color: 'rgba(237,237,237,0.5)' },
            formButtonPrimary: { background: '#ededed', color: '#0a0a0a', borderRadius: '40px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: '500', fontFamily: "'Montserrat', sans-serif", border: 'none', padding: '0.75rem 2rem', fontSize: '0.85rem' },
            footer: { background: 'transparent' },
            footerActionText: { color: 'rgba(237,237,237,0.5)' },
            footerActionLink: { color: '#ededed', fontWeight: '500' },
            identityPreviewText: { color: '#ededed' },
            identityPreviewEditButton: { color: 'rgba(237,237,237,0.5)' },
            form: { marginBottom: '0' },
            alternativeMethodsBlockButton: { border: '1px solid rgba(237, 237, 237, 0.2)', borderRadius: '40px', color: '#ededed', background: 'transparent' },
            alternativeMethodsBlockButtonText: { color: '#ededed', fontFamily: "'Montserrat', sans-serif" },
            backLink: { color: 'rgba(237,237,237,0.7)' }
          }
        }
      });

      // Inject CSS overrides
      if (!document.getElementById('clerk-signin-styles')) {
        const cs = document.createElement('style');
        cs.id = 'clerk-signin-styles';
        cs.textContent = `
          #clerk-signin-mount .cl-formButtonPrimary { margin-bottom: 0 !important; }
          #clerk-signin-mount form { margin-bottom: 0 !important; padding-bottom: 0 !important; }
          #clerk-signin-mount form > div { margin-bottom: 0 !important; padding-bottom: 0 !important; }
          #clerk-signin-mount form div[class*="cl-internal"] { margin-bottom: 0 !important; padding-bottom: 0 !important; }
          #clerk-signin-mount .cl-main { margin-bottom: 0 !important; padding-bottom: 0 !important; }
          #clerk-signin-mount .cl-card { padding-bottom: 0 !important; }
          #clerk-signin-mount .cl-cardBox { padding-bottom: 0 !important; }
          #clerk-signin-mount .cl-footer { margin-top: 0 !important; padding: 0.5rem 2rem 0.5rem 2rem !important; text-align: center !important; }
          #clerk-signin-mount .cl-footerAction { margin: 0 !important; padding: 0 !important; text-align: center !important; }
          #clerk-signin-mount .cl-footerActionLink { margin-left: 0.25em !important; }
          #clerk-signin-mount .cl-alternativeMethods { margin: 0 !important; padding: 0 !important; text-align: center !important; }
          #clerk-signin-mount .cl-backLink { margin: 0 0 1.75rem 0 !important; display: block !important; width: 100% !important; text-align: center !important; }
          #clerk-signin-mount .custom-reset-btn { 
            background: transparent !important; 
            background-color: transparent !important; 
            border: 1px solid rgba(237,237,237,0.2) !important; 
            box-shadow: none !important; 
            border-radius: 40px !important; 
            color: #ededed !important; 
          }
          #clerk-signin-mount .custom-reset-btn:hover {
            background: rgba(255,255,255,0.05) !important;
            border-color: rgba(237,237,237,0.4) !important;
          }
          #clerk-signin-mount .custom-reset-btn * { 
            background: transparent !important; 
            background-color: transparent !important; 
            box-shadow: none !important; 
          }
        `;
        document.head.appendChild(cs);
      }
    }
  });

  // --- Invite Modal Logic ---
  function showInviteModal() {
    if (signinModal) closeModal(signinModal);
    if ((window as any).Clerk && (window as any).Clerk.closeSignIn) {
      (window as any).Clerk.closeSignIn();
    }
    openModal(inviteModal);
  }

  function checkHashForInvite() {
    if (window.location.hash === '#invite') {
      showInviteModal();
    }
  }

  window.addEventListener('hashchange', checkHashForInvite);

  const originalPushState = history.pushState;
  history.pushState = function(...args: any[]) {
    originalPushState.apply(this, args);
    checkHashForInvite();
  };
  const originalReplaceState = history.replaceState;
  history.replaceState = function(...args: any[]) {
    originalReplaceState.apply(this, args);
    checkHashForInvite();
  };

  // Aggressive capture phase block for Clerk's "Sign Up" anchors
  window.addEventListener('click', (e) => {
    const link = (e.target as HTMLElement).closest('a');
    if (!link) return;

    const hrefAttr = link.getAttribute('href') || '';
    const hrefFull = link.href || '';

    if (hrefAttr === '/sign-up' || hrefFull.includes('/sign-up') || hrefAttr === '/#invite' || hrefAttr === '#invite' || hrefFull.includes('#invite')) {
      e.preventDefault();
      e.stopPropagation();
      if (window.location.hash !== '#invite') {
        window.location.hash = '#invite';
      } else {
        checkHashForInvite();
      }
    }
  }, true);

  checkHashForInvite();

  document.getElementById('close-signup-btn')?.addEventListener('click', () => {
    const signupModal = document.getElementById('custom-signup-modal');
    closeModal(signupModal);
    originalPushState.call(history, '', document.title, window.location.pathname + window.location.search);
  });

  cancelInviteBtn?.addEventListener('click', () => {
    closeModal(inviteModal);
    originalPushState.call(history, '', document.title, window.location.pathname + window.location.search);
  });

  verifyInviteBtn?.addEventListener('click', async () => {
    const code = inviteInput?.value.trim();
    if (!code) return;

    try {
      const res = await fetch('/api/verify-invite', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({ code })
      });
      const data = await res.json();

      if (data.valid && data.inviteId) {
        localStorage.setItem('clerk_invite_id', data.inviteId);
        closeModal(inviteModal);
        originalPushState.call(history, '', document.title, window.location.pathname + window.location.search);

        setTimeout(() => {
          try {
            const signupModal = document.getElementById('custom-signup-modal');
            openModal(signupModal);

            (window as any).Clerk.mountSignUp(document.getElementById('clerk-signup-mount'), {
              fallbackRedirectUrl: `/finalize?inviteId=${data.inviteId}`,
              appearance: {
                variables: { colorBackground: 'transparent', colorText: '#ededed', colorPrimary: '#ededed', colorTextOnPrimaryBackground: 'black', colorInputBackground: 'transparent', colorInputText: '#ededed', colorNeutral: 'rgba(237,237,237,0.5)', colorTextSecondary: 'rgba(237,237,237,0.5)' },
                elements: {
                  cardBox: { backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)', backdropFilter: 'blur(10px)', boxShadow: 'none', borderRadius: '24px' },
                  card: { backgroundColor: 'transparent', border: 'none', boxShadow: 'none' },
                  headerTitle: { color: '#ededed', fontFamily: "'Montserrat', sans-serif", letterSpacing: '0.1em', fontWeight: '400', textTransform: 'uppercase' },
                  headerSubtitle: { display: 'none' },
                  socialButtonsBlockButton: { border: '1px solid rgba(237, 237, 237, 0.2)', borderRadius: '40px', color: '#ededed' },
                  socialButtonsBlockButtonText: { color: '#ededed' },
                  dividerLine: { background: 'rgba(237,237,237,0.1)' },
                  dividerText: { color: 'rgba(237,237,237,0.5)' },
                  formFieldLabel: { color: 'rgba(237,237,237,0.7)', fontFamily: "'Montserrat', sans-serif", fontSize: '0.8rem' },
                  formFieldInput: { background: 'transparent', border: '1px solid rgba(237,237,237,0.15)', borderRadius: '40px', color: '#ededed', padding: '0.75rem 1.25rem', outline: 'none', boxShadow: 'none' },
                  formButtonPrimary: { background: '#ededed', color: 'black', borderRadius: '40px', textTransform: 'uppercase', letterSpacing: '0.15em', fontWeight: '500', border: 'none', padding: '0.75rem 2rem' },
                  footer: { display: 'none' },
                  identityPreviewText: { color: '#ededed' },
                  identityPreviewEditButton: { color: 'rgba(237,237,237,0.5)' }
                }
              }
            });

            // Poll for auth state change
            const watchInterval = setInterval(async () => {
              if ((window as any).Clerk?.user?.id) {
                clearInterval(watchInterval);
                const storedInviteId = localStorage.getItem('clerk_invite_id');
                if (storedInviteId) {
                  try {
                    await fetch('/api/finalize-registration', {
                      method: 'POST',
                      headers: {'Content-Type': 'application/json'},
                      body: JSON.stringify({ inviteId: parseInt(storedInviteId) })
                    });
                    localStorage.removeItem('clerk_invite_id');
                  } catch (fe) {
                    console.error('Auto-finalize error:', fe);
                  }
                }
                window.location.reload();
              }
            }, 1000);
          } catch (mountErr) {
            console.error('Clerk mountSignUp error:', mountErr);
          }
        }, 200);
      } else {
        if (inviteErrorMsg) {
          inviteErrorMsg.innerText = data.error || 'Invalid Code';
          inviteErrorMsg.style.opacity = '1';
        }
      }
    } catch (e) {
      console.error('Verify invite error:', e);
      if (inviteErrorMsg) {
        inviteErrorMsg.innerText = 'Network error';
        inviteErrorMsg.style.opacity = '1';
      }
    }
  });
}

/**
 * Initialize the Clerk text observer (text overrides, cancel button injection, spacing fixes).
 * Used on all pages where Clerk UI appears.
 */
export function initClerkTextObserver() {
  const clerkTextObserver = new MutationObserver(() => {
    document.querySelectorAll('[class*="cl-"]').forEach((el: any) => {
      // 1. Text overrides
      if (el.childElementCount === 0) {
        const text = el.textContent?.trim();
        if (text === 'Manage your account info.') {
          el.textContent = 'Manage account info.';
        } else if (/my-gallery/i.test(text)) {
          el.textContent = el.textContent.replace(/my-gallery/ig, 'THE GALLERY');
        } else if (/last used/i.test(text)) {
          el.style.display = 'none';
        } else if (text === 'Get help' && el.tagName === 'A') {
          el.setAttribute('href', 'mailto:smyfy1@outlook.com');
          el.style.marginLeft = '0.25em';
          el.onclick = (e: Event) => { e.stopPropagation(); };
        } else if (text === 'Back') {
          el.style.color = '#ededed';
          el.style.textTransform = 'uppercase';
          el.style.letterSpacing = '0.1em';
          el.style.opacity = '0.7';
          el.style.fontSize = '0.8rem';
          el.style.background = 'transparent';
        } else if (text === 'Use another method') {
          el.style.display = 'block';
          el.style.textAlign = 'center';
          el.style.width = '100%';
        }
      }

      // Style Reset password button
      if ((el.tagName === 'BUTTON' || el.tagName === 'A') && el.textContent?.trim() === 'Reset your password') {
        el.classList.add('custom-reset-btn');
        el.querySelectorAll('*').forEach((c: HTMLElement) => {
          c.style.setProperty('color', '#ededed', 'important');
        });
      }

      // Force consistent spacing
      if (el.classList.contains('cl-main')) {
        el.style.setProperty('margin-bottom', '0', 'important');
        el.style.setProperty('padding-bottom', '0', 'important');
      }
      if (el.classList.contains('cl-footer')) {
        el.style.setProperty('margin-top', '0', 'important');
        el.style.setProperty('text-align', 'center', 'important');
        const card = el.closest('.cl-card');
        const title = card?.querySelector('.cl-headerTitle')?.textContent?.trim()?.toUpperCase() || '';
        if (title === 'USE ANOTHER METHOD' || title.startsWith('FORGOT')) {
          el.style.setProperty('padding', '0.75rem 2rem', 'important');
        } else if (title.includes('PASSWORD') || title.includes('CHECK')) {
          el.style.setProperty('padding', '0rem 2rem 0rem 2rem', 'important');
        } else {
          el.style.setProperty('padding', '1rem 2rem', 'important');
        }
      }

      if (el.classList.contains('cl-headerTitle')) {
        const title = (el.textContent || '').trim().toUpperCase();
        const header = el.closest('.cl-header');
        if (header) {
          if (title === 'USE ANOTHER METHOD' || title.includes('FORGOT PASSWORD')) {
            header.style.marginBottom = '0.75rem';
          }
        }
      }

      // Hide SVG arrows inside primary buttons and inject CANCEL button
      if (el.classList.contains('cl-formButtonPrimary')) {
        const svgIcon = el.querySelector('svg');
        if (svgIcon) svgIcon.style.display = 'none';
        const isAuthFlow = el.closest('#clerk-signin-mount') || el.closest('#clerk-signup-mount');
        if (isAuthFlow) {
          el.style.setProperty('margin-bottom', '0', 'important');
          let parent = el.parentElement;
          const card = el.closest('.cl-card') || el.closest('#clerk-signin-mount') || el.closest('#clerk-signup-mount');
          while (parent && parent !== card) {
            parent.style.setProperty('margin-bottom', '0', 'important');
            parent.style.setProperty('padding-bottom', '0', 'important');
            parent = parent.parentElement;
          }
        }

        const formContainer = el.closest('form');
        const insertParent = formContainer?.closest('.cl-main') || el.closest('.cl-main') || el.parentElement;
        if (isAuthFlow && insertParent && !insertParent.querySelector('.custom-cancel-btn')) {
          const cancelBtn = document.createElement('button');
          cancelBtn.type = 'button';
          cancelBtn.className = 'custom-cancel-btn';
          cancelBtn.textContent = 'CANCEL';

          cancelBtn.style.background = 'transparent';
          cancelBtn.style.color = '#ededed';
          cancelBtn.style.border = '1px solid rgba(237,237,237,0.2)';
          cancelBtn.style.borderRadius = '40px';
          cancelBtn.style.padding = '0.75rem 2rem';
          cancelBtn.style.width = '100%';
          cancelBtn.style.textTransform = 'uppercase';
          cancelBtn.style.letterSpacing = '0.15em';
          cancelBtn.style.fontWeight = '500';
          cancelBtn.style.cursor = 'pointer';
          cancelBtn.style.fontSize = '0.85rem';
          cancelBtn.style.fontFamily = "'Montserrat', sans-serif";
          cancelBtn.style.transition = 'all 0.3s ease';

          const isSignUp = el.closest('#clerk-signup-mount');
          cancelBtn.style.marginTop = isSignUp ? '0.17rem' : '0rem';
          cancelBtn.style.marginBottom = '0';

          cancelBtn.onmouseenter = () => {
            cancelBtn.style.background = 'rgba(255,255,255,0.05)';
            cancelBtn.style.borderColor = 'rgba(237,237,237,0.4)';
          };
          cancelBtn.onmouseleave = () => {
            cancelBtn.style.background = 'transparent';
            cancelBtn.style.borderColor = 'rgba(237,237,237,0.2)';
          };

          cancelBtn.onclick = (e) => {
            e.preventDefault();
            e.stopPropagation();
            const signinModal = document.getElementById('custom-signin-modal');
            const signupModal = document.getElementById('custom-signup-modal');
            if (signinModal) closeModal(signinModal);
            if (signupModal) closeModal(signupModal);
            const origPushState = history.pushState || history.replaceState;
            if (origPushState) origPushState.call(history, '', document.title, window.location.pathname + window.location.search);
          };

          if (formContainer) {
            insertParent.insertBefore(cancelBtn, formContainer.nextSibling);
          } else {
            el.parentNode!.insertBefore(cancelBtn, el.nextSibling);
          }
        }
      }
    });
  });
  clerkTextObserver.observe(document.body, { childList: true, subtree: true, characterData: true });
}
