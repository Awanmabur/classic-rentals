(function () {
  function ready(fn) {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', fn);
    else fn();
  }

  ready(function () {
    const body = document.body;
    const dashboardApp = document.getElementById('dashboardApp');
    const sidebar = document.getElementById('dashboardSidebar') || document.querySelector('.dashboardSidebar, .sidebar');
    const drawerMask = document.getElementById('dashboardDrawerMask');

    document.querySelectorAll('[data-nav-path]').forEach(function (link) {
      const target = link.getAttribute('data-nav-path');
      if (target && (window.location.pathname === target || (target !== '/' && window.location.pathname.startsWith(target)))) {
        link.classList.add('active');
        link.classList.add('isActive');
      }
    });

    if (!dashboardApp || !sidebar) return;

    const topToggle = document.getElementById('dashboardMenuToggle');
    let floatingBtn = document.getElementById('dashboardFabToggle');

    function syncToggleState(open) {
      const label = open ? '✕' : '☰';
      const aria = open ? 'Close dashboard menu' : 'Open dashboard menu';
      [topToggle, floatingBtn].forEach(function (btn) {
        if (!btn) return;
        btn.textContent = label;
        btn.setAttribute('aria-label', aria);
        btn.classList.toggle('isOpen', open);
      });
    }

    function setDrawer(open) {
      sidebar.classList.toggle('open', open);
      if (drawerMask) drawerMask.classList.toggle('show', open);
      body.classList.toggle('modalOpen', open);
      syncToggleState(open);
    }

    function toggleDrawer() {
      setDrawer(!sidebar.classList.contains('open'));
    }

    if (!topToggle && !floatingBtn) {
      floatingBtn = document.createElement('button');
      floatingBtn.type = 'button';
      floatingBtn.id = 'dashboardFabToggle';
      floatingBtn.className = 'dashboardFabToggle mobileOnlyDash';
      document.body.appendChild(floatingBtn);
    }

    [topToggle, floatingBtn].forEach(function (btn) {
      if (!btn) return;
      btn.addEventListener('click', toggleDrawer);
    });

    if (drawerMask) drawerMask.addEventListener('click', function () { setDrawer(false); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') setDrawer(false);
    });
    window.addEventListener('resize', function () {
      if (window.innerWidth > 900) setDrawer(false);
    });

    syncToggleState(false);
  });
})();
