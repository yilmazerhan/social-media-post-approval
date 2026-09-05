import { ApiError } from '@shared/api/http';

/**
 * Sends the bytes of one file and reports progress.
 *
 * <p>XMLHttpRequest rather than fetch: upload progress events are the one thing fetch still cannot
 * report, and a 500 MB video without a progress bar is an unusable experience.
 */
export function uploadBytes(
  url: string,
  method: string,
  file: File,
  headers: Record<string, string>,
  onProgress: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open(method, url, true);
    request.withCredentials = true;

    Object.entries(headers).forEach(([key, value]) => request.setRequestHeader(key, value));
    const csrf = document.cookie
      .split('; ')
      .find((entry) => entry.startsWith('XSRF-TOKEN='))
      ?.split('=')[1];
    if (csrf) request.setRequestHeader('X-XSRF-TOKEN', decodeURIComponent(csrf));

    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) {
        onProgress(100);
        resolve();
        return;
      }
      let problem: { status: number; detail?: string; code?: string } = { status: request.status };
      try {
        problem = { ...problem, ...JSON.parse(request.responseText) };
      } catch {
        // A gateway error body is not JSON; the status alone is enough to explain the failure.
      }
      reject(new ApiError(problem));
    };
    request.onerror = () =>
      reject(new ApiError({ status: 0, detail: 'The upload could not reach the server.' }));
    request.onabort = () => reject(new ApiError({ status: 0, detail: 'Upload cancelled.' }));

    signal?.addEventListener('abort', () => request.abort());
    request.send(file);
  });
}

/** Reads duration and dimensions in the browser, so a video card can show them immediately. */
export function probeMedia(
  file: File,
): Promise<{ durationSeconds?: number; width?: number; height?: number }> {
  return new Promise((resolve) => {
    if (file.type.startsWith('video/')) {
      const element = document.createElement('video');
      element.preload = 'metadata';
      element.onloadedmetadata = () => {
        URL.revokeObjectURL(element.src);
        resolve({
          durationSeconds: Math.round(element.duration),
          width: element.videoWidth,
          height: element.videoHeight,
        });
      };
      element.onerror = () => resolve({});
      element.src = URL.createObjectURL(file);
      return;
    }
    if (file.type.startsWith('image/')) {
      const image = new Image();
      image.onload = () => {
        URL.revokeObjectURL(image.src);
        resolve({ width: image.naturalWidth, height: image.naturalHeight });
      };
      image.onerror = () => resolve({});
      image.src = URL.createObjectURL(file);
      return;
    }
    resolve({});
  });
}
