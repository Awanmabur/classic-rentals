(function () {
  const body = document.body;
  const themeToggle = document.getElementById('themeToggle');
  const mobileMenuBtn = document.getElementById('mobileMenuBtn');
  const mobileMenu = document.getElementById('mobileMenu');
  const toast = document.getElementById('toast');
  const listings = Array.isArray(window.__HOME_LISTINGS__) ? window.__HOME_LISTINGS__ : [];
  const isAuthenticated = Boolean(window.__IS_AUTHENTICATED__);

  const listingModal = document.getElementById('listingModal');
  const inquiryModal = document.getElementById('inquiryModal');
  const closeListingModal = document.getElementById('closeListingModal');
  const closeInquiryModal = document.getElementById('closeInquiryModal');
  const openInquiryBtn = document.getElementById('openInquiryBtn');
  const inquiryForm = document.getElementById('homeInquiryForm');

  let activeListingId = null;

  function syncModalState() {
    const hasOpenModal = [listingModal, inquiryModal].some((node) => node && node.classList.contains('show'));
    body.classList.toggle('modalOpen', hasOpenModal);
  }

  function resetModalState() {
    [listingModal, inquiryModal].forEach((node) => node && node.classList.remove('show'));
    body.classList.remove('modalOpen');
  }

  function showToast(message, error) {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.toggle('error', Boolean(error));
    toast.classList.add('show');
    clearTimeout(showToast._t);
    showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('cr_theme', theme);
  }

  const storedTheme = localStorage.getItem('cr_theme');
  if (storedTheme) applyTheme(storedTheme);

  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-theme') || 'dark';
      applyTheme(current === 'dark' ? 'light' : 'dark');
    });
  }

  if (mobileMenuBtn && mobileMenu) {
    mobileMenuBtn.addEventListener('click', () => mobileMenu.classList.toggle('open'));
  }

  document.addEventListener('click', async (e) => {
    const favBtn = e.target.closest('[data-favorite-id]');
    if (favBtn) {
      if (!isAuthenticated) {
        showToast('Please log in to save favorites.', true);
        setTimeout(() => { window.location.href = '/auth/login'; }, 700);
        return;
      }
      try {
        const id = favBtn.getAttribute('data-favorite-id');
        const res = await fetch(`/api/favorites/${id}/toggle`, { method: 'POST' });
        const data = await res.json();
        if (data && data.success) {
          document.querySelectorAll(`[data-favorite-id="${id}"]`).forEach(el => el.classList.toggle('active', data.active));
          showToast(data.message || 'Updated favorites');
        } else {
          showToast(data.message || 'Could not update favorite', true);
        }
      } catch (err) {
        showToast('Something went wrong updating favorites.', true);
      }
      return;
    }

    const openBtn = e.target.closest('[data-open-listing]');
    if (openBtn) {
      const listingId = openBtn.getAttribute('data-open-listing');
      const item = listings.find(x => String(x._id) === String(listingId));
      if (item && listingModal) {
        activeListingId = listingId;
        hydrateListingModal(item);
        listingModal.classList.add('show');
        syncModalState();
      }
    }

    if (e.target === listingModal) closeModal(listingModal);
    if (e.target === inquiryModal) closeModal(inquiryModal);
  });

  function closeModal(node) {
    if (!node) return;
    node.classList.remove('show');
    syncModalState();
  }

  if (closeListingModal) closeListingModal.addEventListener('click', () => closeModal(listingModal));
  if (closeInquiryModal) closeInquiryModal.addEventListener('click', () => closeModal(inquiryModal));
  if (openInquiryBtn) {
    openInquiryBtn.addEventListener('click', () => {
      closeModal(listingModal);
      if (inquiryModal) {
        inquiryModal.classList.add('show');
        syncModalState();
      }
    });
  }

  function hydrateListingModal(item) {
    const primary = Array.isArray(item.images) && item.images.length ? (item.images.find(i => i.isPrimary) || item.images[0]) : null;
    const badges = document.getElementById('modalBadges');
    const meta = document.getElementById('modalMeta');
    document.getElementById('modalImage').src = primary ? primary.url : 'https://images.unsplash.com/photo-1560518883-ce09059eeffa?q=80&w=1600&auto=format&fit=crop';
    document.getElementById('modalTitle').textContent = item.title || 'Listing';
    document.getElementById('modalLocation').textContent = [item.location?.area, item.location?.city].filter(Boolean).join(', ');
    document.getElementById('modalPrice').textContent = `${item.price?.currency || 'USD'} ${Number(item.price?.amount || 0).toLocaleString()}`;
    document.getElementById('modalUnit').textContent = item.price?.unit === 'one-time' ? 'One time' : '/' + (item.price?.unit || 'month');
    document.getElementById('modalDescription').textContent = item.description || '';
    document.getElementById('modalOpenLink').href = `/listings/${item.slug}`;

    if (badges) {
      badges.innerHTML = '';
      if (item.verified) badges.insertAdjacentHTML('beforeend', '<span class="b ok">Verified</span>');
      if (item.featured) badges.insertAdjacentHTML('beforeend', '<span class="b feat">Featured</span>');
      if (item.category) badges.insertAdjacentHTML('beforeend', `<span class="b">${item.category}</span>`);
      if (item.purpose) badges.insertAdjacentHTML('beforeend', `<span class="b">${item.purpose}</span>`);
    }

    if (meta) {
      const parts = [];
      if (item.specs?.bedrooms) parts.push(`${item.specs.bedrooms} bed`);
      if (item.specs?.bathrooms) parts.push(`${item.specs.bathrooms} bath`);
      if (item.specs?.sizeSqm) parts.push(`${item.specs.sizeSqm} sqm`);
      if (item.specs?.year) parts.push(String(item.specs.year));
      meta.innerHTML = parts.map(p => `<span>${p}</span>`).join('');
    }
  }

  resetModalState();
  window.addEventListener('pageshow', resetModalState);
  window.addEventListener('load', syncModalState);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) syncModalState();
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeModal(listingModal);
      closeModal(inquiryModal);
    }
  });

  if (inquiryForm) {
    inquiryForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (!activeListingId) return showToast('Choose a listing first.', true);
      try {
        const bodyData = Object.fromEntries(new FormData(inquiryForm).entries());
        const res = await fetch(`/api/inquiries/listing/${activeListingId}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(bodyData),
        });
        const data = await res.json();
        if (data.success) {
          showToast(data.message || 'Inquiry sent successfully');
          inquiryForm.reset();
          closeModal(inquiryModal);
        } else {
          showToast(data.message || 'Could not send inquiry', true);
        }
      } catch {
        showToast('Could not send inquiry right now.', true);
      }
    });
  }

  const slides = Array.from(document.querySelectorAll('.heroSlide'));
  const dots = Array.from(document.querySelectorAll('.dotBtn'));
  let slideIndex = 0;
  function setSlide(next) {
    if (!slides.length) return;
    slideIndex = (next + slides.length) % slides.length;
    slides.forEach((slide, i) => slide.classList.toggle('active', i === slideIndex));
    dots.forEach((dot, i) => dot.classList.toggle('active', i === slideIndex));
  }
  dots.forEach((dot, i) => dot.addEventListener('click', () => setSlide(i)));
  if (slides.length > 1) setInterval(() => setSlide(slideIndex + 1), 5000);
})();
