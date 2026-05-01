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

  fields.forEach((field) => {
    field.addEventListener('input', scheduleSave);
    field.addEventListener('change', scheduleSave);
  });

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
  showStep(Number.isFinite(restoredStep) ? restoredStep : 0);
});
