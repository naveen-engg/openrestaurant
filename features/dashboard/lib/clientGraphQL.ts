'use client'

/**
 * Client-side GraphQL execution helper that transparently handles file uploads
 * using the GraphQL multipart request specification directly from the browser.
 */

function checkForFileUploads(obj: any): boolean {
  if (!obj || typeof obj !== 'object') return false;
  if (typeof File !== 'undefined' && obj instanceof File) return true;
  if (typeof Blob !== 'undefined' && obj instanceof Blob) return true;
  if (Array.isArray(obj)) {
    return obj.some(checkForFileUploads);
  }
  if (obj.upload && ((typeof File !== 'undefined' && obj.upload instanceof File) || (typeof Blob !== 'undefined' && obj.upload instanceof Blob))) {
    return true;
  }
  return Object.values(obj).some(checkForFileUploads);
}

function nullifyUploads(obj: any): void {
  if (!obj || typeof obj !== 'object') return;
  if (Array.isArray(obj)) {
    obj.forEach(nullifyUploads);
    return;
  }
  if (obj.upload && typeof obj.upload === 'object') {
    obj.upload = null;
    return;
  }
  Object.entries(obj).forEach(([, value]) => {
    if (typeof value === 'object' && value !== null) {
      nullifyUploads(value);
    }
  });
}

function collectFileUploads(
  originalObj: any,
  nullifiedObj: any,
  path: string,
  uploadFiles: (File | Blob)[],
  map: Record<string, string[]>
): void {
  if (!originalObj || typeof originalObj !== 'object') return;

  if (Array.isArray(originalObj)) {
    originalObj.forEach((item, index) => {
      collectFileUploads(
        item,
        nullifiedObj[index],
        `${path}[${index}]`,
        uploadFiles,
        map
      );
    });
    return;
  }

  if (originalObj.upload && ((typeof File !== 'undefined' && originalObj.upload instanceof File) || (typeof Blob !== 'undefined' && originalObj.upload instanceof Blob))) {
    const fileIndex = uploadFiles.length;
    uploadFiles.push(originalObj.upload);
    const uploadPath = path ? `variables.${path}.upload` : 'variables.upload';
    map[fileIndex + 1] = [uploadPath];
    return;
  }

  Object.entries(originalObj).forEach(([key, value]) => {
    const newPath = path ? `${path}.${key}` : key;
    if ((typeof File !== 'undefined' && value instanceof File) || (typeof Blob !== 'undefined' && value instanceof Blob)) {
      const fileIndex = uploadFiles.length;
      uploadFiles.push(value);
      const uploadPath = `variables.${newPath}`;
      map[fileIndex + 1] = [uploadPath];
    } else if (
      typeof value === 'object' &&
      value !== null &&
      nullifiedObj[key] !== undefined
    ) {
      collectFileUploads(value, nullifiedObj[key], newPath, uploadFiles, map);
    }
  });
}

export async function executeClientMutation<T = any>(
  query: string,
  variables: Record<string, unknown> = {}
): Promise<{ success: boolean; data?: T; errors?: Array<{ message: string; path?: any }> }> {
  try {
    const hasFiles = checkForFileUploads(variables);

    if (hasFiles) {
      const uploadFiles: (File | Blob)[] = [];
      const map: Record<string, string[]> = {};
      const variablesCopy = JSON.parse(JSON.stringify(variables, (key, value) => {
        if (typeof File !== 'undefined' && value instanceof File) return null;
        if (typeof Blob !== 'undefined' && value instanceof Blob) return null;
        return value;
      }));

      collectFileUploads(variables, variablesCopy, '', uploadFiles, map);

      const formData = new FormData();
      formData.append(
        'operations',
        JSON.stringify({
          query,
          variables: variablesCopy,
        })
      );
      formData.append('map', JSON.stringify(map));

      uploadFiles.forEach((file, index) => {
        formData.append(`${index + 1}`, file);
      });

      const response = await fetch('/api/graphql', {
        method: 'POST',
        credentials: 'include',
        body: formData,
      });

      const json = await response.json();
      if (json.errors?.length) {
        return {
          success: false,
          errors: json.errors,
        };
      }

      return {
        success: true,
        data: json.data,
      };
    }

    // Standard JSON fetch for mutations without files
    const response = await fetch('/api/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ query, variables }),
    });

    const json = await response.json();
    if (json.errors?.length) {
      return {
        success: false,
        errors: json.errors,
      };
    }

    return {
      success: true,
      data: json.data,
    };
  } catch (error: any) {
    return {
      success: false,
      errors: [{ message: error?.message || 'Network error occurred' }],
    };
  }
}
