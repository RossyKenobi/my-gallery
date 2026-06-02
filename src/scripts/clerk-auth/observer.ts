import { closeModal } from '../utils/modal';
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
