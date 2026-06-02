import { state } from './state';

/**
 * gallery.ts — Shared gallery logic for both main page and personal pages.
 * Handles: rendering, edit mode, PhotoSwipe, upload, mini gallery, drag-drop sorting.
 */
import PhotoSwipe from 'photoswipe';
import Sortable from 'sortablejs';
import { uploadToR2, savePostsToR2, dataUrlToBlob } from './api';

export interface GalleryConfig {
  mode: 'main' | 'personal';
  userId: string | null;
  isAdmin: boolean;
  ownerClerkId?: string;     // personal page: the page owner's clerk_id
  canSort: boolean;           // whether drag-drop sorting is allowed
  postsApiUrl: string;        // e.g. '/api/posts' or '/api/posts?owner=xxx&sort=personal'
  saveScope?: string;         // 'personal' for personal page sort saves
  isOwner?: boolean;          // whether the current user owns this personal page
  initialExpanded?: boolean;  // initial expand state from DB
}

// ==========================================
// R2-BACKED GALLERY — SHARED MODULE
// ==========================================

const UPLOAD_API = '/api/upload';
const POSTS_API = '/api/posts';

// --- Global State ---

// --- DOM Elements (resolved at init time) ---

// --- Global Toast Helper ---
function showSystemToast(message: string, isError = false) {
  const toast = document.createElement('div');
  toast.className = `system-toast ${isError ? 'is-error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  
  // Trigger reflow
  toast.offsetHeight;
  toast.classList.add('visible');
  
  setTimeout(() => {
    toast.classList.remove('visible');
    setTimeout(() => toast.remove(), 400);
  }, 3000);
}

// --- Modal Helpers ---
function openModal(modal: HTMLElement | null) {
  if (modal) { modal.classList.add('active'); document.body.style.overflow = 'hidden'; }
}
function closeModal(modal: HTMLElement | null) {
  if (state.filePickerActive) return;
  if (modal) {
    modal.classList.remove('active');
    if (!document.querySelector('.modal-overlay.active')) document.body.style.overflow = '';
  }
}

function renderLocalPreviewGrid() {
  const localPreviewGrid = document.getElementById('local-preview-grid');
  const localChooseHeader = document.getElementById('local-choose-header');
  
  if (!localPreviewGrid) return;
  localPreviewGrid.innerHTML = '';
  
  if (state.pendingUploadFiles.length > 0) {
    if (localChooseHeader) localChooseHeader.style.display = 'none';
    localPreviewGrid.style.display = 'grid';
    localPreviewGrid.style.marginTop = '0';
    
    state.pendingUploadFiles.forEach((item, idx) => {
      const div = document.createElement('div');
      div.className = 'mini-gallery-item';
      
      const imgObj = new Image();
      imgObj.onload = () => {
        const isPortrait = imgObj.naturalHeight > imgObj.naturalWidth;
        if (isPortrait) {
          div.classList.add('is-portrait');
        } else {
          div.classList.add('is-landscape');
        }

        if (idx === state.pendingUploadFiles.length - 1) {
           const addBtn = document.getElementById('local-add-more-btn');
           if (addBtn) {
             addBtn.className = `mini-gallery-item ${isPortrait ? 'is-portrait' : 'is-landscape'}`;
           }
        }
      };
      imgObj.src = item.dataUrl;

      div.innerHTML = `
        <img src="${item.dataUrl}" alt="preview ${idx}" style="pointer-events: none;" />
        <button class="mini-delete-btn" data-idx="${idx}">×</button>
      `;
      localPreviewGrid.appendChild(div);
    });

    const addDiv = document.createElement('div');
    addDiv.id = 'local-add-more-btn';
    addDiv.className = 'mini-gallery-item is-landscape';
    addDiv.style.border = '1px dashed rgba(255, 255, 255, 0.4)';
    addDiv.style.backgroundColor = 'transparent';
    addDiv.style.cursor = 'pointer';
    addDiv.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 2rem; height: 2rem; stroke: rgba(255, 255, 255, 0.6); stroke-width: 1; fill: none; pointer-events: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    addDiv.addEventListener('click', () => {
      document.getElementById('local-file-input')?.click();
    });
    localPreviewGrid.appendChild(addDiv);

    localPreviewGrid.querySelectorAll('.mini-delete-btn').forEach((btn: any) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        const idx = parseInt((e.target as HTMLElement).getAttribute('data-idx') || '0');
        state.pendingUploadFiles.splice(idx, 1);
        renderLocalPreviewGrid();
      });
    });

    enableLocalSortable(localPreviewGrid);
  } else {
    if (localChooseHeader) localChooseHeader.style.display = 'flex';
    localPreviewGrid.style.display = 'none';
  }
}

function enableLocalSortable(grid: HTMLElement) {
  if (state.localSortable) state.localSortable.destroy();
  state.localSortable = new Sortable(grid, {
    animation: 150,
    filter: '.mini-delete-btn, .add-more-btn-cell',
    preventOnFilter: false,
    onMove: (evt: any) => {
      return evt.related.className.indexOf('add-more-btn-cell') === -1;
    },
    onEnd: (evt: any) => {
      const el = state.pendingUploadFiles.splice(evt.oldIndex, 1)[0];
      state.pendingUploadFiles.splice(evt.newIndex, 0, el);
      renderLocalPreviewGrid(); // Fix data-idx bindings and add-more button class
    }
  });
}

import { generateImageVersions } from '../compress';

function getImageUrl(img: any): string {
  if (!img) return '';
  return typeof img === 'string' ? img : (img.url || '');
}

function getPhotoId(img: any): string {
  if (!img || typeof img !== 'object') return '';
  return img.photoId || '';
}

function escapeHTML(str: string): string {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// --- Gallery Rendering ---
function createGalleryItemHTML(post: any): string {
  const images = post.images || [];
  const imageUrls = images.map(getImageUrl);
  const isCarousel = imageUrls.length > 1;
  const firstImage = images.length > 0 ? images[0] : null;
  const mainUrl = getImageUrl(firstImage);
  const thumbnail = firstImage && typeof firstImage === 'object' && firstImage.thumbnail_url ? firstImage.thumbnail_url : mainUrl;
  const lqip = firstImage && typeof firstImage === 'object' && firstImage.lqip ? firstImage.lqip : '';
  const imagesData = escapeHTML(JSON.stringify(imageUrls));
  const captionData = escapeHTML(post.caption || '');
  const authorData = escapeHTML(post.author || '');
  const ownerUsernameData = escapeHTML(post.owner_username || '');

  let isPortrait = post.isPortrait;
  if (firstImage && typeof firstImage === 'object' && firstImage.isPortrait !== undefined) {
    isPortrait = firstImage.isPortrait;
  }
  const orientationClass = isPortrait === true ? 'is-portrait' : 'is-landscape';

  let canEdit = false;
  if (state.galleryConfig.userId) {
    canEdit = state.galleryConfig.isAdmin || post.owner_clerk_id === state.galleryConfig.userId;
  }
  
  const isHideBtnVisible = state.galleryConfig.mode === 'main' && state.galleryConfig.isAdmin;
  let hideClass = '';
  if (isHideBtnVisible && post.is_hidden_from_global) hideClass = 'is-ghosted';

  const hideBtnHTML = isHideBtnVisible ? `
    <button class="hide-btn" aria-label="Toggle Hide" data-id="${post.id}" data-hidden="${post.is_hidden_from_global || false}" onclick="event.stopPropagation();">
      <svg viewBox="0 0 24 24">
        ${post.is_hidden_from_global 
          ? '<line x1="5" y1="12" x2="19" y2="12"></line><line x1="12" y1="5" x2="12" y2="19"></line>' 
          : '<line x1="5" y1="12" x2="19" y2="12"></line>'}
      </svg>
    </button>
  ` : '';

  const deleteBtnHTML = canEdit ? `
        <button class="delete-btn" aria-label="Delete Post" data-id="${post.id}" onclick="event.stopPropagation();">
          <svg viewBox="0 0 24 24">
            <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
            <line x1="10" y1="11" x2="10" y2="17"></line>
            <line x1="14" y1="11" x2="14" y2="17"></line>
          </svg>
        </button>` : '';

  const lqipStyle = lqip ? `background-image: url('${lqip}'); background-size: cover; background-position: center;` : '';
  const srcset = (thumbnail !== mainUrl) ? `srcset="${escapeHTML(thumbnail)} 640w, ${escapeHTML(mainUrl)} 2400w" sizes="(max-width: 600px) 100vw, 33vw"` : '';

  return `
    <div class="gallery-item-wrapper ${orientationClass} ${hideClass}" data-id="${escapeHTML(post.id)}" data-images="${imagesData}" data-caption="${captionData}" data-author="${authorData}" data-owner-username="${ownerUsernameData}" data-needs-check="${isPortrait === undefined}">
      <a href="${escapeHTML(mainUrl)}" class="gallery-item" tabindex="0" data-pswp-src="${escapeHTML(mainUrl)}" style="${lqipStyle}">
        <img src="${escapeHTML(thumbnail)}" ${srcset} class="${lqip ? 'has-lqip' : ''}" alt="${captionData || 'Gallery Post'}" loading="lazy" decoding="async" />
        ${deleteBtnHTML}
        ${hideBtnHTML}
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

function buildExpandedPhotos(): any[] {
  const photos: any[] = [];
  for (const post of state.allPosts) {
    if (post.hidden) continue;
    const images = post.images || [];
    for (const img of images) {
      photos.push({
        url: getImageUrl(img),
        thumbnail_url: typeof img === 'object' ? img.thumbnail_url : null,
        lqip: typeof img === 'object' ? img.lqip : null,
        photoId: getPhotoId(img),
        expandedSortOrder: typeof img === 'object' ? img.expandedSortOrder : null,
        stackId: post.id,
        caption: post.caption,
        author: post.author,
        owner_username: post.owner_username,
        owner_clerk_id: post.owner_clerk_id,
        isPortrait: typeof img === 'object' && img.isPortrait !== undefined ? img.isPortrait : post.isPortrait,
      });
    }
  }
  // Handle expandedSortOrder sorting
  photos.sort((a, b) => {
    const orderA = (a.expandedSortOrder !== null && a.expandedSortOrder !== undefined) ? a.expandedSortOrder : 999999;
    const orderB = (b.expandedSortOrder !== null && b.expandedSortOrder !== undefined) ? b.expandedSortOrder : 999999;
    
    if (orderA !== orderB) return orderA - orderB;
    // Fallback to natural order (appearance in allPosts) if both are unordered
    return 0;
  });
  return photos;
}

function createExpandedItemHTML(photo: any): string {
  let canEdit = false;
  if (state.galleryConfig.userId) {
    canEdit = state.galleryConfig.isAdmin || photo.owner_clerk_id === state.galleryConfig.userId;
  }

  const deleteBtnHTML = canEdit ? `
    <button class="delete-btn" aria-label="Delete Photo" data-photo-id="${photo.photoId}" onclick="event.stopPropagation();">
      <svg viewBox="0 0 24 24">
        <path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"></path>
        <line x1="10" y1="11" x2="10" y2="17"></line>
        <line x1="14" y1="11" x2="14" y2="17"></line>
      </svg>
    </button>` : '';

  const thumbnail = photo.thumbnail_url || photo.url;
  const lqip = photo.lqip || '';
  const lqipStyle = lqip ? `background-image: url('${lqip}'); background-size: cover; background-position: center;` : '';
  const srcset = (thumbnail !== photo.url) ? `srcset="${escapeHTML(thumbnail)} 640w, ${escapeHTML(photo.url)} 2400w" sizes="(max-width: 600px) 100vw, 33vw"` : '';
  
  const orientationClass = photo.isPortrait === true ? 'is-portrait' : 'is-landscape';

  return `
    <div class="gallery-item-wrapper ${orientationClass}" data-photo-id="${escapeHTML(photo.photoId)}" data-stack-id="${escapeHTML(photo.stackId)}" data-owner-username="${escapeHTML(photo.owner_username)}" data-author="${escapeHTML(photo.author)}">
      <a href="${escapeHTML(photo.url)}" class="gallery-item" tabindex="0" data-pswp-src="${escapeHTML(photo.url)}" style="${lqipStyle}">
        <img src="${escapeHTML(thumbnail)}" ${srcset} class="${lqip ? 'has-lqip' : ''}" alt="${escapeHTML(photo.caption || 'Photo')}" loading="lazy" decoding="async" />
        ${deleteBtnHTML}
      </a>
    </div>
  `;
}

function renderExpandedGallery() {
  const galleryEl = document.getElementById('gallery');
  if (!galleryEl) return;
  state.expandedPhotos = buildExpandedPhotos().filter(p => !state.pendingDeletedPhotoIds.includes(p.photoId));

  if (state.expandedPhotos.length === 0) {
    galleryEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: rgba(255,255,255,0.3); padding: 4rem 0;">No photos yet.</p>';
  } else {
    galleryEl.innerHTML = state.expandedPhotos.map(createExpandedItemHTML).join('');
  }

  attachExpandedListeners();

  // Auto-detect orientation per photo
  galleryEl.querySelectorAll('.gallery-item-wrapper img').forEach((img: any) => {
    const setOrientation = () => {
      const wrapper = img.closest('.gallery-item-wrapper');
      if (img.naturalHeight > img.naturalWidth) {
        wrapper.classList.add('is-portrait');
        wrapper.classList.remove('is-landscape');
      } else {
        wrapper.classList.add('is-landscape');
        wrapper.classList.remove('is-portrait');
      }
    };
    if (img.complete) {
      setOrientation();
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img.classList.add('loaded');
        });
      });
    } else {
      img.addEventListener('load', () => {
        setOrientation();
        requestAnimationFrame(() => {
          img.classList.add('loaded');
        });
      });
    }
  });

  applyGalleryAnimations(galleryEl);
}

function attachExpandedListeners() {
  // Delete buttons in expanded mode
  document.querySelectorAll('.delete-btn[data-photo-id]').forEach((btn: any) => {
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const photoId = btn.getAttribute('data-photo-id');
      if (photoId) {
        state.pendingDeletedPhotoIds.push(photoId);
        const wrapper = btn.closest('.gallery-item-wrapper');
        if (wrapper) wrapper.remove();
      }
    });
  });

  // PhotoSwipe: single image only
  document.querySelectorAll('.gallery-item-wrapper').forEach((wrapper: any) => {
    wrapper.addEventListener('click', (e: Event) => {
      if (document.body.classList.contains('is-editing')) {
        if ((e.target as HTMLElement).closest('.delete-btn')) return;
        return; // In edit mode, clicks on expanded items do nothing (just drag)
      }
      e.preventDefault();
      if (document.body.classList.contains('is-swiping')) return;
      const src = wrapper.querySelector('img')?.src;
      if (!src) return;

      const pswp = new PhotoSwipe({
        dataSource: [{ src, width: 0, height: 0 }],
        closeSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
        zoomSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line class="pswp__zoom-icn-bar-v" x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
        arrowPrevSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
        arrowNextSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
        paddingFn: (_viewportSize: any) => {
          const pad = window.innerWidth > 768 ? window.innerWidth * 0.22 : 20;
          return { top: 40, bottom: 80, left: pad, right: pad };
        }
      });
      registerPhotoSwipeUI(pswp, wrapper);
      pswp.on('gettingData', (ev: any) => {
        const item = ev.data;
        if (item.width > 0) return;
        const img = new Image();
        img.onload = () => {
          item.width = img.naturalWidth; item.height = img.naturalHeight;
          pswp.refreshSlideContent(ev.index); pswp.updateSize(true);
        };
        img.src = item.src;
      });
      pswp.init();
    });
  });
}

function expandGallery() {
  state.isExpanded = true;
  updateExpandBtn();
  renderExpandedGallery();
}

function collapseGallery() {
  state.isExpanded = false;
  state.pendingDeletedPhotoIds = [];
  updateExpandBtn();
  renderGallery();
}

function updateExpandBtn() {
  if (!state.expandBtn) return;
  const newText = state.isExpanded ? 'COLLAPSE' : 'EXPAND';
  const textSpan = state.expandBtn.querySelector('.text');
  if (textSpan) {
    textSpan.textContent = newText;
  } else {
    state.expandBtn.textContent = newText;
  }
}

function applyGalleryAnimations(galleryEl: HTMLElement) {
  const observer = new IntersectionObserver((entries) => {
    let delayIndex = 0;
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        setTimeout(() => entry.target.classList.add('revealed'), delayIndex * 80);
        delayIndex++;
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.1 });

  galleryEl.querySelectorAll('.gallery-item-wrapper').forEach(wrapper => {
    observer.observe(wrapper);
  });
}

function renderGallery() {
  const galleryEl = document.getElementById('gallery');
  if (!galleryEl) return;
  
  // Base visual layer (don't show strictly hidden items, and apply pending deletions)
  let visiblePosts = state.allPosts.filter((p: any) => !p.hidden && !state.pendingDeletedStackIds.includes(p.id));

  // Determine standard vs global-hidden separation
  if (state.galleryConfig.mode === 'main') {
    if (state.isEditMode && state.galleryConfig.isAdmin) {
      // Edit mode: Standard first, ghosted at the end
      const normal = visiblePosts.filter((p: any) => !p.is_hidden_from_global);
      const ghosted = visiblePosts.filter((p: any) => p.is_hidden_from_global);
      visiblePosts = [...normal, ...ghosted];
    } else {
      // Normal viewer: omit completely
      visiblePosts = visiblePosts.filter((p: any) => !p.is_hidden_from_global);
    }
  }

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
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          img.classList.add('loaded');
        });
      });
    } else {
      img.addEventListener('load', () => {
        verifyOrientation();
        requestAnimationFrame(() => {
          img.classList.add('loaded');
        });
      });
    }
  });

  applyGalleryAnimations(galleryEl);
}

// --- Edit Mode ---
function enterEditMode() {
  state.isEditMode = true;
  document.body.classList.add('is-editing');
  
  if (state.galleryConfig.mode === 'main' && state.galleryConfig.isAdmin) {
    renderGallery(); // Re-render to inject global-hidden items into the DOM!
  }
  
  state.editBtn?.classList.add('hidden');
  if (state.expandBtn) state.expandBtn.classList.add('hidden');
  const changeBgBtn = document.getElementById('change-bg-btn');
  if (changeBgBtn) changeBgBtn.classList.add('hidden');
  const createAlbumBtn = document.getElementById('add-new-post');
  if (createAlbumBtn) createAlbumBtn.classList.add('hidden');
  state.editActions?.classList.remove('hidden');
  const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
  state.initialOrder = orderNodes.map(node => (state.isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
  const el = document.getElementById('gallery');

  if (state.galleryConfig.canSort && el) {
    state.sortableInstance = new Sortable(el, {
      animation: 150,
      ghostClass: 'sortable-ghost',
    });
  }
}

function exitEditMode() {
  state.isEditMode = false;
  document.body.classList.remove('is-editing');
  
  const editControls = document.querySelector('.edit-controls');
  const editActions = document.getElementById('edit-actions');
  const openEditBtn = document.getElementById('open-edit-mode');
  const expandBtn = document.getElementById('expand-gallery-btn');
  const changeBgBtn = document.getElementById('change-bg-btn');

  editActions?.classList.add('hidden');
  openEditBtn?.classList.remove('hidden');
  if (expandBtn) expandBtn.classList.remove('hidden');
  if (changeBgBtn) changeBgBtn.classList.remove('hidden');
  const createAlbumBtn = document.getElementById('add-new-post');
  if (createAlbumBtn) createAlbumBtn.classList.remove('hidden');

  if (state.sortableInstance) state.sortableInstance.destroy();
}

// --- Mini Gallery Logic ---
function renderMiniGallery() {
  if (!state.miniGalleryGrid) return;
  state.miniGalleryGrid.innerHTML = '';
  const postId = state.currentEditingWrapper ? state.currentEditingWrapper.getAttribute('data-id') : null;
  const post = state.allPosts.find((p: any) => p.id === postId);
  const canEdit = state.galleryConfig.isAdmin || (post && post.owner_clerk_id === state.galleryConfig.userId);

  state.currentMiniImages.forEach((src, idx) => {
    const div = document.createElement('div');
    div.className = 'mini-gallery-item';

    const imgObj = new Image();
    imgObj.onload = () => {
      const isPortrait = imgObj.naturalHeight > imgObj.naturalWidth;
      if (isPortrait) {
        div.classList.add('is-portrait');
      } else {
        div.classList.add('is-landscape');
      }

      if (idx === state.currentMiniImages.length - 1 && canEdit) {
         const addBtn = document.getElementById('mini-add-more-btn');
         if (addBtn) {
           addBtn.className = `mini-gallery-item ${isPortrait ? 'is-portrait' : 'is-landscape'} add-more-btn-cell`;
         }
      }
    };
    imgObj.src = src;

    div.innerHTML = `
      <img src="${src}" alt="img ${idx}" draggable="false" style="pointer-events: none;" />
      ${canEdit ? `<button class="mini-delete-btn" data-idx="${idx}">×</button>` : ''}
    `;
    state.miniGalleryGrid?.appendChild(div);
  });

  if (canEdit && state.miniGalleryGrid && state.currentMiniImages.length > 0) {
    const addDiv = document.createElement('div');
    addDiv.id = 'mini-add-more-btn';
    addDiv.className = 'mini-gallery-item is-landscape add-more-btn-cell';
    addDiv.style.border = '1px dashed rgba(255, 255, 255, 0.4)';
    addDiv.style.backgroundColor = 'transparent';
    addDiv.style.cursor = 'pointer';
    addDiv.innerHTML = `
      <svg viewBox="0 0 24 24" style="width: 2rem; height: 2rem; stroke: rgba(255, 255, 255, 0.6); stroke-width: 1; fill: none; pointer-events: none; position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%);">
        <line x1="12" y1="5" x2="12" y2="19"></line>
        <line x1="5" y1="12" x2="19" y2="12"></line>
      </svg>
    `;
    addDiv.addEventListener('click', () => {
      document.getElementById('mini-file-input')?.click();
    });
    state.miniGalleryGrid.appendChild(addDiv);
  }

  if (canEdit && state.miniGalleryGrid) {
    state.miniGalleryGrid.querySelectorAll('.mini-delete-btn').forEach((btn: any) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        // Deferred Local Deletion!
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-idx')!);
        state.currentMiniImages.splice(idx, 1);
        renderMiniGallery(); // Re-render the grid instantly, wait for user to click Done to save R2
      });
    });
  }
}

function enableMiniSortable(canEdit: boolean) {
  if (state.miniSortable) state.miniSortable.destroy();
  if (!canEdit || !state.miniGalleryGrid) return;

  state.miniSortable = new Sortable(state.miniGalleryGrid, {
    animation: 150,
    filter: '.mini-delete-btn, .add-more-btn-cell',
    preventOnFilter: false,
    onMove: (evt: any) => {
      return evt.related.className.indexOf('add-more-btn-cell') === -1;
    },
    onEnd: (evt: any) => {
      const el = state.currentMiniImages.splice(evt.oldIndex, 1)[0];
      state.currentMiniImages.splice(evt.newIndex, 0, el);
      renderMiniGallery(); // Re-render to update data-idx for delete buttons
    }
  });
}

function openMiniGallery(wrapper: HTMLElement) {
  state.currentEditingWrapper = wrapper;
  const postId = wrapper.getAttribute('data-id');
  const post = state.allPosts.find((p: any) => p.id === postId);
  const canEdit = state.galleryConfig.isAdmin || (post && post.owner_clerk_id === state.galleryConfig.userId);

  const imagesRaw = wrapper.getAttribute('data-images') || '[]';
  state.currentMiniImages = JSON.parse(imagesRaw);
  state.originalMiniImages = JSON.stringify(state.currentMiniImages);

  if (state.miniCaptionInput) {
    state.miniCaptionInput.value = wrapper.getAttribute('data-caption') || '';
    state.originalMiniCaption = state.miniCaptionInput.value;
    state.miniCaptionInput.readOnly = !canEdit;
  }

  if (state.miniAuthorDisplay) {
    state.miniAuthorDisplay.innerText = wrapper.getAttribute('data-author') || '';
    state.originalMiniAuthor = wrapper.getAttribute('data-author') || '';
  }

  if (canEdit) {
    state.miniImportBtn?.classList.remove('hidden');
    if (state.confirmMiniGalleryBtn) state.confirmMiniGalleryBtn.innerText = 'Done';
  } else {
    state.miniImportBtn?.classList.add('hidden');
    if (state.confirmMiniGalleryBtn) state.confirmMiniGalleryBtn.innerText = 'Done';
  }

  renderMiniGallery();
  enableMiniSortable(canEdit);
  openModal(state.miniGalleryModal);
}

// --- PhotoSwipe ---
function registerPhotoSwipeUI(pswp: any, wrapper: HTMLElement, defaultCaption?: string) {
  pswp.on('uiRegister', function() {
    // 1. Custom Caption
    pswp.ui!.registerElement({
      name: 'custom-caption', order: 9, isButton: false, appendTo: 'root', html: '',
      onInit: (el: HTMLElement, pswpInstance: any) => {
        pswpInstance.on('change', () => {
          const currentAuthor = wrapper.getAttribute('data-author');
          const currentOwnerUsername = wrapper.getAttribute('data-owner-username');
          const captionStr = defaultCaption !== undefined ? defaultCaption : wrapper.getAttribute('data-caption') || '';
          let finalCaption = captionStr ? captionStr.replace(/\n/g, '<br>') : '';
          
          const displayAuthor = (currentAuthor && currentAuthor.trim() !== '') ? currentAuthor.trim() : (currentOwnerUsername ? currentOwnerUsername.trim() : '');
          
          if (displayAuthor) {
            const upperAuthor = displayAuthor.toUpperCase();
            if (currentOwnerUsername && currentOwnerUsername.trim() !== '') {
              finalCaption += `<br>BY <a href="/u/${currentOwnerUsername.trim().toLowerCase()}" style="color: inherit; text-decoration: none;"><b>${upperAuthor}</b></a>`;
            } else {
              finalCaption += `<br>BY <b>${upperAuthor}</b>`;
            }
          }
          el.innerHTML = finalCaption;
        });
      }
    });

    // 2. Photographer Button
    pswp.ui!.registerElement({
      name: 'photographer', order: 10, isButton: true, tagName: 'button', title: 'Author Profile',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"></path><circle cx="12" cy="7" r="4"></circle></svg>',
      onClick: (e: Event) => {
        const username = wrapper.getAttribute('data-owner-username');
        if (username) window.location.href = `/u/${username.trim().toLowerCase()}`;
        else alert('Photographer profile not available.');
      }
    });

    // 3. Download Original
    pswp.ui!.registerElement({
      name: 'download', order: 11, isButton: true, tagName: 'button', title: 'Download Image',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>',
      onClick: (e: Event, el: HTMLElement, pswpInstance: any) => {
        const src = pswpInstance.currSlide?.data?.src;
        if (src) {
          const a = document.createElement('a');
          a.href = src;
          a.download = src.split('/').pop() || 'download';
          a.target = '_blank';
          a.click();
        }
      }
    });

    // 4. General Share
    pswp.ui!.registerElement({
      name: 'share-general', order: 12, isButton: true, tagName: 'button', title: 'Share',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"></path><polyline points="16 6 12 2 8 6"></polyline><line x1="12" y1="2" x2="12" y2="15"></line></svg>',
      onClick: (e: Event, el: HTMLElement, pswpInstance: any) => {
        const url = window.location.href;
        const src = pswpInstance.currSlide?.data?.src || '';
        
        if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) {
          navigator.share({
            title: 'Silent Flânerie',
            text: 'Check out this shot from Silent Flânerie',
            url: url
          }).catch(console.error);
        } else {
          window.dispatchEvent(new CustomEvent('open-share-modal', { detail: { url, imgUrl: src } }));
        }
      }
    });

    // 5. Copy Link
    pswp.ui!.registerElement({
      name: 'copy-link', order: 13, isButton: true, tagName: 'button', title: 'Copy Link',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          const toast = document.getElementById('system-toast');
          const toastText = document.getElementById('system-toast-text');
          if (toast && toastText) {
            toastText.textContent = 'Link copied to clipboard';
            toast.classList.add('visible');
            setTimeout(() => {
              toast.classList.remove('visible');
            }, 2000);
          } else {
            alert('Link copied to clipboard');
          }
        } catch (err) {
          console.error('Failed to copy', err);
        }
      }
    });
  });
}

function attachGalleryListeners() {
  // Delete buttons
  document.querySelectorAll('.delete-btn').forEach((btn: any) => {
    btn.addEventListener('click', (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      const postId = btn.getAttribute('data-id');
      if (postId) {
        state.pendingDeletedStackIds.push(postId);
        const wrapper = btn.closest('.gallery-item-wrapper');
        if (wrapper) wrapper.remove(); // Visual erasure logic
      }
    });
  });

  // Hide/Unhide Buttons (Deferred API Update)
  document.querySelectorAll('.hide-btn').forEach((btn: any) => {
    btn.addEventListener('click', async (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      
      const postId = btn.getAttribute('data-id');
      const isCurrentlyHidden = btn.getAttribute('data-hidden') === 'true';
      const wrapper = btn.closest('.gallery-item-wrapper');
      const galleryEl = document.getElementById('gallery');
      if (!postId || !wrapper || !galleryEl) return;

      const newState = !isCurrentlyHidden;
      state.hiddenStatusChanged = true;

      // Update local memory immediately
      const post = state.allPosts.find((p: any) => p.id === postId);
      if (post) post.is_hidden_from_global = newState;
      
      // Visual toggle without reloading
      btn.setAttribute('data-hidden', String(newState));
      if (newState) {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line><line x1="12" y1="5" x2="12" y2="19"></line></svg>';
        wrapper.classList.add('is-ghosted');
        galleryEl.appendChild(wrapper); // Send dynamically to bottom!
      } else {
        btn.innerHTML = '<svg viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        wrapper.classList.remove('is-ghosted');
      }
    });
  });

  // Gallery item clicks (PhotoSwipe or edit)
  document.querySelectorAll('.gallery-item-wrapper').forEach((wrapper: any) => {
    wrapper.addEventListener('click', (e: Event) => {
      if (document.body.classList.contains('is-editing')) {
        if ((e.target as HTMLElement).closest('.delete-btn') || (e.target as HTMLElement).closest('.hide-btn')) return;
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
          closeSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>',
          zoomSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line><line class="pswp__zoom-icn-bar-v" x1="11" y1="8" x2="11" y2="14"></line><line x1="8" y1="11" x2="14" y2="11"></line></svg>',
          arrowPrevSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>',
          arrowNextSVG: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>',
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

        registerPhotoSwipeUI(pswp, wrapper as HTMLElement, captionStr);

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
  if (!state.fileInput) return;
  const files = state.pendingUploadFiles.map(p => p.file);
  const captionEl = document.getElementById('local-caption-input') as HTMLTextAreaElement;
  const caption = captionEl?.value || '';
  const author = (window as any).__AUTH__?.username || '';
  if (files.length === 0) return;

  openModal(state.progressModal);
  if (state.progressTitle) state.progressTitle.innerText = 'Importing...';
  if (state.progressStatusText) state.progressStatusText.innerText = 'Uploading images...';
  if (state.progressBarInner) state.progressBarInner.style.width = '10%';

  const timestamp = Date.now();
  const postId = `local-${timestamp}`;
  const imageUrls: any[] = [];
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
      if (state.progressStatusText) state.progressStatusText.innerText = `Uploading image ${i + 1}/${files.length}...`;
      
      const basePercent = 10 + (i / files.length) * 50;
      const filePercentChunk = 50 / files.length;
      if (state.progressBarInner) state.progressBarInner.style.width = `${basePercent}%`;
      
      const uploadedData = await uploadToR2(file, fileName, (p) => {
        if (state.progressBarInner) state.progressBarInner.style.width = `${basePercent + p * filePercentChunk}%`;
      });
      const img = new Image();
      img.src = URL.createObjectURL(file);
      await new Promise(r => {
        img.onload = r;
        img.onerror = r;
      });
      const fileIsPortrait = (img.naturalHeight > img.naturalWidth);

      imageUrls.push({
        url: uploadedData.finalImageUrl,
        thumbnail_url: uploadedData.thumbnailUrl,
        lqip: uploadedData.lqip,
        isPortrait: fileIsPortrait
      });
    }

    if (state.progressStatusText) state.progressStatusText.innerText = 'Saving post...';
    if (state.progressBarInner) state.progressBarInner.style.width = '80%';

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
      throw new Error(errData.error || 'Failed to create album');
    }

    state.allPosts.push(newPost);
    renderGallery();

    if (state.progressBarInner) state.progressBarInner.style.width = '100%';
    if (state.progressStatusText) state.progressStatusText.innerText = 'Import complete!';
    state.refreshPageBtn?.classList.add('active');

    state.pendingUploadFiles = [];
    renderLocalPreviewGrid();
  } catch (e: any) {
    if (state.progressStatusText) state.progressStatusText.innerText = `Error: ${e.message}`;
  }
}

// --- Load Gallery Data ---
async function loadGallery() {
  try {
    let data;
    const win = window as any;
    if (win.__INITIAL_GALLERY_DATA__) {
      data = win.__INITIAL_GALLERY_DATA__;
      win.__INITIAL_GALLERY_DATA__ = null; // consume it so subsequent loads (e.g. after upload) will fetch fresh
    } else {
      const res = await fetch(state.galleryConfig.postsApiUrl);
      if (!res.ok) throw new Error('Failed to load gallery data');
      data = await res.json();
    }
    
    if (Array.isArray(data)) {
      state.allPosts = data;
      renderGallery();
    } else {
      throw new Error('Gallery data is not an array');
    }
  } catch (e: any) {
    console.error('Gallery load error:', e);
    const galleryEl = document.getElementById('gallery');
    if (galleryEl) {
      // Graceful empty state
      galleryEl.innerHTML = '<div style="grid-column: 1/-1; text-align: center; padding: 4rem 0;"><div style="font-family: \'Cormorant Garamond\', serif; font-size: 2rem; color: rgba(255,255,255,0.2);">No pieces currently on display.</div></div>';
    }
    showSystemToast('Failed to load gallery. Please refresh.', true);
  }
}

// ==========================================
// ENTRY POINT
// ==========================================
export function initGallery(config: GalleryConfig) {
  state.galleryConfig = config;

  // Resolve DOM elements
  state.importModal = document.getElementById('import-modal');
  state.progressModal = document.getElementById('progress-modal');
  state.fileInput = document.getElementById('local-file-input') as HTMLInputElement;
  state.progressBarInner = document.getElementById('progress-bar-inner');
  state.progressStatusText = document.getElementById('progress-status-text');
  state.progressTitle = document.getElementById('progress-title');
  state.refreshPageBtn = document.getElementById('refresh-page-btn');
  state.editBtn = document.getElementById('open-edit-mode');
  state.editActions = document.getElementById('edit-actions');
  state.saveBtn = document.getElementById('save-edits');
  state.cancelBtn = document.getElementById('cancel-edits');
  state.addBtn = document.getElementById('add-new-post');
  state.galleryBottomBar = document.getElementById('gallery-bottom-bar');
  state.confirmDiscardModal = document.getElementById('confirm-discard-modal');
  state.confirmDiscardBtn = document.getElementById('confirm-discard-btn');
  state.cancelDiscardBtn = document.getElementById('cancel-discard-btn');
  state.confirmDeleteModal = document.getElementById('confirm-delete-modal');
  state.miniGalleryModal = document.getElementById('mini-gallery-modal');
  state.closeMiniGalleryBtn = document.getElementById('close-mini-gallery');
  state.confirmMiniGalleryBtn = document.getElementById('confirm-mini-gallery');
  state.miniGalleryGrid = document.getElementById('mini-gallery-grid');
  state.miniCaptionInput = document.getElementById('mini-caption-input') as HTMLTextAreaElement;
  state.miniAuthorDisplay = document.getElementById('mini-author-display');
  state.miniImportBtn = document.getElementById('mini-import-btn');
  state.miniFileInput = document.getElementById('mini-file-input') as HTMLInputElement;

  // Show bottom bar if user is authorized to see it based on mode
  const canSeeEditControls = config.mode === 'main' ? !!config.userId : config.canSort;
  if (canSeeEditControls && state.galleryBottomBar) {
    state.galleryBottomBar.style.display = 'flex';
  }

  // --- Expand Button ---
  state.expandBtn = document.getElementById('expand-gallery-btn');
  if (state.expandBtn) {
    state.expandBtn.addEventListener('click', () => {
      if (state.isEditMode) return; // Don't toggle while editing
      if (state.isExpanded) {
        collapseGallery();
      } else {
        expandGallery();
      }
      // Persist preference if owner
      if (config.isOwner) {
        fetch('/api/user/expanded', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expanded: state.isExpanded })
        }).catch(err => console.error('Failed to save expand pref:', err));
      }
    });
  }

  // --- Edit Mode Events ---
  state.editBtn?.addEventListener('click', () => { if (!state.isEditMode) enterEditMode(); });

  state.cancelBtn?.addEventListener('click', () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const currentOrder = orderNodes.map(node => (state.isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
    if (currentOrder.join(',') !== state.initialOrder.join(',') || state.pendingDeletedStackIds.length > 0 || state.pendingDeletedPhotoIds.length > 0) {
      state.pendingAction = 'DISCARD_EDITS';
      openModal(state.confirmDiscardModal);
    } else {
      exitEditMode();
    }
  });

  state.confirmDiscardBtn?.addEventListener('click', () => {
    if (state.pendingAction === 'DISCARD_MINI_GALLERY') {
      closeModal(state.confirmDiscardModal);
      closeModal(state.miniGalleryModal);
      state.pendingAction = null;
    } else {
      window.location.reload();
    }
  });

  state.cancelDiscardBtn?.addEventListener('click', () => closeModal(state.confirmDiscardModal));

  // --- Save Order / Execute Deletions ---
  state.saveBtn?.addEventListener('click', async () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const newOrder = orderNodes.map(node => (state.isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
    
    if (newOrder.join(',') === state.initialOrder.join(',') && state.pendingDeletedStackIds.length === 0 && state.pendingDeletedPhotoIds.length === 0 && !state.hiddenStatusChanged) {
      exitEditMode();
      return;
    }
    
    const executeSave = async () => {
      openModal(state.progressModal);
      if (state.progressTitle) state.progressTitle.innerText = 'Saving Changes...';
      if (state.progressStatusText) state.progressStatusText.innerText = 'Updating...';
      if (state.progressBarInner) state.progressBarInner.style.width = '30%';

      try {
        // 0. Process batch photo deletes (expanded mode)
        if (state.pendingDeletedPhotoIds.length > 0) {
          if (state.progressStatusText) state.progressStatusText.innerText = 'Deleting photos...';
          await Promise.all(
            state.pendingDeletedPhotoIds.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' }))
          );
          // Remove deleted photos from allPosts images arrays
          for (const post of state.allPosts) {
            if (post.images) {
              post.images = post.images.filter((img: any) => {
                const pid = typeof img === 'object' ? img.photoId : '';
                return !state.pendingDeletedPhotoIds.includes(pid);
              });
            }
          }
          // Remove stacks that have no photos left
          state.allPosts = state.allPosts.filter((p: any) => p.images && p.images.length > 0);
          state.pendingDeletedPhotoIds = [];
        }

        // 1. Process batch API stack deletes
        if (state.pendingDeletedStackIds.length > 0) {
          if (state.progressStatusText) state.progressStatusText.innerText = 'Deleting posts...';
          await Promise.all(
            state.pendingDeletedStackIds.map(id => fetch(`/api/stacks/${id}`, { method: 'DELETE' }))
          );
          state.allPosts = state.allPosts.filter((p: any) => !state.pendingDeletedStackIds.includes(p.id));
          state.pendingDeletedStackIds = [];
        }

        // 2. Process order
        if (state.progressStatusText) state.progressStatusText.innerText = 'Linking arrangement...';
        if (state.isExpanded) {
          // Save expanded photo order
          const photoNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper[data-photo-id]'));
          const expandedOrder = photoNodes.map((node, i) => ({
            photoId: node.getAttribute('data-photo-id'),
            order: i,
          })).filter(item => item.photoId);
          if (expandedOrder.length > 0) {
            await fetch(POSTS_API + '?scope=expanded', {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(expandedOrder),
            });
            
            // Critical: Update local memory so toggling modes doesn't reset order
            // Use a Map for O(1) matching efficiency and reliability
            const orderMap = new Map(expandedOrder.map(item => [item.photoId, item.order]));
            
            for (const post of state.allPosts) {
              if (post.images) {
                for (const img of post.images) {
                  const pid = typeof img === 'object' ? img.photoId : '';
                  if (pid && orderMap.has(pid)) {
                    (img as any).expandedSortOrder = orderMap.get(pid);
                  }
                }
              }
            }
          }
          exitEditMode();
          renderExpandedGallery();
        } else {
          // Save stack order
          const orderedPosts = newOrder.map(id => state.allPosts.find((p: any) => p.id === id)).filter(Boolean);
          const missingPosts = state.allPosts.filter((p: any) => !newOrder.includes(p.id));
          const updatedPosts = [...orderedPosts, ...missingPosts];
          await savePostsToR2(updatedPosts, config.saveScope);
          state.allPosts = updatedPosts;
          exitEditMode();
          renderGallery();
        }
        state.hiddenStatusChanged = false;
        if (state.progressBarInner) state.progressBarInner.style.width = '100%';
        if (state.progressStatusText) state.progressStatusText.innerText = 'Changes saved!';
        state.refreshPageBtn?.classList.add('active');
      } catch (e: any) {
        console.error('Save failed:', e);
        if (state.progressStatusText) state.progressStatusText.innerText = `Error: ${e.message}`;
        showSystemToast(`Failed: ${e.message}`, true);
        // Re-render in case of error to restore state
        if (state.isExpanded) renderExpandedGallery();
        else renderGallery();
      }
    };

    if (state.pendingDeletedStackIds.length > 0 || state.pendingDeletedPhotoIds.length > 0) {
      const toast = document.getElementById('undo-toast');
      const text = document.getElementById('undo-toast-text');
      const btn = document.getElementById('undo-toast-btn');
      
      if (toast && text && btn) {
        const totalDeletes = state.pendingDeletedStackIds.length + state.pendingDeletedPhotoIds.length;
        text.innerText = `Deleting ${totalDeletes} item${totalDeletes > 1 ? 's' : ''}...`;
        toast.classList.add('visible');
        
        let committed = false;
        
        const commit = () => {
          if (committed) return;
          committed = true;
          toast.classList.remove('visible');
          btn.removeEventListener('click', undo);
          executeSave();
        };
        
        const undo = () => {
          if (committed) return;
          committed = true;
          toast.classList.remove('visible');
          btn.removeEventListener('click', undo);
          
          // Revert deletions
          state.pendingDeletedStackIds = [];
          state.pendingDeletedPhotoIds = [];
          exitEditMode();
          if (state.isExpanded) renderExpandedGallery();
          else renderGallery();
        };
        
        btn.addEventListener('click', undo);
        setTimeout(commit, 3500);
      } else {
        executeSave();
      }
    } else {
      executeSave();
    }
  });

  // --- Delete Post (Code Cleaned due to Deferred Deletion) ---
  const origConfirmDeleteBtn = document.getElementById('confirm-delete-btn');
  if (origConfirmDeleteBtn) {
    const newConfirmDeleteBtn = origConfirmDeleteBtn.cloneNode(true) as HTMLElement;
    origConfirmDeleteBtn.parentNode!.replaceChild(newConfirmDeleteBtn, origConfirmDeleteBtn);
    newConfirmDeleteBtn.addEventListener('click', () => { 
      closeModal(state.confirmDeleteModal);
    });
  }

  const origCancelDeleteBtn = document.getElementById('cancel-delete-btn');
  if (origCancelDeleteBtn) {
    const newCancelDeleteBtn = origCancelDeleteBtn.cloneNode(true) as HTMLElement;
    origCancelDeleteBtn.parentNode!.replaceChild(newCancelDeleteBtn, origCancelDeleteBtn);
    newCancelDeleteBtn.addEventListener('click', () => {
      closeModal(state.confirmDeleteModal);
    });
  }

  // --- File Input Handlers ---
  state.fileInput?.addEventListener('click', () => { state.filePickerActive = true; });
  state.fileInput?.addEventListener('change', () => {
    state.filePickerActive = false;
    if (state.fileInput!.files && state.fileInput!.files.length > 0) {
      const filesArray = Array.from(state.fileInput!.files);
      let loadedCount = 0;
      filesArray.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          state.pendingUploadFiles.push({ file, dataUrl: e.target!.result as string });
          loadedCount++;
          if (loadedCount === filesArray.length) {
            renderLocalPreviewGrid();
          }
        };
        reader.readAsDataURL(file);
      });
    }
    if (state.fileInput) state.fileInput.value = '';
  });
  state.fileInput?.addEventListener('cancel', () => { state.filePickerActive = false; });

  state.addBtn?.addEventListener('click', () => {
    state.pendingAction = 'IMPORT';
    openModal(state.importModal);
  });

  document.getElementById('close-import-modal')?.addEventListener('click', () => {
    state.pendingUploadFiles = [];
    renderLocalPreviewGrid();
    if (state.fileInput) state.fileInput.value = '';
    closeModal(state.importModal);
  });
  state.refreshPageBtn?.addEventListener('click', () => window.location.reload());

  document.getElementById('confirm-import')?.addEventListener('click', () => {
    handleLocalUpload();
    closeModal(state.importModal);
  });

  // --- Mini Gallery Events ---
  state.miniImportBtn?.addEventListener('click', () => {
    state.filePickerActive = true;
    state.miniFileInput?.click();
  });

  state.miniFileInput?.addEventListener('change', (e: Event) => {
    state.filePickerActive = false;
    const files = (e.target as HTMLInputElement).files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = (re: any) => {
        state.currentMiniImages.push(re.target.result);
        renderMiniGallery();
      };
      reader.readAsDataURL(file);
    });
  });
  state.miniFileInput?.addEventListener('cancel', () => { state.filePickerActive = false; });

  state.closeMiniGalleryBtn?.addEventListener('click', () => {
    const hasChanges = JSON.stringify(state.currentMiniImages) !== state.originalMiniImages ||
                      (state.miniCaptionInput?.value || '') !== state.originalMiniCaption;
    if (hasChanges) {
      state.pendingAction = 'DISCARD_MINI_GALLERY';
      openModal(state.confirmDiscardModal);
    } else {
      closeModal(state.miniGalleryModal);
    }
  });

  // --- Confirm Mini Gallery (R2 upload for new images) ---
  state.confirmMiniGalleryBtn?.addEventListener('click', async () => {
    if (!state.currentEditingWrapper) { closeModal(state.miniGalleryModal); return; }
    const postId = state.currentEditingWrapper.getAttribute('data-id');
    const post = state.allPosts.find((p: any) => p.id === postId);
    const canEdit = state.galleryConfig.isAdmin || (post && post.owner_clerk_id === state.galleryConfig.userId);

    if (!canEdit) {
      closeModal(state.miniGalleryModal);
      return;
    }

    const newCaption = state.miniCaptionInput?.value || '';
    const newAuthor = state.currentEditingWrapper?.getAttribute('data-author') || '';
    const hasChanges = JSON.stringify(state.currentMiniImages) !== state.originalMiniImages ||
                      newCaption !== state.originalMiniCaption;
    if (!hasChanges) { closeModal(state.miniGalleryModal); return; }

    const newDataUrls: {idx: number; dataUrl: string}[] = [];
    state.currentMiniImages.forEach((src, idx) => {
      if (src.startsWith('data:')) newDataUrls.push({ idx, dataUrl: src });
    });

    const executeSave = async () => {
      closeModal(state.miniGalleryModal);
      openModal(state.progressModal);
      if (state.progressTitle) state.progressTitle.innerText = 'Updating Album...';
      if (state.progressStatusText) state.progressStatusText.innerText = 'Uploading new images...';
      if (state.progressBarInner) state.progressBarInner.style.width = '10%';

      try {
        const timestamp = Date.now();
        for (let i = 0; i < newDataUrls.length; i++) {
          const { idx, dataUrl } = newDataUrls[i];
          if (state.progressStatusText) state.progressStatusText.innerText = `Uploading image ${i + 1}/${newDataUrls.length}...`;
          
          const basePercent = 10 + (i / newDataUrls.length) * 50;
          const filePercentChunk = 50 / newDataUrls.length;
          if (state.progressBarInner) state.progressBarInner.style.width = `${basePercent}%`;

          const blob = dataUrlToBlob(dataUrl);
          const fileName = `p_${postId}_add_${timestamp}_${i}.jpg`;
          const finalUrl = await uploadToR2(blob, fileName, (p) => {
            if (state.progressBarInner) state.progressBarInner.style.width = `${basePercent + p * filePercentChunk}%`;
          });
          state.currentMiniImages[idx] = finalUrl;
        }

        if (state.progressStatusText) state.progressStatusText.innerText = 'Saving...';
        if (state.progressBarInner) state.progressBarInner.style.width = '80%';

        const updatedPost = state.allPosts.find((p: any) => p.id === postId);
        if (updatedPost) {
          updatedPost.images = [...state.currentMiniImages];
          updatedPost.caption = newCaption;
          updatedPost.author = newAuthor;
        }
        await savePostsToR2(state.allPosts, config.saveScope);
        renderGallery();

        if (state.progressBarInner) state.progressBarInner.style.width = '100%';
        if (state.progressStatusText) state.progressStatusText.innerText = 'Album updated!';
        state.refreshPageBtn?.classList.add('active');
      } catch (e: any) {
        if (state.progressStatusText) state.progressStatusText.innerText = `Error: ${e.message}`;
      }
    };

    const originalArr = JSON.parse(state.originalMiniImages);
    let deletedImages = originalArr.filter((img: string) => !state.currentMiniImages.includes(img));

    if (deletedImages.length > 0) {
      const thumbContainer = document.getElementById('delete-thumbnails-container');
      if (thumbContainer) {
        thumbContainer.innerHTML = deletedImages.map((img: any) => {
          const thumbUrl = getImageUrl(img);
          return `<img src="${thumbUrl}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 8px; box-shadow: 0 4px 10px rgba(0,0,0,0.5);" />`;
        }).join('');
      }

      if (deletedImages.length > 0) {
        const toast = document.getElementById('undo-toast');
        const text = document.getElementById('undo-toast-text');
        const btn = document.getElementById('undo-toast-btn');
        
        if (toast && text && btn) {
          text.innerText = `Removing ${deletedImages.length} photo${deletedImages.length > 1 ? 's' : ''}...`;
          toast.classList.add('visible');
          
          let committed = false;
          
          const commit = () => {
            if (committed) return;
            committed = true;
            toast.classList.remove('visible');
            btn.removeEventListener('click', undo);
            executeSave();
          };
          
          const undo = () => {
            if (committed) return;
            committed = true;
            toast.classList.remove('visible');
            btn.removeEventListener('click', undo);
            
            // Revert deletions
            deletedImages = [];
            closeModal(state.miniGalleryModal);
            // We just close the modal without saving, so user doesn't lose data but doesn't commit either.
          };
          
          btn.addEventListener('click', undo);
          setTimeout(commit, 3500);
        } else {
          executeSave();
        }
      } else {
        executeSave();
      }
    } else {
      executeSave();
    }
  });

  // --- Drag and Drop Setup ---
  const setupDragAndDrop = (dropZoneId: string, fileInputId: string) => {
    const dropZone = document.getElementById(dropZoneId);
    const fileInput = document.getElementById(fileInputId) as HTMLInputElement;
    if (!dropZone || !fileInput) return;

    dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      dropZone.classList.add('drag-over');
    });
    dropZone.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
    });
    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');
      if (e.dataTransfer && e.dataTransfer.files.length > 0) {
        fileInput.files = e.dataTransfer.files;
        const event = new Event('change', { bubbles: true });
        fileInput.dispatchEvent(event);
      }
    });
  };

  setupDragAndDrop('local-drag-zone', 'local-file-input');
  setupDragAndDrop('mini-gallery-grid', 'mini-file-input');

  // --- Initial Load ---


  loadGallery().then(() => {
    // Apply initial expand state after data loads
    if (config.initialExpanded && config.mode === 'personal') {
      expandGallery();
    }
  });

  // Global Keyboard Navigation
  document.addEventListener('keydown', (e) => {
    // Esc closes any active custom modal
    if (e.key === 'Escape') {
      const activeOverlay = document.querySelector('.modal-overlay.active');
      if (activeOverlay) {
        closeModal(activeOverlay.id);
      }
    }

    // Enter triggers click on focused gallery item
    if (e.key === 'Enter') {
      const activeEl = document.activeElement;
      if (activeEl && activeEl.classList.contains('gallery-item')) {
        (activeEl as HTMLElement).click();
      }
    }
  });
}
