document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('listingWizardForm');
  if (!form) return;

  const panels = Array.from(form.querySelectorAll('.wizardPanel'));
  const chips = Array.from(document.querySelectorAll('.wizardStepChip'));
  const nextBtn = document.getElementById('wizardNextBtn');
  const prevBtn = document.getElementById('wizardPrevBtn');
  const submitBtn = document.getElementById('wizardSubmitBtn');
  const statusNode = document.getElementById('autosaveStatus');
  const storageKey = form.dataset.autosaveKey || 'listing-create-draft';
  const fields = Array.from(form.querySelectorAll('input[name], select[name], textarea[name]')).filter((field) => field.type !== 'hidden' && field.type !== 'file');
  const categoryInput = form.querySelector('[name="category"]');
  let currentStep = 0;
  let saveTimer = null;

  const setStatus = (text) => {
    if (statusNode) statusNode.textContent = text;
  };

  const showStep = (index) => {
    currentStep = Math.max(0, Math.min(index, panels.length - 1));
    panels.forEach((panel, panelIndex) => panel.classList.toggle('active', panelIndex === currentStep));
    chips.forEach((chip, chipIndex) => chip.classList.toggle('active', chipIndex === currentStep));
    if (prevBtn) prevBtn.style.visibility = currentStep === 0 ? 'hidden' : 'visible';
    if (nextBtn) nextBtn.style.display = currentStep === panels.length - 1 ? 'none' : 'inline-flex';
    if (submitBtn) submitBtn.style.display = currentStep === panels.length - 1 ? 'inline-flex' : 'none';
    const firstField = panels[currentStep]?.querySelector('input, select, textarea');
    if (firstField) firstField.focus({ preventScroll: true });
    localStorage.setItem(`${storageKey}:step`, String(currentStep));
  };

  const saveDraft = () => {
    const payload = {};
    fields.forEach((field) => {
      if ((field.type === 'checkbox' || field.type === 'radio')) {
        payload[field.name] = field.checked;
      } else {
        payload[field.name] = field.value;
      }
    });
    localStorage.setItem(storageKey, JSON.stringify(payload));
    setStatus(`Autosaved at ${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`);
  };

  const scheduleSave = () => {
    setStatus('Saving draft...');
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveDraft, 250);
  };

  const restoreDraft = () => {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return;
    try {
      const draft = JSON.parse(raw);
      fields.forEach((field) => {
        if (!(field.name in draft)) return;
        if ((field.type === 'checkbox' || field.type === 'radio')) {
          field.checked = Boolean(draft[field.name]);
        } else if (!field.value) {
          field.value = draft[field.name] ?? '';
        }
      });
      setStatus('Draft restored');
    } catch {
      setStatus('Autosave ready');
    }
  };

  const syncCategoryFields = () => {
    const category = categoryInput?.value || '';
    form.querySelectorAll('[data-category-group]').forEach((node) => {
      const allowed = String(node.dataset.categoryGroup || '').split(/\s+/).filter(Boolean);
      const visible = !allowed.length || allowed.includes(category);
      node.style.display = visible ? '' : 'none';
      node.querySelectorAll('input, select, textarea').forEach((field) => {
        field.disabled = !visible;
      });
    });
  };

  const validateCurrentStep = () => {
    const activePanel = panels[currentStep];
    if (!activePanel) return true;
    const requiredFields = Array.from(activePanel.querySelectorAll('[required]'));
    const invalidField = requiredFields.find((field) => !field.value);
    if (invalidField) {
      invalidField.focus();
      invalidField.reportValidity?.();
      return false;
    }
    return true;
  };

  function openConfirm(message, onConfirm) {
    let modal = document.getElementById('wizardConfirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'wizardConfirmModal';
      modal.style.cssText = 'position:fixed;inset:0;z-index:500;display:none;place-items:center;background:rgba(2,6,16,.62);padding:16px;';
      modal.innerHTML = `
        <div role="dialog" aria-modal="true" style="width:min(420px,100%);border:1px solid var(--line);background:var(--card2,#fff);border-radius:18px;box-shadow:var(--shadow);overflow:hidden">
          <div style="display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 16px;border-bottom:1px solid var(--line)"><b>Confirm action</b><button class="btn alt" type="button" data-confirm-cancel aria-label="Close">×</button></div>
          <div style="padding:16px;display:grid;gap:12px">
            <p class="muted" data-confirm-text style="margin:0"></p>
            <div class="actionRow"><button class="btn alt" type="button" data-confirm-cancel>Cancel</button><button class="btn" type="button" data-confirm-ok>Continue</button></div>
          </div>
        </div>`;
      document.body.appendChild(modal);
      modal.addEventListener('click', (event) => {
        if (event.target === modal || event.target.closest('[data-confirm-cancel]')) modal.style.display = 'none';
      });
    }
    modal.querySelector('[data-confirm-text]').textContent = message;
    modal.querySelector('[data-confirm-ok]').onclick = () => {
      modal.style.display = 'none';
      onConfirm();
    };
    modal.style.display = 'grid';
  }

  document.addEventListener('click', (event) => {
    const trigger = event.target.closest('[data-confirm-message]');
    if (!trigger) return;
    event.preventDefault();
    openConfirm(trigger.dataset.confirmMessage || 'Continue?', () => {
      const formId = trigger.getAttribute('form');
      const targetForm = formId ? document.getElementById(formId) : trigger.closest('form');
      targetForm?.requestSubmit ? targetForm.requestSubmit() : targetForm?.submit();
    });
  });

  fields.forEach((field) => {
    field.addEventListener('input', scheduleSave);
    field.addEventListener('change', scheduleSave);
  });
  categoryInput?.addEventListener('change', syncCategoryFields);

  chips.forEach((chip, index) => {
    chip.addEventListener('click', () => {
      if (index > currentStep && !validateCurrentStep()) return;
      showStep(index);
    });
  });

  nextBtn?.addEventListener('click', () => {
    if (!validateCurrentStep()) return;
    saveDraft();
    showStep(currentStep + 1);
  });

  prevBtn?.addEventListener('click', () => showStep(currentStep - 1));

  form.addEventListener('submit', (event) => {
    const firstInvalidStep = panels.findIndex((panel) => Array.from(panel.querySelectorAll('[required]')).some((field) => !field.value));
    if (firstInvalidStep !== -1) {
      event.preventDefault();
      showStep(firstInvalidStep);
      const invalidField = panels[firstInvalidStep].querySelector('[required]:invalid, [required]');
      invalidField?.focus();
      invalidField?.reportValidity?.();
      setStatus('Complete the required fields before saving.');
      return;
    }
    localStorage.removeItem(storageKey);
    localStorage.removeItem(`${storageKey}:step`);
    setStatus('Submitting listing...');
  });

  restoreDraft();
  const restoredStep = Number(localStorage.getItem(`${storageKey}:step`) || 0);
  syncCategoryFields();
  showStep(Number.isFinite(restoredStep) ? restoredStep : 0);
});
