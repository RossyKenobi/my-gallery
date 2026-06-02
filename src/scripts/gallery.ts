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
  isOwner?: boolean;          // whether the current user owns this personal page
  initialExpanded?: boolean;  // initial expand state from DB
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
let pendingDeletedStackIds: string[] = [];  // Batch stack deletes
let pendingDeletedPhotoIds: string[] = [];  // Batch photo deletes (expanded mode)
let hiddenStatusChanged = false; // Track dirty state for hidden toggle delaying
let isExpanded = false;  // Expand/Collapse state
let expandedPhotos: any[] = [];  // Flattened photo array for expanded mode
let expandBtn: HTMLElement | null;
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
let miniAuthorDisplay: HTMLElement | null;
let miniImportBtn: HTMLElement | null;
let miniFileInput: HTMLInputElement | null;
let pendingUploadFiles: { file: File, dataUrl: string }[] = [];

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

function renderLocalPreviewGrid() {
  const localPreviewGrid = document.getElementById('local-preview-grid');
  const localChooseHeader = document.getElementById('local-choose-header');
  
  if (!localPreviewGrid) return;
  localPreviewGrid.innerHTML = '';
  
  if (pendingUploadFiles.length > 0) {
    if (localChooseHeader) localChooseHeader.style.display = 'none';
    localPreviewGrid.style.display = 'grid';
    localPreviewGrid.style.marginTop = '0';
    
    pendingUploadFiles.forEach((item, idx) => {
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

        if (idx === pendingUploadFiles.length - 1) {
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
        pendingUploadFiles.splice(idx, 1);
        renderLocalPreviewGrid();
      });
    });

    enableLocalSortable(localPreviewGrid);
  } else {
    if (localChooseHeader) localChooseHeader.style.display = 'flex';
    localPreviewGrid.style.display = 'none';
  }
}

let localSortable: any = null;
function enableLocalSortable(grid: HTMLElement) {
  if (localSortable) localSortable.destroy();
  localSortable = new Sortable(grid, {
    animation: 150,
    filter: '.mini-delete-btn, .add-more-btn-cell',
    preventOnFilter: false,
    onMove: (evt: any) => {
      return evt.related.className.indexOf('add-more-btn-cell') === -1;
    },
    onEnd: (evt: any) => {
      const el = pendingUploadFiles.splice(evt.oldIndex, 1)[0];
      pendingUploadFiles.splice(evt.newIndex, 0, el);
      renderLocalPreviewGrid(); // Fix data-idx bindings and add-more button class
    }
  });
}

import { generateImageVersions } from './compress';

async function uploadToR2(file: Blob, filename: string, onProgress?: (percent: number) => void): Promise<{ finalImageUrl: string, thumbnailUrl?: string, lqip?: string }> {
  const { main, thumbnail, lqip } = await generateImageVersions(file);

  const formData = new FormData();
  formData.append('filename', filename);
  formData.append('file', main, filename);
  formData.append('thumbnail', thumbnail, 'thumb_' + filename);
  formData.append('lqip', lqip);

  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', UPLOAD_API);
    
    if (onProgress) {
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable) {
          onProgress(e.loaded / e.total);
        }
      };
    }

    xhr.onload = () => {
      let data = null;
      try {
        data = JSON.parse(xhr.responseText);
      } catch (e) {}
      
      if (xhr.status >= 200 && xhr.status < 300 && data) {
        resolve({
          finalImageUrl: data.finalImageUrl,
          thumbnailUrl: data.thumbnailUrl,
          lqip: data.lqip
        });
      } else {
        reject(new Error((data && data.error) || `Upload failed (HTTP ${xhr.status})`));
      }
    };

    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.send(formData);
  });
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

// --- Expanded Mode Rendering Helpers ---
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

  const orientationClass = post.isPortrait === true ? 'is-portrait' : 'is-landscape';

  let canEdit = false;
  if (galleryConfig.userId) {
    canEdit = galleryConfig.isAdmin || post.owner_clerk_id === galleryConfig.userId;
  }
  
  const isHideBtnVisible = galleryConfig.mode === 'main' && galleryConfig.isAdmin;
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

  const lqipStyle = lqip ? `background-image: url(${lqip}); background-size: cover; background-position: center;` : '';
  const srcset = (thumbnail !== mainUrl) ? `srcset="${escapeHTML(thumbnail)} 640w, ${escapeHTML(mainUrl)} 2400w" sizes="(max-width: 600px) 100vw, 33vw"` : '';

  return `
    <div class="gallery-item-wrapper ${orientationClass} ${hideClass}" data-id="${escapeHTML(post.id)}" data-images="${imagesData}" data-caption="${captionData}" data-author="${authorData}" data-owner-username="${ownerUsernameData}" data-needs-check="${post.isPortrait === undefined}">
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
  for (const post of allPosts) {
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
  if (galleryConfig.userId) {
    canEdit = galleryConfig.isAdmin || photo.owner_clerk_id === galleryConfig.userId;
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
  const lqipStyle = lqip ? `background-image: url(${lqip}); background-size: cover; background-position: center;` : '';
  const srcset = (thumbnail !== photo.url) ? `srcset="${escapeHTML(thumbnail)} 640w, ${escapeHTML(photo.url)} 2400w" sizes="(max-width: 600px) 100vw, 33vw"` : '';

  return `
    <div class="gallery-item-wrapper" data-photo-id="${escapeHTML(photo.photoId)}" data-stack-id="${escapeHTML(photo.stackId)}" data-owner-username="${escapeHTML(photo.owner_username)}" data-author="${escapeHTML(photo.author)}">
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
  expandedPhotos = buildExpandedPhotos().filter(p => !pendingDeletedPhotoIds.includes(p.photoId));

  if (expandedPhotos.length === 0) {
    galleryEl.innerHTML = '<p style="grid-column: 1/-1; text-align:center; color: rgba(255,255,255,0.3); padding: 4rem 0;">No photos yet.</p>';
  } else {
    galleryEl.innerHTML = expandedPhotos.map(createExpandedItemHTML).join('');
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
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => {
        setOrientation();
        img.classList.add('loaded');
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
        pendingDeletedPhotoIds.push(photoId);
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
  isExpanded = true;
  updateExpandBtn();
  renderExpandedGallery();
}

function collapseGallery() {
  isExpanded = false;
  pendingDeletedPhotoIds = [];
  updateExpandBtn();
  renderGallery();
}

function updateExpandBtn() {
  if (!expandBtn) return;
  const newText = isExpanded ? 'COLLAPSE' : 'EXPAND';
  const textSpan = expandBtn.querySelector('.text');
  if (textSpan) {
    textSpan.textContent = newText;
  } else {
    expandBtn.textContent = newText;
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
  let visiblePosts = allPosts.filter((p: any) => !p.hidden && !pendingDeletedStackIds.includes(p.id));

  // Determine standard vs global-hidden separation
  if (galleryConfig.mode === 'main') {
    if (isEditMode && galleryConfig.isAdmin) {
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
      img.classList.add('loaded');
    } else {
      img.addEventListener('load', () => {
        verifyOrientation();
        img.classList.add('loaded');
      });
    }
  });

  applyGalleryAnimations(galleryEl);
}

// --- Edit Mode ---
function enterEditMode() {
  isEditMode = true;
  document.body.classList.add('is-editing');
  
  if (galleryConfig.mode === 'main' && galleryConfig.isAdmin) {
    renderGallery(); // Re-render to inject global-hidden items into the DOM!
  }
  
  editBtn?.classList.add('hidden');
  if (expandBtn) expandBtn.classList.add('hidden');
  const changeBgBtn = document.getElementById('change-bg-btn');
  if (changeBgBtn) changeBgBtn.classList.add('hidden');
  const createAlbumBtn = document.getElementById('add-new-post');
  if (createAlbumBtn) createAlbumBtn.classList.add('hidden');
  editActions?.classList.remove('hidden');
  const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
  initialOrder = orderNodes.map(node => (isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
  const el = document.getElementById('gallery');

  if (galleryConfig.canSort && el) {
    sortableInstance = new Sortable(el, {
      animation: 150,
      ghostClass: 'sortable-ghost',
    });
  }
}

function exitEditMode() {
  isEditMode = false;
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

  if (sortableInstance) sortableInstance.destroy();
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

    const imgObj = new Image();
    imgObj.onload = () => {
      const isPortrait = imgObj.naturalHeight > imgObj.naturalWidth;
      if (isPortrait) {
        div.classList.add('is-portrait');
      } else {
        div.classList.add('is-landscape');
      }

      if (idx === currentMiniImages.length - 1 && canEdit) {
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
    miniGalleryGrid?.appendChild(div);
  });

  if (canEdit && miniGalleryGrid && currentMiniImages.length > 0) {
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
    miniGalleryGrid.appendChild(addDiv);
  }

  if (canEdit && miniGalleryGrid) {
    miniGalleryGrid.querySelectorAll('.mini-delete-btn').forEach((btn: any) => {
      btn.addEventListener('click', (e: Event) => {
        e.preventDefault();
        e.stopPropagation();
        // Deferred Local Deletion!
        const idx = parseInt((e.currentTarget as HTMLElement).getAttribute('data-idx')!);
        currentMiniImages.splice(idx, 1);
        renderMiniGallery(); // Re-render the grid instantly, wait for user to click Done to save R2
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
    filter: '.mini-delete-btn, .add-more-btn-cell',
    preventOnFilter: false,
    onMove: (evt: any) => {
      return evt.related.className.indexOf('add-more-btn-cell') === -1;
    },
    onEnd: (evt: any) => {
      const el = currentMiniImages.splice(evt.oldIndex, 1)[0];
      currentMiniImages.splice(evt.newIndex, 0, el);
      renderMiniGallery(); // Re-render to update data-idx for delete buttons
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

  if (miniAuthorDisplay) {
    miniAuthorDisplay.innerText = wrapper.getAttribute('data-author') || '';
    originalMiniAuthor = wrapper.getAttribute('data-author') || '';
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

    // 4. Twitter Share
    pswp.ui!.registerElement({
      name: 'share-twitter', order: 12, isButton: true, tagName: 'button', title: 'Share on X',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line><path d="M22 2L15 15L22 22H18L13 15L8 22H2L9 9L2 2H6L11 9L16 2H22Z" fill="none"></path></svg>',
      onClick: () => {
        const url = window.location.href;
        const text = encodeURIComponent('Check out this shot from Silent Flânerie');
        window.open(`https://twitter.com/intent/tweet?text=${text}&url=${encodeURIComponent(url)}`, '_blank');
      }
    });

    // 5. Copy Link
    pswp.ui!.registerElement({
      name: 'copy-link', order: 13, isButton: true, tagName: 'button', title: 'Copy Link',
      html: '<svg viewBox="0 0 24 24" width="22" height="22" stroke="currentColor" stroke-width="1.2" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>',
      onClick: async () => {
        try {
          await navigator.clipboard.writeText(window.location.href);
          const toast = document.getElementById('undo-toast');
          const text = document.getElementById('undo-toast-text');
          const btn = document.getElementById('undo-toast-btn');
          if (toast && text && btn) {
            text.textContent = 'Link copied to clipboard';
            btn.style.display = 'none';
            toast.classList.add('visible');
            setTimeout(() => {
              toast.classList.remove('visible');
              setTimeout(() => { btn.style.display = ''; }, 300);
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
        pendingDeletedStackIds.push(postId);
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
      hiddenStatusChanged = true;

      // Update local memory immediately
      const post = allPosts.find((p: any) => p.id === postId);
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
  if (!fileInput) return;
  const files = pendingUploadFiles.map(p => p.file);
  const captionEl = document.getElementById('local-caption-input') as HTMLTextAreaElement;
  const caption = captionEl?.value || '';
  const author = (window as any).__AUTH__?.username || '';
  if (files.length === 0) return;

  openModal(progressModal);
  if (progressTitle) progressTitle.innerText = 'Importing...';
  if (progressStatusText) progressStatusText.innerText = 'Uploading images...';
  if (progressBarInner) progressBarInner.style.width = '10%';

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
      if (progressStatusText) progressStatusText.innerText = `Uploading image ${i + 1}/${files.length}...`;
      
      const basePercent = 10 + (i / files.length) * 50;
      const filePercentChunk = 50 / files.length;
      if (progressBarInner) progressBarInner.style.width = `${basePercent}%`;
      
      const uploadedData = await uploadToR2(file, fileName, (p) => {
        if (progressBarInner) progressBarInner.style.width = `${basePercent + p * filePercentChunk}%`;
      });
      imageUrls.push({
        url: uploadedData.finalImageUrl,
        thumbnail_url: uploadedData.thumbnailUrl,
        lqip: uploadedData.lqip
      });
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
      throw new Error(errData.error || 'Failed to create album');
    }

    allPosts.push(newPost);
    renderGallery();

    if (progressBarInner) progressBarInner.style.width = '100%';
    if (progressStatusText) progressStatusText.innerText = 'Import complete!';
    refreshPageBtn?.classList.add('active');

    pendingUploadFiles = [];
    renderLocalPreviewGrid();
  } catch (e: any) {
    if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
  }
}

// --- Load Gallery Data ---
async function loadGallery() {
  try {
    const res = await fetch(`${galleryConfig.postsApiUrl}${galleryConfig.postsApiUrl.includes('?') ? '&' : '?'}t=${Date.now()}`);
    if (!res.ok) throw new Error('Failed to load gallery data');
    const data = await res.json();
    if (Array.isArray(data)) {
      allPosts = data;
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
  galleryConfig = config;

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
  miniAuthorDisplay = document.getElementById('mini-author-display');
  miniImportBtn = document.getElementById('mini-import-btn');
  miniFileInput = document.getElementById('mini-file-input') as HTMLInputElement;

  // Show bottom bar if user is authorized to see it based on mode
  const canSeeEditControls = config.mode === 'main' ? !!config.userId : config.canSort;
  if (canSeeEditControls && galleryBottomBar) {
    galleryBottomBar.style.display = 'flex';
  }

  // --- Expand Button ---
  expandBtn = document.getElementById('expand-gallery-btn');
  if (expandBtn) {
    expandBtn.addEventListener('click', () => {
      if (isEditMode) return; // Don't toggle while editing
      if (isExpanded) {
        collapseGallery();
      } else {
        expandGallery();
      }
      // Persist preference if owner
      if (config.isOwner) {
        fetch('/api/user/expanded', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ expanded: isExpanded })
        }).catch(err => console.error('Failed to save expand pref:', err));
      }
    });
  }

  // --- Edit Mode Events ---
  editBtn?.addEventListener('click', () => { if (!isEditMode) enterEditMode(); });

  cancelBtn?.addEventListener('click', () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const currentOrder = orderNodes.map(node => (isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
    if (currentOrder.join(',') !== initialOrder.join(',') || pendingDeletedStackIds.length > 0 || pendingDeletedPhotoIds.length > 0) {
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

  // --- Save Order / Execute Deletions ---
  saveBtn?.addEventListener('click', async () => {
    const orderNodes = Array.from(document.querySelectorAll('.gallery-item-wrapper'));
    const newOrder = orderNodes.map(node => (isExpanded ? node.getAttribute('data-photo-id') : node.getAttribute('data-id')) || '');
    
    if (newOrder.join(',') === initialOrder.join(',') && pendingDeletedStackIds.length === 0 && pendingDeletedPhotoIds.length === 0 && !hiddenStatusChanged) {
      exitEditMode();
      return;
    }
    
    const executeSave = async () => {
      openModal(progressModal);
      if (progressTitle) progressTitle.innerText = 'Saving Changes...';
      if (progressStatusText) progressStatusText.innerText = 'Updating...';
      if (progressBarInner) progressBarInner.style.width = '30%';

      try {
        // 0. Process batch photo deletes (expanded mode)
        if (pendingDeletedPhotoIds.length > 0) {
          if (progressStatusText) progressStatusText.innerText = 'Deleting photos...';
          await Promise.all(
            pendingDeletedPhotoIds.map(id => fetch(`/api/photos/${id}`, { method: 'DELETE' }))
          );
          // Remove deleted photos from allPosts images arrays
          for (const post of allPosts) {
            if (post.images) {
              post.images = post.images.filter((img: any) => {
                const pid = typeof img === 'object' ? img.photoId : '';
                return !pendingDeletedPhotoIds.includes(pid);
              });
            }
          }
          // Remove stacks that have no photos left
          allPosts = allPosts.filter((p: any) => p.images && p.images.length > 0);
          pendingDeletedPhotoIds = [];
        }

        // 1. Process batch API stack deletes
        if (pendingDeletedStackIds.length > 0) {
          if (progressStatusText) progressStatusText.innerText = 'Deleting posts...';
          await Promise.all(
            pendingDeletedStackIds.map(id => fetch(`/api/stacks/${id}`, { method: 'DELETE' }))
          );
          allPosts = allPosts.filter((p: any) => !pendingDeletedStackIds.includes(p.id));
          pendingDeletedStackIds = [];
        }

        // 2. Process order
        if (progressStatusText) progressStatusText.innerText = 'Linking arrangement...';
        if (isExpanded) {
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
            
            for (const post of allPosts) {
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
          const orderedPosts = newOrder.map(id => allPosts.find((p: any) => p.id === id)).filter(Boolean);
          const missingPosts = allPosts.filter((p: any) => !newOrder.includes(p.id));
          const updatedPosts = [...orderedPosts, ...missingPosts];
          await savePostsToR2(updatedPosts, config.saveScope);
          allPosts = updatedPosts;
          exitEditMode();
          renderGallery();
        }
        hiddenStatusChanged = false;
        if (progressBarInner) progressBarInner.style.width = '100%';
        if (progressStatusText) progressStatusText.innerText = 'Changes saved!';
        refreshPageBtn?.classList.add('active');
      } catch (e: any) {
        console.error('Save failed:', e);
        if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
        showSystemToast(`Failed: ${e.message}`, true);
        // Re-render in case of error to restore state
        if (isExpanded) renderExpandedGallery();
        else renderGallery();
      }
    };

    if (pendingDeletedStackIds.length > 0 || pendingDeletedPhotoIds.length > 0) {
      const toast = document.getElementById('undo-toast');
      const text = document.getElementById('undo-toast-text');
      const btn = document.getElementById('undo-toast-btn');
      
      if (toast && text && btn) {
        const totalDeletes = pendingDeletedStackIds.length + pendingDeletedPhotoIds.length;
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
          pendingDeletedStackIds = [];
          pendingDeletedPhotoIds = [];
          exitEditMode();
          if (isExpanded) renderExpandedGallery();
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
      closeModal(confirmDeleteModal);
    });
  }

  const origCancelDeleteBtn = document.getElementById('cancel-delete-btn');
  if (origCancelDeleteBtn) {
    const newCancelDeleteBtn = origCancelDeleteBtn.cloneNode(true) as HTMLElement;
    origCancelDeleteBtn.parentNode!.replaceChild(newCancelDeleteBtn, origCancelDeleteBtn);
    newCancelDeleteBtn.addEventListener('click', () => {
      closeModal(confirmDeleteModal);
    });
  }

  // --- File Input Handlers ---
  fileInput?.addEventListener('click', () => { filePickerActive = true; });
  fileInput?.addEventListener('change', () => {
    filePickerActive = false;
    if (fileInput!.files && fileInput!.files.length > 0) {
      const filesArray = Array.from(fileInput!.files);
      let loadedCount = 0;
      filesArray.forEach((file) => {
        const reader = new FileReader();
        reader.onload = (e) => {
          pendingUploadFiles.push({ file, dataUrl: e.target!.result as string });
          loadedCount++;
          if (loadedCount === filesArray.length) {
            renderLocalPreviewGrid();
          }
        };
        reader.readAsDataURL(file);
      });
    }
    if (fileInput) fileInput.value = '';
  });
  fileInput?.addEventListener('cancel', () => { filePickerActive = false; });

  addBtn?.addEventListener('click', () => {
    pendingAction = 'IMPORT';
    openModal(importModal);
  });

  document.getElementById('close-import-modal')?.addEventListener('click', () => {
    pendingUploadFiles = [];
    renderLocalPreviewGrid();
    if (fileInput) fileInput.value = '';
    closeModal(importModal);
  });
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
                      (miniCaptionInput?.value || '') !== originalMiniCaption;
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
    const newAuthor = currentEditingWrapper?.getAttribute('data-author') || '';
    const hasChanges = JSON.stringify(currentMiniImages) !== originalMiniImages ||
                      newCaption !== originalMiniCaption;
    if (!hasChanges) { closeModal(miniGalleryModal); return; }

    const newDataUrls: {idx: number; dataUrl: string}[] = [];
    currentMiniImages.forEach((src, idx) => {
      if (src.startsWith('data:')) newDataUrls.push({ idx, dataUrl: src });
    });

    const executeSave = async () => {
      closeModal(miniGalleryModal);
      openModal(progressModal);
      if (progressTitle) progressTitle.innerText = 'Updating Album...';
      if (progressStatusText) progressStatusText.innerText = 'Uploading new images...';
      if (progressBarInner) progressBarInner.style.width = '10%';

      try {
        const timestamp = Date.now();
        for (let i = 0; i < newDataUrls.length; i++) {
          const { idx, dataUrl } = newDataUrls[i];
          if (progressStatusText) progressStatusText.innerText = `Uploading image ${i + 1}/${newDataUrls.length}...`;
          
          const basePercent = 10 + (i / newDataUrls.length) * 50;
          const filePercentChunk = 50 / newDataUrls.length;
          if (progressBarInner) progressBarInner.style.width = `${basePercent}%`;

          const blob = dataUrlToBlob(dataUrl);
          const fileName = `p_${postId}_add_${timestamp}_${i}.jpg`;
          const finalUrl = await uploadToR2(blob, fileName, (p) => {
            if (progressBarInner) progressBarInner.style.width = `${basePercent + p * filePercentChunk}%`;
          });
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
        if (progressStatusText) progressStatusText.innerText = 'Album updated!';
        refreshPageBtn?.classList.add('active');
      } catch (e: any) {
        if (progressStatusText) progressStatusText.innerText = `Error: ${e.message}`;
      }
    };

    const originalArr = JSON.parse(originalMiniImages);
    const deletedImages = originalArr.filter((img: string) => !currentMiniImages.includes(img));

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
            closeModal(miniGalleryModal);
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
