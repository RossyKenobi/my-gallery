export function openModal(modal: HTMLElement | null) {
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
export function closeModal(modal: HTMLElement | null) {
  if (modal) {
    modal.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
  }
}
