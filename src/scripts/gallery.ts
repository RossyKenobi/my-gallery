/**
 * gallery.ts — Shared gallery logic for both main page and personal pages.
 * Handles: rendering, edit mode, PhotoSwipe, upload, mini gallery, drag-drop sorting.
 */
import PhotoSwipe from 'photoswipe';
import Sortable from 'sortablejs';

export interface GalleryConfig {
  mode: 'main' | 'personal';
  userId: string | null;
  isAdmin: boolean;
  ownerClerkId?: string;     // personal page: the page owner's clerk_id
  canSort: boolean;           // whether drag-drop sorting is allowed
  postsApiUrl: string;        // e.g. '/api/posts' or '/api/posts?owner=xxx&sort=personal'
  saveScope?: string;         // 'personal' for personal page sort saves
}

// ==========================================
// R2-BACKED GALLERY — SHARED MODULE
// ==========================================

const UPLOAD_API = '/api/upload';
const POSTS_API = '/api/posts';

// --- Global State ---
let allPosts: any[] = [];
let isEditMode = false;
let sortableInstance: any = null;
let initialOrder: string[] = [];
let filePickerActive = false;
let pendingAction: string | null = null;
let pendingPostId: string | null = null;
let currentEditingWrapper: HTMLElement | null = null;
let currentMiniImages: string[] = [];
let originalMiniImages = '';
let originalMiniCaption = '';
let originalMiniAuthor = '';
let pendingMiniDeleteIdx: number | null = null;
let galleryConfig: GalleryConfig;

// --- DOM Elements (resolved at init time) ---
let importModal: HTMLElement | null;
let progressModal: HTMLElement | null;
let fileInput: HTMLInputElement | null;
let progressBarInner: HTMLElement | null;
let progressStatusText: HTMLElement | null;
let progressTitle: HTMLElement | null;
let refreshPageBtn: HTMLElement | null;
let editBtn: HTMLElement | null;
let editActions: HTMLElement | null;
let saveBtn: HTMLElement | null;
let cancelBtn: HTMLElement | null;
let addBtn: HTMLElement | null;
let galleryBottomBar: HTMLElement | null;
let confirmDiscardModal: HTMLElement | null;
let confirmDiscardBtn: HTMLElement | null;
let cancelDiscardBtn: HTMLElement | null;
let confirmDeleteModal: HTMLElement | null;
let miniGalleryModal: HTMLElement | null;
let closeMiniGalleryBtn: HTMLElement | null;
let confirmMiniGalleryBtn: HTMLElement | null;
let miniGalleryGrid: HTMLElement | null;
let miniCaptionInput: HTMLTextAreaElement | null;
let miniAuthorInput: HTMLInputElement | null;
let miniImportBtn: HTMLElement | null;
let miniFileInput: HTMLInputElement | null;

// --- Modal Helpers ---
function openModal(modal: HTMLElement | null) {
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
function closeModal(modal: HTMLElement | null) {
  if (filePickerActive) return;
  if (modal) {
    modal.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
  }
}

// --- R2 Upload Helpers ---
const MAX_IMAGE_DIMENSION = 2400;
const JPEG_QUALITY = 0.85;

async function compressImage(file: Blob): Promise<Blob> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      let { width, height } = img;
      if (width > MAX_IMAGE_DIMENSION || height > MAX_IMAGE_DIMENSION) {
        if (width > height) {
          height = Math.round(height * (MAX_IMAGE_DIMENSION / width));
          width = MAX_IMAGE_DIMENSION;
        } else {
          width = Math.round(width * (MAX_IMAGE_DIMENSION / height));
          height = MAX_IMAGE_DIMENSION;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0, width, height);
      canvas.toBlob(
        (blob) => {
          if (blob) resolve(blob);
          else reject(new Error('Compression failed'));
        },
        'image/jpeg',
        JPEG_QUALITY
      );
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Failed to load image'));
    img.src = URL.createObjectURL(file);
  });
}

async function uploadToR2(file: Blob, filename: string): Promise<string> {
  const compressed = await compressImage(file);
  console.log(`Compressed: ${(file.size/1024/1024).toFixed(1)}MB → ${(compressed.size/1024/1024).toFixed(1)}MB`);

  const formData = new FormData();
  formData.append('filename', filename);
  formData.append('file', compressed, filename);

  const res = await fetch(UPLOAD_API, {
    method: 'POST',
    body: formData,
  });

  const data = await res.json().catch(() => null);
  if (!res.ok || !data) {
    throw new Error((data && data.error) || `Upload failed (HTTP ${res.status})`);
  }
  return data.finalImageUrl;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [header, base64] = dataUrl.split(',');
  const mime = header.match(/:(.*?);/)![1];
  const binary = atob(base64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) array[i] = binary.charCodeAt(i);
  return new Blob([array], { type: mime });
}

async function savePostsToR2(posts: any[], scope?: string) {
  let url = POSTS_API;
  if (scope) url += `?scope=${scope}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(posts),
  });
  if (!res.ok) throw new Error('Failed to save posts');
}

// --- Gallery Rendering ---
function createGalleryItemHTML(post: any): string {
  const images = post.images || [];
  const isCarousel = images.length > 1;
  const thumbnail = images.length > 0 ? images[0] : '';
  const imagesData = JSON.stringify(images).replace(/"/g, '&quot;');
  const captionData = (post.caption || '').replace(/"/g, '&quot;');
  const authorData = (post.author || '').replace(/"/g, '&quot;');

  const orientationClass = post.isPortrait === true ? 'is-portrait' : 'is-landscape';

  let canEdit = false;
  if (galleryConfig.userId) {
    canEdit = galleryConfig.isAdmin || post.owner_clerk_id === galleryConfig.userId;
  }

  const deleteBtnHTML = canEdit ? `
        <button class="delete-btn" aria-label="Delete Post" data-id="${post.id}" onclick="event.stopPropagation();">
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>` : '';

  return `
    <div class="gallery-item-wrapper ${orientationClass}" data-id="${post.id}" data-images="${imagesData}" data-caption="${captionData}" data-author="${authorData}" data-needs-check="${post.isPortrait === undefined}">
      <a href="${thumbnail}" class="gallery-item" data-pswp-src="${thumbnail}">
        <img src="${thumbnail}" alt="${post.caption || 'Gallery Post'}" loading="lazy" decoding="async" />
        ${deleteBtnHTML}
        ${isCarousel ? `
          <div class="stack-icon" aria-label="${images.length} images">
            <svg viewBox="0 0 24 24">
              <rect x="2" y="2" width="16" height="16" rx="2" ry="2"></rect>
              <path d="M22 6v14a2 2 0 0 1-2 2H6"></path>
            </svg>
          </div>
        ` : ''}
      </a>
    </div>
  `;
}

function renderGallery() {
  const galleryEl = document.getElementById('gallery');
  if (!galleryEl) return;
  const visiblePosts = allPosts.filter((p: any) => !p.hidden);

  if (visiblePosts.length === 0) {
    galleryEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: rgba(255,255,255,0.3); padding: 4rem 0;">No posts yet.</p>';
  } else {
    galleryEl.innerHTML = visiblePosts.map(createGalleryItemHTML).join('');
  }

  attachGalleryListeners();

  // Auto-detect orientation from actual image dimensions
  galleryEl.querySelectorAll('.gallery-item-wrapper img').forEach((img: any) => {
    const verifyOrientation = () => {
      const wrapper = img.closest('.gallery-item-wrapper');
      if (img.naturalHeight > img.naturalWidth) {
        if (wrapper.classList.contains('is-landscape')) {
          wrapper.classList.replace('is-landscape', 'is-portrait');
        }
      } else {
        if (wrapper.classList.contains('is-portrait')) {
          wrapper.classList.replace('is-portrait', 'is-landscape');
        }
      }
    };
    if (img.complete) {
      verifyOrientation();
    } else {
      img.addEventListener('load', verifyOrientation);
    }
  });
}

// --- Edit Mode ---
function enterEditMode() {
  isEditMode = true;
  document.body.classList.add('is-editing');
  editBtn?.classList.add('hidden');
  editActions?.classList.remove('hidden');
  const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
  initialOrder = orderNodes.map(node => node.getAttribute('data-id') || '');
  const el = document.getElementById('gallery');

  if (galleryConfig.canSort && el) {
    sortableInstance = new Sortable(el, {
      animation: 150,
      ghostClass: 'sortable-ghost',
      onEnd: () => { if (typeof (window as any).resizeAllGridItems === 'function') (window as any).resizeAllGridItems(); }
    });
  }
  setTimeout(() => { if (typeof (window as any).resizeAllGridItems === 'function') (window as any).resizeAllGridItems(); }, 50);
}

function exitEditMode() {
  isEditMode = false;
  document.body.classList.remove('is-editing');
  editBtn?.classList.remove('hidden');
  editActions?.classList.add('hidden');
  if (sortableInstance) sortableInstance.destroy();
  setTimeout(() => { if (typeof (window as any).resizeAllGridItems === 'function') (window as any).resizeAllGridItems(); }, 50);
}

// --- Mini Gallery Logic ---
function renderMiniGallery() {
  if (!miniGalleryGrid) return;
  miniGalleryGrid.innerHTML = '';
  const postId = currentEditingWrapper ? currentEditingWrapper.getAttribute('data-id') : null;
  const post = allPosts.find((p: any) => p.id === postId);
  const canEdit = galleryConfig.isAdmin || (post && post.owner_clerk_id === galleryConfig.userId);

  currentMiniImages.forEach((src, idx) => {
    const div = document.createElement('div');
    div.className = 'mini-gallery-item';
    div.innerHTML = `
      <img src="${src}" alt="img ${idx}" draggable="false" style="pointer-events: none;" />
      ${canEdit ? `<button class="mini-delete-btn" data-idx="${idx}">×</button>` : ''}
    `;
    miniGalleryGrid.appendChild(div);
  });

  if (canEdit) {
    miniGalleryGrid.querySelectorAll('.mini-delete-btn').forEach((btn: any) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-idx')!);
        pendingMiniDeleteIdx = idx;
        const delModal = document.getElementById('confirm-delete-modal');
        if (delModal) {
          delModal.querySelector('.modal-title')!.textContent = 'Delete Image';
          delModal.querySelector('.modal-caption')!.textContent = 'Are you sure you want to remove this image from the stack?';
        }
        openModal(delModal);
      });
    });
  }
}

let miniSortable: any = null;
function enableMiniSortable(canEdit: boolean) {
  if (miniSortable) miniSortable.destroy();
  if (!canEdit || !miniGalleryGrid) return;

  miniSortable = new Sortable(miniGalleryGrid, {
    animation: 150,
    filter: '.mini-delete-btn',
    preventOnFilter: false,
    onEnd: (evt: any) => {
      const el = currentMiniImages.splice(evt.oldIndex, 1)[0];
      currentMiniImages.splice(evt.newIndex, 0, el);
    }
  });
}

function openMiniGallery(wrapper: HTMLElement) {
  currentEditingWrapper = wrapper;
  const postId = wrapper.getAttribute('data-id');
  const post = allPosts.find((p: any) => p.id === postId);
  const canEdit = galleryConfig.isAdmin || (post && post.owner_clerk_id === galleryConfig.userId);

  const imagesRaw = wrapper.getAttribute('data-images') || '[]';
  currentMiniImages = JSON.parse(imagesRaw);
  originalMiniImages = JSON.stringify(currentMiniImages);

  if (miniCaptionInput) {
    miniCaptionInput.value = wrapper.getAttribute('data-caption') || '';
    originalMiniCaption = miniCaptionInput.value;
    miniCaptionInput.readOnly = !canEdit;
  }

  if (miniAuthorInput) {
    miniAuthorInput.value = wrapper.getAttribute('data-author') || '';
    originalMiniAuthor = miniAuthorInput.value;
    miniAuthorInput.readOnly = !canEdit;
  }

  if (canEdit) {
    miniImportBtn?.classList.remove('hidden');
    if (confirmMiniGalleryBtn) confirmMiniGalleryBtn.innerText = 'Done';
  } else {
    miniImportBtn?.classList.add('hidden');
    if (confirmMiniGalleryBtn) confirmMiniGalleryBtn.innerText = 'Done';
  }

  renderMiniGallery();
  enableMiniSortable(canEdit);
  openModal(miniGalleryModal);
}

// --- PhotoSwipe ---
function attachGalleryListeners() {
  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach((btn: any) => {
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      pendingPostId = btn.getAttribute('data-id');
      openModal(confirmDeleteModal);
    });
  });

  // Gallery item clicks (PhotoSwipe or edit)
  document.querySelectorAll('.gallery-item-wrapper').forEach((wrapper: any) => {
    wrapper.addEventListener('click', (e: Event) => {
      if (document.body.classList.contains('is-editing')) {
        if ((e.target as HTMLElement).closest('.delete-btn')) return;
        e.preventDefault();
        e.stopPropagation();
        openMiniGallery(wrapper);
        return;
      }

      e.preventDefault();
      if (document.body.classList.contains('is-swiping')) return;
      const imagesRaw = wrapper.getAttribute('data-images');
      const captionStr = wrapper.getAttribute('data-caption');

      if (imagesRaw) {
        const imagesArray = JSON.parse(imagesRaw);
        const pswpItems = imagesArray.map((imgSrc: string) => ({
          src: imgSrc, width: 0, height: 0, alt: captionStr
        }));

        const pswp = new PhotoSwipe({
          dataSource: pswpItems,
          mainScrollEnd: true,
          spacing: window.innerWidth > 768 ? -0.35 : 0.05,
          paddingFn: (_viewportSize: any, _itemData: any, _index: number) => {
            const pad = window.innerWidth > 768 ? window.innerWidth * 0.22 : 20;
            return { top: 40, bottom: 80, left: pad, right: pad };
          }
        });

        const adjustSpacing = () => {
          if (window.innerWidth <= 768) return;
          if (!(pswp as any).currSlide || !(pswp as any).currSlide.data || !(pswp as any).currSlide.data.width) return;
          const ratio = (pswp as any).currSlide.data.width / (pswp as any).currSlide.data.height;
          let newSpacing = -0.40;
          if (ratio < 0.8) newSpacing = -0.65;
          else if (ratio < 1.2) newSpacing = -0.45;
          if (pswp.options.spacing !== newSpacing) {
            pswp.options.spacing = newSpacing;
            pswp.updateSize(false);
          }
        };

        pswp.on('change', adjustSpacing);
        pswp.on('firstUpdate', adjustSpacing);

        pswp.on('uiRegister', function() {
          pswp.ui!.registerElement({
            name: 'custom-caption',
            order: 9, isButton: false, appendTo: 'root', html: '',
            onInit: (el: HTMLElement, pswpInstance: any) => {
              pswpInstance.on('change', () => {
                const currentAuthor = wrapper.getAttribute('data-author');
                let finalCaption = captionStr ? captionStr.replace(/\n/g, '<br>') : '';
                if (currentAuthor && currentAuthor.trim() !== '') {
                  finalCaption += `<br>BY <b>${currentAuthor.trim()}</b>`;
                }
                el.innerHTML = finalCaption;
              });
            }
          });
        });

        pswp.on('gettingData', (e: any) => {
          const item = e.data;
          if (item.width > 0) return;
          const img = new Image();
          img.onload = () => {
            item.width = img.naturalWidth; item.height = img.naturalHeight;
            pswp.refreshSlideContent(e.index); pswp.updateSize(true);
          };
          img.src = item.src;
        });
        pswp.init();
      }
    });
  });
}

// --- New Local Upload (R2) ---
async function handleLocalUpload() {
  if (!fileInput) return;
  const files = Array.from(fileInput.files || []);
  const captionEl = document.getElementById('local-caption-input') as HTMLTextAreaElement;
  const authorEl = document.getElementById('local-author-input') as HTMLInputElement;
  const caption = captionEl?.value || '';
  const author = authorEl?.value || '';
  if (files.length === 0) return;

  openModal(progressModal);
  if (progressTitle) progressTitle.innerText = 'Importing...';
  if (progressStatusText) progressStatusText.innerText = 'Uploading images...';
  if (progressBarInner) progressBarInner.style.width = '10%';

  const timestamp = Date.now();
  const postId = `local-${timestamp}`;
  const imageUrls: string[] = [];
  let isPortrait = false;

  try {
    if (files[0]) {
      const img = new Image();
      img.src = URL.createObjectURL(files[0]);
      await new Promise(r => {
        img.onload = r;
        img.onerror = r;
      });
      isPortrait = (img.naturalHeight > img.naturalWidth);
    }

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const fileName = `p_local_${timestamp}_${i}.jpg`;
      if (progressStatusText) progressStatusText.innerText = `Uploading image ${i + 1}/${files.length}...`;
      if (progressBarInner) progressBarInner.style.width = `${10 + ((i + 1) / files.length) * 50}%`;
      const finalUrl = await uploadToR2(file, fileName);
      imageUrls.push(finalUrl);
    }

    if (progressStatusText) progressStatusText.innerText = 'Saving post...';
    if (progressBarInner) progressBarInner.style.width = '80%';

    const newPost: any = {
      id: postId,
      caption: caption,
      author: author,
      timestamp: new Date().toISOString(),
      images: imageUrls,
      hidden: false,
      category: 'General',
      isPortrait: isPortrait,
    };

    const createRes = await fetch('/api/stacks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newPost),
    });
    if (!createRes.ok) {
      const errData = await createRes.json();
      throw new Error(errData.error || 'Failed to create stack');
    }

    allPosts.push(newPost);
    renderGallery();

    if (progressBarInner) progressBarInner.style.width = '100%';
    if (progressStatusText) progressStatusText.innerText = 'Import complete!';
    refreshPageBtn?.classList.add('active');

    fileInput.value = '';
    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
  } catch (e: any) {
    if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
  }
}

// --- Grid Masonry (No-op, layout handled by CSS) ---
(window as any).resizeGridItem = function() {};
(window as any).resizeAllGridItems = function() {};

// --- Load Gallery Data ---
async function loadGallery() {
  try {
    const res = await fetch(`${galleryConfig.postsApiUrl}${galleryConfig.postsApiUrl.includes('?') ? '&' : '?'}t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load gallery data');
    allPosts = await res.json();
    renderGallery();
  } catch (e) {
    console.error('Gallery load error:', e);
    const galleryEl = document.getElementById('gallery');
    if (galleryEl) {
      galleryEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: rgba(255,255,255,0.3); padding: 4rem 0;">Failed to load gallery. Please refresh.</p>';
    }
  }
}

// ==========================================
// ENTRY POINT
// ==========================================
export function initGallery(config: GalleryConfig) {
  galleryConfig = config;

  console.log(`--- Gallery Module v3.0.0 (${config.mode} mode) ---`);

  // Resolve DOM elements
  importModal = document.getElementById('import-modal');
  progressModal = document.getElementById('progress-modal');
  fileInput = document.getElementById('local-file-input') as HTMLInputElement;
  progressBarInner = document.getElementById('progress-bar-inner');
  progressStatusText = document.getElementById('progress-status-text');
  progressTitle = document.getElementById('progress-title');
  refreshPageBtn = document.getElementById('refresh-page-btn');
  editBtn = document.getElementById('open-edit-mode');
  editActions = document.getElementById('edit-actions');
  saveBtn = document.getElementById('save-edits');
  cancelBtn = document.getElementById('cancel-edits');
  addBtn = document.getElementById('add-new-post');
  galleryBottomBar = document.getElementById('gallery-bottom-bar');
  confirmDiscardModal = document.getElementById('confirm-discard-modal');
  confirmDiscardBtn = document.getElementById('confirm-discard-btn');
  cancelDiscardBtn = document.getElementById('cancel-discard-btn');
  confirmDeleteModal = document.getElementById('confirm-delete-modal');
  miniGalleryModal = document.getElementById('mini-gallery-modal');
  closeMiniGalleryBtn = document.getElementById('close-mini-gallery');
  confirmMiniGalleryBtn = document.getElementById('confirm-mini-gallery');
  miniGalleryGrid = document.getElementById('mini-gallery-grid');
  miniCaptionInput = document.getElementById('mini-caption-input') as HTMLTextAreaElement;
  miniAuthorInput = document.getElementById('mini-author-input') as HTMLInputElement;
  miniImportBtn = document.getElementById('mini-import-btn');
  miniFileInput = document.getElementById('mini-file-input') as HTMLInputElement;

  // Show bottom bar if user is authorized to see it based on mode
  const canSeeEditControls = config.mode === 'main' ? !!config.userId : config.canSort;
  if (canSeeEditControls && galleryBottomBar) {
    galleryBottomBar.style.display = 'flex';
  }

  // --- Edit Mode Events ---
  editBtn?.addEventListener('click', () => { if (!isEditMode) enterEditMode(); });

  cancelBtn?.addEventListener('click', () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const currentOrder = orderNodes.map(node => node.getAttribute('data-id') || '');
    if (currentOrder.join(',') !== initialOrder.join(',')) {
      pendingAction = 'DISCARD_EDITS';
      openModal(confirmDiscardModal);
    } else {
      exitEditMode();
    }
  });

  confirmDiscardBtn?.addEventListener('click', () => {
    if (pendingAction === 'DISCARD_MINI_GALLERY') {
      closeModal(confirmDiscardModal);
      closeModal(miniGalleryModal);
      pendingAction = null;
    } else {
      window.location.reload();
    }
  });

  cancelDiscardBtn?.addEventListener('click', () => closeModal(confirmDiscardModal));

  // --- Save Order ---
  saveBtn?.addEventListener('click', async () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const newOrder = orderNodes.map(node => node.getAttribute('data-id') || '');
    if (newOrder.join(',') === initialOrder.join(',')) {
      exitEditMode();
      return;
    }
    openModal(progressModal);
    if (progressTitle) progressTitle.innerText = 'Saving Order...';
    if (progressStatusText) progressStatusText.innerText = 'Updating...';
    if (progressBarInner) progressBarInner.style.width = '30%';

    try {
      const orderedPosts = newOrder.map(id => allPosts.find((p: any) => p.id === id)).filter(Boolean);
      const missingPosts = allPosts.filter((p: any) => !newOrder.includes(p.id));
      const updatedPosts = [...orderedPosts, ...missingPosts];
      await savePostsToR2(updatedPosts, config.saveScope);
      allPosts = updatedPosts;
      if (progressBarInner) progressBarInner.style.width = '100%';
      if (progressStatusText) progressStatusText.innerText = 'Order saved!';
      refreshPageBtn?.classList.add('active');
    } catch (e: any) {
      if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
    }
    exitEditMode();
  });

  // --- Delete Post ---
  const origConfirmDeleteBtn = document.getElementById('confirm-delete-btn');
  if (origConfirmDeleteBtn) {
    const newConfirmDeleteBtn = origConfirmDeleteBtn.cloneNode(true) as HTMLElement;
    origConfirmDeleteBtn.parentNode!.replaceChild(newConfirmDeleteBtn, origConfirmDeleteBtn);

    newConfirmDeleteBtn.addEventListener('click', async () => {
      closeModal(confirmDeleteModal);
      if (pendingMiniDeleteIdx !== null) {
        const idx = pendingMiniDeleteIdx;
        pendingMiniDeleteIdx = null;
        currentMiniImages.splice(idx, 1);
        renderMiniGallery();

        if (currentEditingWrapper) {
          const postId = currentEditingWrapper.getAttribute('data-id');
          openModal(progressModal);
          if (progressTitle) progressTitle.innerText = 'Removing Image...';
          if (progressStatusText) progressStatusText.innerText = 'Updating...';
          if (progressBarInner) progressBarInner.style.width = '40%';
          try {
            closeModal(miniGalleryModal);
            const updatedPost = allPosts.find((p: any) => p.id === postId);
            if (updatedPost) {
              updatedPost.images = [...currentMiniImages];
              await savePostsToR2(allPosts, config.saveScope);
            }
            renderGallery();
            if (progressBarInner) progressBarInner.style.width = '100%';
            if (progressStatusText) progressStatusText.innerText = 'Image removed!';
            refreshPageBtn?.classList.add('active');
          } catch (e: any) {
            if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
          }
        }
      } else if (pendingPostId) {
        openModal(progressModal);
        if (progressTitle) progressTitle.innerText = 'Deleting Post...';
        if (progressStatusText) progressStatusText.innerText = 'Removing...';
        if (progressBarInner) progressBarInner.style.width = '30%';
        try {
          const delRes = await fetch(`/api/stacks/${pendingPostId}`, { method: 'DELETE' });
          if (!delRes.ok) {
            const errData = await delRes.json();
            throw new Error(errData.error || 'Failed to delete');
          }
          allPosts = allPosts.filter((p: any) => p.id !== pendingPostId);
          renderGallery();
          if (progressBarInner) progressBarInner.style.width = '100%';
          if (progressStatusText) progressStatusText.innerText = 'Post deleted!';
          refreshPageBtn?.classList.add('active');
        } catch (e: any) {
          if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
        }
        pendingPostId = null;
      }
    });
  }

  const origCancelDeleteBtn = document.getElementById('cancel-delete-btn');
  if (origCancelDeleteBtn) {
    const newCancelDeleteBtn = origCancelDeleteBtn.cloneNode(true) as HTMLElement;
    origCancelDeleteBtn.parentNode!.replaceChild(newCancelDeleteBtn, origCancelDeleteBtn);
    newCancelDeleteBtn.addEventListener('click', () => {
      pendingMiniDeleteIdx = null;
      pendingPostId = null;
      closeModal(confirmDeleteModal);
      if (confirmDeleteModal) {
        confirmDeleteModal.querySelector('.modal-title')!.textContent = 'Delete Stack';
        confirmDeleteModal.querySelector('.modal-caption')!.textContent = 'Are you sure you want to delete this stack? This action cannot be undone.';
      }
    });
  }

  // --- File Input Handlers ---
  fileInput?.addEventListener('click', () => { filePickerActive = true; });
  fileInput?.addEventListener('change', () => {
    filePickerActive = false;
    const fileNameDisplay = document.getElementById('file-name-display');
    if (fileInput!.files && fileInput!.files.length > 0) {
      const count = fileInput!.files.length;
      if (fileNameDisplay) fileNameDisplay.textContent = `${count} file${count > 1 ? 's' : ''} chosen`;
    } else {
      if (fileNameDisplay) fileNameDisplay.textContent = 'No file chosen';
    }
  });
  fileInput?.addEventListener('cancel', () => { filePickerActive = false; });

  addBtn?.addEventListener('click', () => {
    pendingAction = 'IMPORT';
    openModal(importModal);
  });

  document.getElementById('close-import-modal')?.addEventListener('click', () => closeModal(importModal));
  refreshPageBtn?.addEventListener('click', () => window.location.reload());

  document.getElementById('confirm-import')?.addEventListener('click', () => {
    handleLocalUpload();
    closeModal(importModal);
  });

  // --- Mini Gallery Events ---
  miniImportBtn?.addEventListener('click', () => {
    filePickerActive = true;
    miniFileInput?.click();
  });

  miniFileInput?.addEventListener('change', (e: Event) => {
    filePickerActive = false;
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (re: any) => {
        currentMiniImages.push(re.target.result);
        renderMiniGallery();
      };
      reader.readAsDataURL(file);
    });
  });
  miniFileInput?.addEventListener('cancel', () => { filePickerActive = false; });

  closeMiniGalleryBtn?.addEventListener('click', () => {
    const hasChanges = JSON.stringify(currentMiniImages) !== originalMiniImages ||
                      (miniCaptionInput?.value || '') !== originalMiniCaption ||
                      (miniAuthorInput?.value || '') !== originalMiniAuthor;
    if (hasChanges) {
      pendingAction = 'DISCARD_MINI_GALLERY';
      openModal(confirmDiscardModal);
    } else {
      closeModal(miniGalleryModal);
    }
  });

  // --- Confirm Mini Gallery (R2 upload for new images) ---
  confirmMiniGalleryBtn?.addEventListener('click', async () => {
    if (!currentEditingWrapper) { closeModal(miniGalleryModal); return; }
    const postId = currentEditingWrapper.getAttribute('data-id');
    const post = allPosts.find((p: any) => p.id === postId);
    const canEdit = galleryConfig.isAdmin || (post && post.owner_clerk_id === galleryConfig.userId);

    if (!canEdit) {
      closeModal(miniGalleryModal);
      return;
    }

    const newCaption = miniCaptionInput?.value || '';
    const newAuthor = miniAuthorInput?.value || '';
    const hasChanges = JSON.stringify(currentMiniImages) !== originalMiniImages ||
                      newCaption !== originalMiniCaption ||
                      newAuthor !== originalMiniAuthor;
    if (!hasChanges) { closeModal(miniGalleryModal); return; }

    const newDataUrls: {idx: number; dataUrl: string}[] = [];
    currentMiniImages.forEach((src, idx) => {
      if (src.startsWith('data:')) newDataUrls.push({ idx, dataUrl: src });
    });

    closeModal(miniGalleryModal);
    openModal(progressModal);
    if (progressTitle) progressTitle.innerText = 'Updating Stack...';
    if (progressStatusText) progressStatusText.innerText = 'Uploading new images...';
    if (progressBarInner) progressBarInner.style.width = '10%';

    try {
      const timestamp = Date.now();
      for (let i = 0; i < newDataUrls.length; i++) {
        const { idx, dataUrl } = newDataUrls[i];
        if (progressStatusText) progressStatusText.innerText = `Uploading image ${i + 1}/${newDataUrls.length}...`;
        if (progressBarInner) progressBarInner.style.width = `${10 + ((i + 1) / newDataUrls.length) * 50}%`;

        const blob = dataUrlToBlob(dataUrl);
        const fileName = `p_${postId}_add_${timestamp}_${i}.jpg`;
        const finalUrl = await uploadToR2(blob, fileName);
        currentMiniImages[idx] = finalUrl;
      }

      if (progressStatusText) progressStatusText.innerText = 'Saving...';
      if (progressBarInner) progressBarInner.style.width = '80%';

      const updatedPost = allPosts.find((p: any) => p.id === postId);
      if (updatedPost) {
        updatedPost.images = [...currentMiniImages];
        updatedPost.caption = newCaption;
        updatedPost.author = newAuthor;
      }
      await savePostsToR2(allPosts, config.saveScope);
      renderGallery();

      if (progressBarInner) progressBarInner.style.width = '100%';
      if (progressStatusText) progressStatusText.innerText = 'Stack updated!';
      refreshPageBtn?.classList.add('active');
    } catch (e: any) {
      if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
    }
  });

  // --- Grid Masonry ---
  window.addEventListener('load', (window as any).resizeAllGridItems);
  window.addEventListener('resize', (window as any).resizeAllGridItems);

  // --- Initial Load ---
  loadGallery();
}
