import Swal from 'sweetalert2';
import 'sweetalert2/dist/sweetalert2.min.css';

const baseOptions = {
  buttonsStyling: false,
  customClass: {
    popup: 'app-swal-popup',
    title: 'app-swal-title',
    htmlContainer: 'app-swal-copy',
    actions: 'app-swal-actions',
    confirmButton: 'app-swal-confirm',
    cancelButton: 'app-swal-cancel'
  }
};

export async function confirmAction({
  title,
  text,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  danger = false,
  requireExplicit = false
}) {
  const result = await Swal.fire({
    ...baseOptions,
    icon: danger ? 'warning' : 'question',
    title,
    text,
    showCancelButton: true,
    confirmButtonText: confirmText,
    cancelButtonText: cancelText,
    allowOutsideClick: !requireExplicit,
    allowEscapeKey: !requireExplicit,
    customClass: {
      ...baseOptions.customClass,
      confirmButton: danger ? 'app-swal-confirm app-swal-danger' : 'app-swal-confirm'
    }
  });

  return result.isConfirmed;
}

export function showSuccess(title, text = '') {
  return Swal.fire({
    ...baseOptions,
    icon: 'success',
    title,
    text,
    confirmButtonText: 'Done'
  });
}

export function showError(title, text = '') {
  return Swal.fire({
    ...baseOptions,
    icon: 'error',
    title,
    text,
    confirmButtonText: 'Close'
  });
}

export function showInfo(title, text = '') {
  return Swal.fire({
    ...baseOptions,
    icon: 'info',
    title,
    text,
    confirmButtonText: 'OK'
  });
}

export function showToast(title, icon = 'success') {
  return Swal.fire({
    toast: true,
    position: 'top-end',
    icon,
    title,
    showConfirmButton: false,
    timer: 2600,
    timerProgressBar: true,
    customClass: {
      popup: 'app-swal-toast'
    }
  });
}
