import type { KeyboardEvent } from 'react';

export function handleEnterToNext(e: KeyboardEvent<HTMLDivElement>) {
  if (e.key === 'Enter') {
    const target = e.target as HTMLElement;
    // Only intercept for single-line inputs and selects
    if (target.tagName === 'INPUT' || target.tagName === 'SELECT') {
      e.preventDefault();
      
      // Find all focusable form elements within the current container
      const formElements = Array.from(
        e.currentTarget.querySelectorAll('input:not([disabled]), select:not([disabled]), textarea:not([disabled]), button.btn-primary:not([disabled])')
      ) as HTMLElement[];
      
      const index = formElements.indexOf(target);
      if (index > -1) {
        // Focus the next element if there is one
        if (index < formElements.length - 1) {
          formElements[index + 1].focus();
        } else {
          // If it's the last element, try to click the primary button (submit)
          const submitBtn = e.currentTarget.querySelector('button.btn-primary:not([disabled])') as HTMLButtonElement;
          if (submitBtn) submitBtn.click();
        }
      }
    }
  }
}
