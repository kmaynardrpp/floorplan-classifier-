export const VALID_IMAGE_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
] as const
export const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024 // 50 MB
export const MAX_FILE_SIZE_MB = 50

export type ValidationErrorType =
  | 'invalid_type'
  | 'file_too_large'
  | 'empty_file'

export interface ValidationError {
  type: ValidationErrorType
  message: string
}

export interface ValidationResult {
  valid: boolean
  error?: ValidationError
}

export function validateImageFile(file: File): ValidationResult {
  // Check for empty file
  if (file.size === 0) {
    return {
      valid: false,
      error: {
        type: 'empty_file',
        message:
          'The selected file is empty. Please choose a valid image file.',
      },
    }
  }

  // Check file type
  if (
    !VALID_IMAGE_TYPES.includes(file.type as (typeof VALID_IMAGE_TYPES)[number])
  ) {
    return {
      valid: false,
      error: {
        type: 'invalid_type',
        message: `Invalid file type "${file.type || 'unknown'}". Please upload a JPEG or PNG image.`,
      },
    }
  }

  // Check file size
  if (file.size > MAX_FILE_SIZE_BYTES) {
    const fileSizeMB = (file.size / (1024 * 1024)).toFixed(1)
    return {
      valid: false,
      error: {
        type: 'file_too_large',
        message: `File size (${fileSizeMB} MB) exceeds the maximum allowed size of ${MAX_FILE_SIZE_MB} MB. Please resize or compress the image.`,
      },
    }
  }

  return { valid: true }
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result)
      } else {
        reject(new Error('Failed to read file as data URL'))
      }
    }
    reader.onerror = () => {
      reject(new Error('Error reading file'))
    }
    reader.readAsDataURL(file)
  })
}
