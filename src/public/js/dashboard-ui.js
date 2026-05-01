document.addEventListener('DOMContentLoaded', () => {
  const appShell = document.getElementById('appShell');
  const sidebar = document.getElementById('sidebar');
  const menuBtn = document.getElementById('menuBtn');
  const collapseBtn = document.getElementById('collapseBtn');
  const themeBtn = document.getElementById('themeBtn');
  const sidebarThemeBtn = document.getElementById('sidebarThemeBtn');
  const sidebarTooltip = document.getElementById('sidebarTooltip');
  if (!appShell || !sidebar) return;

  const navLinks = Array.from(document.querySelectorAll('.nav-link'));
  const isMobile = () => window.innerWidth <= 1024;
  const themeStorageKey = 'dashboard-dark-mode';

  const sync = () => {
    document.documentElement.style.overflowX = 'hidden';
    document.body.style.overflowX = 'hidden';
    sidebar.style.overflowX = isMobile() ? 'hidden' : 'visible';
  };

  const hideTip = () => sidebarTooltip && sidebarTooltip.classList.remove('show');
  const showTip = (target) => {
    if (!sidebarTooltip || !appShell.classList.contains('sidebar-collapsed') || isMobile()) return hideTip();
    const rect = target.getBoundingClientRect();
    sidebarTooltip.textContent = target.dataset.label || '';
    sidebarTooltip.style.left = `${rect.right + 14}px`;
    sidebarTooltip.style.top = `${rect.top + rect.height / 2}px`;
    sidebarTooltip.classList.add('show');
  };

  const safeParse = (value, fallback = []) => {
    try {
      return JSON.parse(value || '[]');
    } catch {
      return fallback;
    }
  };

  const parseNumberArray = (value) => safeParse(value, []).map((item) => Number(item || 0));

  const getThemeColors = () => {
    const rootStyles = getComputedStyle(document.documentElement);
    const bodyStyles = getComputedStyle(document.body);
    return {
      stroke: rootStyles.getPropertyValue('--primary').trim() || '#cd7700',
      mutedStroke: bodyStyles.getPropertyValue('--muted').trim() || '#94a3b8',
      gridStroke: document.body.classList.contains('dark-mode') ? 'rgba(148, 163, 184, 0.16)' : 'rgba(148, 163, 184, 0.2)',
      panelStroke: bodyStyles.getPropertyValue('--panel').trim() || '#ffffff'
    };
  };

  const drawEmptyState = (ctx, vw, vh, message, color) => {
    ctx.clearRect(0, 0, vw, vh);
    ctx.fillStyle = color;
    ctx.font = '600 13px Poppins, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(message, vw / 2, vh / 2);
    ctx.textAlign = 'left';
  };

  const drawChart = (canvas) => {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const labels = safeParse(canvas.dataset.labels, []);
    const values = parseNumberArray(canvas.dataset.values);
    const type = canvas.dataset.chartType || 'bar';
    const width = canvas.width;
    const height = canvas.height;
    const ratio = window.devicePixelRatio || 1;
    const theme = getThemeColors();

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.scale(ratio, ratio);

    const vw = width / ratio;
    const vh = height / ratio;
    const hasData = Array.isArray(values) && values.length > 0 && values.some((value) => Number(value) > 0);
    const max = Math.max(1, ...values, 0);
    const left = 34;
    const right = 16;
    const top = 14;
    const bottom = 32;
    const chartW = Math.max(20, vw - left - right);
    const chartH = Math.max(20, vh - top - bottom);

    ctx.font = '12px Poppins, sans-serif';
    ctx.lineWidth = 1;
    ctx.textBaseline = 'alphabetic';

    if (!hasData) {
      drawEmptyState(ctx, vw, vh, 'No data yet', theme.mutedStroke);
      return;
    }

    if (type === 'line' || type === 'bar') {
      ctx.strokeStyle = theme.gridStroke;
      for (let i = 0; i < 4; i += 1) {
        const y = top + (chartH / 3) * i;
        ctx.beginPath();
        ctx.moveTo(left, y);
        ctx.lineTo(left + chartW, y);
        ctx.stroke();
      }
    }

    if (type === 'bar') {
      const count = Math.max(values.length, 1);
      const barGap = Math.max(8, (chartW / count) * 0.18);
      const slot = chartW / count;
      const barW = Math.max(16, slot - barGap);
      values.forEach((value, index) => {
        const x = left + slot * index + (slot - barW) / 2;
        const y = top + chartH - (value / max) * chartH;
        const barHeight = top + chartH - y;
        ctx.fillStyle = theme.stroke;
        ctx.globalAlpha = 0.9;
        ctx.fillRect(x, y, barW, barHeight);
        ctx.globalAlpha = 1;
        ctx.fillStyle = theme.mutedStroke;
        ctx.fillText((labels[index] || '').slice(0, 10), x, vh - 10);
      });
      return;
    }

    if (type === 'line') {
      const step = values.length > 1 ? chartW / (values.length - 1) : chartW;
      ctx.strokeStyle = theme.stroke;
      ctx.lineWidth = 3;
      ctx.beginPath();
      values.forEach((value, index) => {
        const x = left + step * index;
        const y = top + chartH - (value / max) * chartH;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      values.forEach((value, index) => {
        const x = left + step * index;
        const y = top + chartH - (value / max) * chartH;
        ctx.fillStyle = theme.panelStroke;
        ctx.beginPath();
        ctx.arc(x, y, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = theme.stroke;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = theme.mutedStroke;
        ctx.fillText((labels[index] || '').slice(5), Math.max(6, x - 14), vh - 10);
      });
      return;
    }

    if (type === 'donut') {
      const cx = vw / 2;
      const cy = vh / 2 - 10;
      const radius = Math.min(vw, vh) / 2.7;
      const lineW = Math.max(18, radius * 0.35);
      const palette = [theme.stroke, '#94a3b8', '#e5e7eb', '#f59e0b'];
      const total = Math.max(1, values.reduce((sum, value) => sum + value, 0));
      let start = -Math.PI / 2;

      values.forEach((value, index) => {
        const angle = (value / total) * Math.PI * 2;
        ctx.beginPath();
        ctx.strokeStyle = palette[index % palette.length];
        ctx.lineWidth = lineW;
        ctx.arc(cx, cy, radius, start, start + angle);
        ctx.stroke();
        start += angle;
      });

      ctx.fillStyle = theme.stroke;
      ctx.font = '700 18px Poppins, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(String(values[0] || 0), cx, cy + 4);
      ctx.font = '12px Poppins, sans-serif';
      ctx.fillStyle = theme.mutedStroke;
      ctx.fillText(labels[0] || 'Published', cx, cy + 22);
      ctx.textAlign = 'left';
    }
  };

  const resizeCharts = () => {
    document.querySelectorAll('canvas.simpleChart').forEach((canvas) => {
      const parent = canvas.parentElement;
      if (!parent) return;
      const ratio = window.devicePixelRatio || 1;
      const rect = parent.getBoundingClientRect();
      const drawWidth = Math.max(240, Math.floor(rect.width));
      const drawHeight = Math.max(180, Math.floor(rect.height || parent.offsetHeight || 180));
      canvas.width = drawWidth * ratio;
      canvas.height = drawHeight * ratio;
      canvas.style.width = `${drawWidth}px`;
      canvas.style.height = `${drawHeight}px`;
      drawChart(canvas);
    });
  };

  const applyStoredTheme = () => {
    const storedTheme = localStorage.getItem(themeStorageKey);
    const preloadDark = document.documentElement.classList.contains('dashboard-theme-dark');
    if (storedTheme === 'dark' || preloadDark) document.body.classList.add('dark-mode');
    if (storedTheme === 'light') document.body.classList.remove('dark-mode');
    document.documentElement.classList.toggle('dashboard-theme-dark', document.body.classList.contains('dark-mode'));
  };

  const updateIcons = () => {
    if (menuBtn) menuBtn.textContent = isMobile() && sidebar.classList.contains('show') ? '✕' : '☰';
    if (collapseBtn) collapseBtn.textContent = isMobile() ? (sidebar.classList.contains('show') ? '✕' : '>') : (appShell.classList.contains('sidebar-collapsed') ? '>' : '<');
  };

  const toggleTheme = () => {
    document.body.classList.toggle('dark-mode');
    const isDark = document.body.classList.contains('dark-mode');
    document.documentElement.classList.toggle('dashboard-theme-dark', isDark);
    localStorage.setItem(themeStorageKey, isDark ? 'dark' : 'light');
    resizeCharts();
  };

  menuBtn?.addEventListener('click', () => {
    if (!isMobile()) return;
    sidebar.classList.toggle('show');
    updateIcons();
    sync();
  });

  collapseBtn?.addEventListener('click', () => {
    if (isMobile()) sidebar.classList.toggle('show');
    else {
      appShell.classList.toggle('sidebar-collapsed');
      hideTip();
    }
    updateIcons();
    sync();
  });

  themeBtn?.addEventListener('click', toggleTheme);
  sidebarThemeBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    toggleTheme();
  });

  navLinks.forEach((link) => {
    link.addEventListener('mouseenter', () => showTip(link));
    link.addEventListener('mouseleave', hideTip);
    link.addEventListener('focus', () => showTip(link));
    link.addEventListener('blur', hideTip);
  });

  window.addEventListener('resize', () => {
    if (!isMobile()) sidebar.classList.remove('show');
    hideTip();
    updateIcons();
    sync();
    resizeCharts();
  });

  applyStoredTheme();
  sync();
  updateIcons();
  resizeCharts();
});
