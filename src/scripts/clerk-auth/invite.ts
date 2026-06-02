import { openModal, closeModal } from '../utils/modal';

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
