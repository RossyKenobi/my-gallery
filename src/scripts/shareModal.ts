let currentShareUrl = '';
let currentShareImg = '';

// Listen for custom event to open the modal
if (typeof window !== 'undefined') {
  window.addEventListener('open-share-modal', ((e: CustomEvent) => {
    currentShareUrl = e.detail.url;
    currentShareImg = e.detail.imgUrl;
    
    const modal = document.getElementById('share-modal');
    if (modal) {
      modal.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
  }) as EventListener);

  // Initialize event listeners once DOM is ready
  document.addEventListener('DOMContentLoaded', () => {
    const modal = document.getElementById('share-modal');
    if (!modal) return;
    
    modal.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      if (target.classList.contains('modal-overlay') || target.closest('.close-modal')) {
        modal.classList.remove('active');
        document.body.style.overflow = '';
      }
    });

    const buttons = modal.querySelectorAll('.share-btn');
    buttons.forEach(btn => {
      btn.addEventListener('click', async () => {
        const network = btn.getAttribute('data-network');
        const text = encodeURIComponent('Check out this shot from Silent Flânerie');
        const encodedUrl = encodeURIComponent(currentShareUrl);
        
        if (network === 'x') {
          window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodedUrl}`, '_blank');
        } else if (network === 'facebook') {
          window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedUrl}`, '_blank');
        } else if (network === 'weibo') {
          window.open(`http://service.weibo.com/share/share.php?url=${encodedUrl}&pic=${encodeURIComponent(currentShareImg)}&title=${text}`, '_blank');
        } else {
          // IG, TikTok, WeChat - Copy link to clipboard
          try {
            await navigator.clipboard.writeText(currentShareUrl);
            const toast = document.getElementById('system-toast');
            const toastText = document.getElementById('system-toast-text');
            if (toast && toastText) {
              toastText.textContent = `Link copied! Open ${network?.toUpperCase()} to share.`;
              toast.classList.add('visible');
              setTimeout(() => {
                toast.classList.remove('visible');
              }, 3000);
            }
          } catch (err) {
            console.error('Copy failed', err);
          }
        }
        modal.classList.remove('active');
        document.body.style.overflow = '';
      });
    });
  });
}
