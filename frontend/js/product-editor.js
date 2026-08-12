(function () {
  const FALLBACK_IMG = (typeof window !== 'undefined' && window.PRODUCT_FALLBACK_IMAGE) || ('data:image/svg+xml;charset=UTF-8,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="#f3f1ea"/><text x="300" y="310" font-family="Georgia, serif" font-size="40" fill="#9a9379" text-anchor="middle">PAP-JOY</text></svg>'));
  let currentProduct = null;
  let imageList = [];
  let videoList = [];
  let pendingFiles = [];
  let categories = [];
  let pendingCategoryId = null;
  let isDirty = false;
  let saving = false;

  function $(id) { return document.getElementById(id); }

  function escapeHTML(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function formatCurrency(amount) {
    try {
      return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(amount || 0);
    } catch { return '₹' + (amount || 0); }
  }

  function getYouTubeId(url) {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/))([\w-]{11})/);
    return m ? m[1] : null;
  }

  function getVimeoId(url) {
    const m = url.match(/vimeo\.com\/(\d+)/);
    return m ? m[1] : null;
  }

  function isDirectVideo(url) {
    return /\.(mp4|webm|mov)(\?|$)/i.test(url);
  }

  function getVideoEmbed(url) {
    const ytId = getYouTubeId(url);
    if (ytId) return `https://www.youtube.com/embed/${ytId}`;
    const vimeoId = getVimeoId(url);
    if (vimeoId) return `https://player.vimeo.com/video/${vimeoId}`;
    if (isDirectVideo(url)) return null;
    return null;
  }

  function getVideoThumb(url) {
    const ytId = getYouTubeId(url);
    if (ytId) return `https://img.youtube.com/vi/${ytId}/mqdefault.jpg`;
    return null;
  }

  function generateEan13Barcode() {
    const base = Array.from({ length: 12 }, () => Math.floor(Math.random() * 10)).join('');
    const sum = base.split('').reduce((acc, d, i) => acc + Number(d) * (i % 2 === 0 ? 1 : 3), 0);
    const check = (10 - (sum % 10)) % 10;
    return base + check;
  }

  // =========================================================================
  // INIT
  // =========================================================================
  document.addEventListener('DOMContentLoaded', async () => {
    const user = getCurrentUser();
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) {
      window.location.href = 'signin.html';
      return;
    }

    const params = new URLSearchParams(window.location.search);
    const productId = params.get('id');

    if (productId) {
      $('breadcrumb-action').textContent = 'Edit Product';
      document.title = 'Admin - Edit Product | PAP-JOY';
      $('btn-delete').style.display = '';
      await loadProduct(productId);
    } else {
      $('breadcrumb-action').textContent = 'New Product';
      document.title = 'Admin - New Product | PAP-JOY';
    }

    await loadCategories();
    bindEvents();
    updatePreview();
  });

  // =========================================================================
  // LOAD PRODUCT
  // =========================================================================
  async function loadProduct(id) {
    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/products/${id}`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) throw new Error('Product not found');
      currentProduct = await res.json();
      populateForm(currentProduct);
    } catch (err) {
      console.error('Load product error:', err);
      if (typeof showToast === 'function') showToast('Failed to load product');
      setTimeout(() => { window.location.href = 'admin.html'; }, 1500);
    }
  }

  function populateForm(p) {
    $('pe-name').value = p.name || '';
    $('pe-slug').value = p.slug || '';
    $('pe-short-desc').value = p.shortDescription || '';
    $('pe-description').value = p.description || '';
    $('pe-price').value = p.price || '';
    $('pe-compare-price').value = p.comparePrice || '';
    $('pe-cost-price').value = p.costPrice || '';
    $('pe-shipping').value = p.shippingCharge ?? 0;
    $('pe-sku').value = p.sku || '';
    $('pe-barcode').value = p.barcode || '';
    $('pe-stock').value = p.inventory?.quantity ?? 0;
    $('pe-low-stock').value = p.inventory?.lowStockThreshold ?? 10;
    $('pe-track-inventory').checked = p.inventory?.trackInventory !== false;
    $('pe-brand').value = p.brand || '';
    $('pe-tags').value = Array.isArray(p.tags) ? p.tags.join(', ') : '';
    $('pe-hsn').value = p.hsnCode || '';
    $('pe-sac').value = p.sacCode || '';
    $('pe-active').checked = p.isActive !== false;
    $('pe-featured').checked = p.isFeatured === true;
    $('pe-seo-title').value = p.seo?.title || '';
    $('pe-seo-desc').value = p.seo?.description || '';
    $('pe-seo-keywords').value = Array.isArray(p.seo?.keywords) ? p.seo.keywords.join(', ') : '';

    imageList = (typeof getProductImageUrls === 'function' ? getProductImageUrls(p) : (p.images || []).map(img => {
      if (typeof img === 'string') return img;
      return img.url || '';
    }).filter(Boolean));

    videoList = (p.videos || []).filter(Boolean);

    renderImages();
    renderVideos();

    if (p.categoryId) {
      pendingCategoryId = typeof p.categoryId === 'object' ? p.categoryId._id : p.categoryId;
    }
  }

  // =========================================================================
  // LOAD CATEGORIES
  // =========================================================================
  async function loadCategories() {
    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/categories`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) return;
      const data = await res.json();
      categories = Array.isArray(data) ? data : (data.categories || data.data || []);

      const select = $('pe-category');
      select.innerHTML = '<option value="">Select a category</option>';
      categories.forEach(cat => {
        if (cat.isActive !== false) {
          const opt = document.createElement('option');
          opt.value = cat._id;
          opt.textContent = cat.name;
          select.appendChild(opt);
        }
      });

      if (pendingCategoryId) {
        select.value = pendingCategoryId;
        pendingCategoryId = null;
      }
      updatePreview();
    } catch (err) {
      console.error('Load categories error:', err);
    }
  }

  // =========================================================================
  // EVENTS
  // =========================================================================
  function bindEvents() {
    $('pe-name').addEventListener('input', () => {
      if (!currentProduct) {
        $('pe-slug').value = $('pe-name').value.toLowerCase()
          .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
      }
      updatePreview();
    });

    document.querySelectorAll('.editor-form input, .editor-form textarea, .editor-form select').forEach(el => {
      el.addEventListener('input', () => { isDirty = true; });
      el.addEventListener('change', () => { isDirty = true; });
    });

    ['pe-name', 'pe-price', 'pe-compare-price', 'pe-description', 'pe-sku', 'pe-stock', 'pe-category', 'pe-active'].forEach(id => {
      $(id).addEventListener('input', updatePreview);
      $(id).addEventListener('change', updatePreview);
    });

    $('btn-save').addEventListener('click', () => saveProduct({ active: true, redirect: true }));
    $('btn-save-stay').addEventListener('click', () => saveProduct({ active: true, redirect: false }));
    $('btn-draft').addEventListener('click', () => saveProduct({ active: false, redirect: false }));

    $('btn-cancel').addEventListener('click', () => {
      if (isDirty && !confirm('You have unsaved changes. Discard them?')) return;
      window.location.href = 'admin.html';
    });

    $('btn-delete').addEventListener('click', () => {
      $('delete-modal').classList.add('active');
    });
    $('btn-confirm-delete').addEventListener('click', deleteProduct);

    $('btn-add-image').addEventListener('click', addImageUrl);
    $('pe-image-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addImageUrl(); }
    });

    $('btn-save-images').addEventListener('click', saveImages);

    const barcodeBtn = $('btn-generate-barcode');
    if (barcodeBtn) {
      barcodeBtn.addEventListener('click', () => {
        const barcode = generateEan13Barcode();
        $('pe-barcode').value = barcode;
        isDirty = true;
        if (typeof showToast === 'function') showToast('Random barcode generated: ' + barcode, 'info');
      });
    }

    $('btn-add-video').addEventListener('click', addVideoUrl);
    $('pe-video-url').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addVideoUrl(); }
    });

    $('btn-browse-files').addEventListener('click', () => $('pe-file-input').click());
    $('pe-file-input').addEventListener('change', (e) => handleFileSelect(e.target.files));

    const zone = $('editor-upload-zone');
    zone.addEventListener('dragover', (e) => { e.preventDefault(); zone.classList.add('dragover'); });
    zone.addEventListener('dragleave', () => { zone.classList.remove('dragover'); });
    zone.addEventListener('drop', (e) => {
      e.preventDefault();
      zone.classList.remove('dragover');
      handleFileSelect(e.dataTransfer.files);
    });

    $('btn-preview').addEventListener('click', handlePreview);

    window.addEventListener('beforeunload', (e) => {
      if (isDirty) { e.preventDefault(); e.returnValue = ''; }
    });
  }

  function handlePreview() {
    if (currentProduct?.slug) {
      window.open(`product-detail.html?slug=${currentProduct.slug}`, '_blank');
    } else if (typeof showToast === 'function') {
      showToast('Save the product first to preview it', 'info');
    }
  }

  // =========================================================================
  // FILE UPLOAD
  // =========================================================================
  function isHeicFile(file) {
    return /\.(heic|heif)$/i.test(file.name || '') || file.type === 'image/heic' || file.type === 'image/heif';
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (document.querySelector(`script[src="${src}"]`)) return resolve();
      const s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = () => reject(new Error('Failed to load image converter'));
      document.head.appendChild(s);
    });
  }

  async function convertHeicToJpeg(file) {
    await loadScript('https://cdnjs.cloudflare.com/ajax/libs/heic2any/0.0.4/heic2any.min.js');
    if (typeof window.heic2any !== 'function') throw new Error('Image converter unavailable');
    const out = await window.heic2any({ blob: file, toType: 'image/jpeg', quality: 0.9 });
    const blob = Array.isArray(out) ? out[0] : out;
    return new File([blob], (file.name || 'image.jpg').replace(/\.(heic|heif)$/i, '.jpg'), { type: 'image/jpeg' });
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleFileSelect(files) {
    if (!files || !files.length) return;

    for (const raw of Array.from(files)) {
      let file = raw;
      if (isHeicFile(file)) {
        try {
          if (typeof showToast === 'function') showToast(`Converting ${file.name} to JPEG...`, 'info');
          file = await convertHeicToJpeg(file);
        } catch (err) {
          console.error('HEIC conversion failed:', err);
          if (typeof showToast === 'function') showToast(`Could not process "${raw.name}" — ${err.message}`, 'error');
          continue;
        }
      }

      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        if (typeof showToast === 'function') showToast(`Skipped "${file.name}" — not an image or video`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        if (typeof showToast === 'function') showToast(`Skipped "${file.name}" — exceeds 10 MB limit`);
        continue;
      }

      const dataUrl = await readAsDataUrl(file);
      if (file.type.startsWith('video/')) {
        videoList.push(dataUrl);
        renderVideos();
      } else {
        imageList.push(dataUrl);
        renderImages();
        updatePreview();
      }
      pendingFiles.push({ file, dataUrl });
      isDirty = true;
    }

    $('pe-file-input').value = '';
  }

  // =========================================================================
  // SAVE IMAGES (upload immediately, independent of publishing)
  // =========================================================================
  async function saveImages() {
    if (!pendingFiles.length) {
      if (typeof showToast === 'function') showToast('No new images to save. Add images first.', 'info');
      return;
    }

    const token = getAuthToken();
    if (!token) return;

    if (!currentProduct?._id) {
      if (typeof showToast === 'function') {
        showToast('Product not saved yet. Your images will be attached automatically when you publish the product.', 'info');
      }
      return;
    }

    const btn = $('btn-save-images');
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving images...';

    try {
      const files = [];
      const BATCH_SIZE = 10;
      for (let i = 0; i < pendingFiles.length; i += BATCH_SIZE) {
        const batch = pendingFiles.slice(i, i + BATCH_SIZE);
        const formData = new FormData();
        batch.forEach(f => formData.append('media', f.file));

        const res = await fetch(`${API_BASE_URL}/api/v1/admin/uploads`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });

        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Failed to save images');
        }

        const data = await res.json();
        files.push(...(data.files || []));
      }

      if (!files.length) throw new Error('No image URLs returned');

      pendingFiles.forEach((f, i) => {
        const serverUrl = files[i]?.url;
        if (!serverUrl) return;
        const idx = imageList.indexOf(f.dataUrl);
        if (idx !== -1) imageList[idx] = serverUrl;
        const vidx = videoList.indexOf(f.dataUrl);
        if (vidx !== -1) videoList[vidx] = serverUrl;
      });

      pendingFiles = [];
      renderImages();
      renderVideos();
      updatePreview();
      isDirty = true;

      if (currentProduct?._id) {
        const persisted = await persistImagesToProduct(token);
        if (persisted) {
          if (typeof showToast === 'function') showToast(`${files.length} image${files.length > 1 ? 's' : ''} saved to product`, 'success');
          return;
        }
        throw new Error('Images uploaded but could not be attached to the product');
      }

      if (typeof showToast === 'function') showToast(`${files.length} image${files.length > 1 ? 's' : ''} saved`, 'success');
    } catch (err) {
      console.error('Save images error:', err);
      if (typeof showToast === 'function') showToast('Failed to save images: ' + err.message, 'error');
    } finally {
      btn.disabled = false;
      btn.innerHTML = originalHtml;
    }
  }

  async function persistImagesToProduct(token) {
    const productId = currentProduct?._id;
    if (!productId) return false;
    const images = imageList
      .filter(url => !url.startsWith('data:'))
      .map((url, i) => ({ url, alt: $('pe-name')?.value?.trim() || 'Product', isPrimary: i === 0 }));
    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/products/${productId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ images })
      });
      if (!res.ok) return false;
      const saved = await res.json();
      if (saved && saved.images) currentProduct = saved;
      return true;
    } catch (err) {
      console.error('Persist images error:', err);
      return false;
    }
  }

  // =========================================================================
  // IMAGES (URL + file)
  // =========================================================================
  function addImageUrl() {
    const input = $('pe-image-url');
    const url = input.value.trim();
    if (!url) return;

    try { new URL(url); } catch {
      if (typeof showToast === 'function') showToast('Please enter a valid URL');
      return;
    }

    if (isGooglePhotosUrl(url)) {
      addGooglePhoto(url);
      return;
    }

    imageList.push(url);
    input.value = '';
    renderImages();
    updatePreview();
    isDirty = true;
  }

  function isGooglePhotosUrl(url) {
    return /^https?:\/\/(photos\.app\.goo\.gl|photos\.google\.com|lh3\.googleusercontent\.com)\//i.test(url);
  }

  async function addGooglePhoto(url) {
    const token = getAuthToken();
    if (!token) {
      if (typeof showToast === 'function') showToast('Please sign in as admin first', 'error');
      return;
    }
    try {
      if (typeof showToast === 'function') showToast('Importing photo from Google Photos...', 'info');
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/import-photo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ url })
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (typeof showToast === 'function') showToast((data.error || 'Failed to import photo') + '. Make sure link sharing is ON for the photo.', 'error');
        return;
      }
      if (typeof showToast === 'function') showToast('Photo imported from Google Photos', 'success');
      const input = $('pe-image-url');
      input.value = '';
      imageList.push(data.url);
      renderImages();
      updatePreview();
      isDirty = true;
    } catch (err) {
      if (typeof showToast === 'function') showToast('Import failed: ' + err.message, 'error');
    }
  }

  function removeImage(index) {
    if (index < imageList.length) {
      const removedUrl = imageList[index];
      pendingFiles = pendingFiles.filter(f => f.dataUrl !== removedUrl);
    }
    imageList.splice(index, 1);
    renderImages();
    updatePreview();
    isDirty = true;
  }

  function moveImage(from, to) {
    if (to < 0 || to >= imageList.length) return;
    const item = imageList.splice(from, 1)[0];
    imageList.splice(to, 0, item);
    renderImages();
    isDirty = true;
  }

  function renderImages() {
    const grid = $('editor-images-grid');
    if (!imageList.length) {
      grid.innerHTML = '<div class="editor-images-empty"><i class="fas fa-image"></i> No images added yet</div>';
      return;
    }

    grid.innerHTML = imageList.map((url, i) => `
      <div class="editor-image-card">
        <img src="${escapeHTML(resolveProductImageUrl(url))}" alt="Image ${i + 1}" onerror="handleProductImageError(this)" />
        <div class="editor-image-actions">
          <button type="button" onclick="window._peMoveImage(${i}, ${i - 1})" title="Move left" ${i === 0 ? 'disabled' : ''}><i class="fas fa-chevron-left"></i></button>
          <span class="editor-image-num">${i === 0 ? 'Primary' : i + 1}</span>
          <button type="button" onclick="window._peMoveImage(${i}, ${i + 1})" title="Move right" ${i === imageList.length - 1 ? 'disabled' : ''}><i class="fas fa-chevron-right"></i></button>
          <button type="button" class="editor-image-remove" onclick="window._peRemoveImage(${i})" title="Remove"><i class="fas fa-times"></i></button>
        </div>
      </div>
    `).join('');
  }

  window._peRemoveImage = removeImage;
  window._peMoveImage = moveImage;

  // =========================================================================
  // VIDEOS
  // =========================================================================
  function addVideoUrl() {
    const input = $('pe-video-url');
    const url = input.value.trim();
    if (!url) return;

    try { new URL(url); } catch {
      if (typeof showToast === 'function') showToast('Please enter a valid URL');
      return;
    }

    videoList.push(url);
    input.value = '';
    renderVideos();
    isDirty = true;
  }

  function removeVideo(index) {
    videoList.splice(index, 1);
    renderVideos();
    isDirty = true;
  }

  function renderVideos() {
    const grid = $('editor-videos-grid');
    if (!videoList.length) {
      grid.innerHTML = '';
      return;
    }

    grid.innerHTML = videoList.map((url, i) => {
      const thumb = getVideoThumb(url);
      const embed = getVideoEmbed(url);
      const isDirect = isDirectVideo(url);
      const label = getYouTubeId(url) ? 'YouTube' : getVimeoId(url) ? 'Vimeo' : isDirect ? 'Video File' : 'Video';
      return `
        <div class="editor-video-card">
          <div class="editor-video-thumb">
            ${thumb ? `<img src="${thumb}" alt="Video ${i + 1}" />` : isDirect ? `<video src="${escapeHTML(url)}" muted></video>` : `<div class="editor-video-icon"><i class="fas fa-video"></i></div>`}
          </div>
          <div class="editor-video-info">
            <span class="editor-video-label">${label}</span>
            <span class="editor-video-url">${escapeHTML(url.length > 50 ? url.slice(0, 50) + '...' : url)}</span>
          </div>
          <button type="button" class="editor-image-remove" onclick="window._peRemoveVideo(${i})" title="Remove"><i class="fas fa-times"></i></button>
        </div>
      `;
    }).join('');
  }

  window._peRemoveVideo = removeVideo;

  // =========================================================================
  // LIVE PREVIEW
  // =========================================================================
  function updatePreview() {
    const name = $('pe-name').value || 'Product Name';
    const price = Number($('pe-price').value) || 0;
    const comparePrice = Number($('pe-compare-price').value) || 0;
    const desc = $('pe-description').value || 'Product description will appear here...';
    const sku = $('pe-sku').value;
    const stock = Number($('pe-stock').value) || 0;
    const isActive = $('pe-active').checked;
    const catId = $('pe-category').value;

    const catName = catId
      ? (categories.find(c => c._id === catId)?.name || 'Category')
      : 'Category';

    const primaryImg = imageList[0] || '';

    $('preview-name').textContent = name;
    $('preview-category').textContent = catName;
    $('preview-price').textContent = formatCurrency(price);
    $('preview-desc').textContent = desc.length > 120 ? desc.slice(0, 120) + '...' : desc;
    $('preview-sku').textContent = 'SKU: ' + (sku || '—');
    $('preview-stock').textContent = 'Stock: ' + stock;
    $('preview-status').textContent = isActive ? 'Active' : 'Inactive';
    $('preview-status').className = 'editor-preview-badge ' + (isActive ? 'badge-active' : 'badge-inactive');

    if (comparePrice > 0 && comparePrice > price) {
      $('preview-compare').textContent = formatCurrency(comparePrice);
      $('preview-compare').style.display = '';
    } else {
      $('preview-compare').style.display = 'none';
    }

    const imgEl = $('preview-image');
    if (primaryImg) {
      imgEl.innerHTML = `<img src="${escapeHTML(resolveProductImageUrl(primaryImg))}" alt="${escapeHTML(name)}" onerror="this.src='${FALLBACK_IMG}'" />`;
    } else {
      imgEl.innerHTML = '<div class="editor-preview-placeholder"><i class="fas fa-image"></i> No image</div>';
    }
  }

  // =========================================================================
  // SAVE
  // =========================================================================
  async function saveProduct({ active = true, redirect = true } = {}) {
    if (saving) return;

    const name = $('pe-name').value.trim();
    const slug = $('pe-slug').value.trim();
    const description = $('pe-description').value.trim();
    const price = Number($('pe-price').value);
    const categoryId = $('pe-category').value;

    if (active) {
      if (!name || !slug || !description || !price || !categoryId) {
        if (typeof showToast === 'function') showToast('Please fill in all required fields to publish');
        return;
      }
    } else {
      if (!name) {
        if (typeof showToast === 'function') showToast('Product name is required even for drafts');
        return;
      }
    }

    saving = true;
    const btnEl = active ? $('btn-save') : $('btn-draft');
    const originalHtml = btnEl.innerHTML;
    btnEl.disabled = true;
    btnEl.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';

    const token = getAuthToken();
    if (!token) { saving = false; btnEl.disabled = false; btnEl.innerHTML = originalHtml; return; }

    const tags = $('pe-tags').value.split(',').map(t => t.trim()).filter(Boolean);
    const seoKeywords = $('pe-seo-keywords').value.split(',').map(t => t.trim()).filter(Boolean);

    let barcode = $('pe-barcode').value.trim();
    if (!barcode) {
      barcode = generateEan13Barcode();
      $('pe-barcode').value = barcode;
    }

    const productData = {
      name,
      slug: slug || name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, ''),
      shortDescription: $('pe-short-desc').value.trim(),
      description: description || ' ',
      price: price || 0,
      comparePrice: Number($('pe-compare-price').value) || 0,
      costPrice: Number($('pe-cost-price').value) || 0,
      shippingCharge: Number($('pe-shipping').value) || 0,
      categoryId: categoryId || undefined,
      brand: $('pe-brand').value.trim(),
      sku: $('pe-sku').value.trim(),
      barcode,
      hsnCode: $('pe-hsn').value.trim(),
      sacCode: $('pe-sac').value.trim(),
      inventory: {
        quantity: Number($('pe-stock').value) || 0,
        lowStockThreshold: Number($('pe-low-stock').value) || 10,
        trackInventory: $('pe-track-inventory').checked
      },
      images: imageList.filter(url => !url.startsWith('data:')).map((url, i) => ({ url, alt: name, isPrimary: i === 0 })),
      videos: videoList.filter(url => !url.startsWith('data:')),
      tags,
      isActive: active,
      isFeatured: $('pe-featured').checked,
      seo: {
        title: $('pe-seo-title').value.trim(),
        description: $('pe-seo-desc').value.trim(),
        keywords: seoKeywords
      }
    };

    try {
      const productId = currentProduct?._id;
      const method = productId ? 'PUT' : 'POST';
      const endpoint = productId
        ? `/api/v1/admin/products/${productId}`
        : '/api/v1/admin/products';

      const hasFiles = pendingFiles.length > 0;

      let res;
      if (hasFiles) {
        const formData = new FormData();
        Object.entries(productData).forEach(([key, val]) => {
          if (val === undefined) return;
          if (key === 'images' || key === 'videos' || key === 'inventory' || key === 'seo' || key === 'tags') {
            formData.append(key, JSON.stringify(val));
          } else {
            formData.append(key, String(val));
          }
        });

        pendingFiles.forEach(f => {
          formData.append('media', f.file);
        });

        res = await fetch(`${API_BASE_URL}${endpoint}`, {
          method,
          headers: { Authorization: `Bearer ${token}` },
          body: formData
        });
      } else {
        res = await fetch(`${API_BASE_URL}${endpoint}`, {
          method,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify(productData)
        });
      }

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to save product');
      }

      const saved = await res.json();
      if (!currentProduct && saved._id) {
        currentProduct = saved;
        $('btn-delete').style.display = '';
        window.history.replaceState(null, '', `product-edit.html?id=${saved._id}`);
        $('breadcrumb-action').textContent = 'Edit Product';
      }

      isDirty = false;
      pendingFiles = [];

      const label = active ? 'Product published!' : 'Draft saved!';
      if (typeof showToast === 'function') showToast(label, 'success');

      if (redirect) {
        setTimeout(() => { window.location.href = 'admin.html'; }, 800);
      } else {
        $('btn-save').innerHTML = '<i class="fas fa-save"></i> Publish';
      }
    } catch (err) {
      console.error('Save product error:', err);
      if (typeof showToast === 'function') showToast('Failed to save: ' + err.message, 'error');
    } finally {
      saving = false;
      $('btn-save').disabled = false;
      $('btn-save').innerHTML = '<i class="fas fa-save"></i> Publish';
      $('btn-draft').disabled = false;
      $('btn-draft').innerHTML = '<i class="fas fa-file"></i> Save Draft';
    }
  }

  // =========================================================================
  // DELETE
  // =========================================================================
  async function deleteProduct() {
    if (!currentProduct?._id) return;

    const token = getAuthToken();
    if (!token) return;

    try {
      const res = await fetch(`${API_BASE_URL}/api/v1/admin/products/${currentProduct._id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });

      if (!res.ok) throw new Error('Failed to delete');

      $('delete-modal').classList.remove('active');
      isDirty = false;
      if (typeof showToast === 'function') showToast('Product deleted');
      setTimeout(() => { window.location.href = 'admin.html'; }, 800);
    } catch (err) {
      console.error('Delete error:', err);
      if (typeof showToast === 'function') showToast('Failed to delete product');
    }
  }
})();
